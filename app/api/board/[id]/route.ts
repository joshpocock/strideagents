import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getTask, updateTask, deleteTask } from "@/lib/db";

/**
 * PATCH /api/board/:id
 *
 * Update a task's status or other fields.
 *
 * When status changes to "in_progress", the handler:
 *   1. Creates a new Anthropic session for the task's agent
 *   2. Sends the task description as the first message
 *   3. Stores the session_id on the task for later streaming
 *
 * Body: { status?, result?, agent_id?, environment_id? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const body = await request.json();
    const { status, result, agent_id, environment_id } = body;

    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // When transitioning to in_progress, spin up a session and kick it off
    if (status === "in_progress" && task.status !== "in_progress") {
      const effectiveAgentId = agent_id || task.agent_id;
      if (!effectiveAgentId) {
        return NextResponse.json(
          { error: "agent_id is required to start a task" },
          { status: 400 }
        );
      }

      const client = getClient();

      // environment_id is required. Try the request, the task, or fall back to
      // Preference order: explicit body → task row → agent Runtime default →
      // first non-archived environment on Anthropic.
      const { resolveEnvironmentForAgent } = await import("@/lib/db");
      let effectiveEnvId =
        resolveEnvironmentForAgent(
          effectiveAgentId,
          environment_id || task.environment_id
        ) ?? undefined;
      if (!effectiveEnvId) {
        try {
          const envResp: any = await (client.beta as any).environments.list();
          const list: any[] = Array.isArray(envResp)
            ? envResp
            : envResp?.data ?? [];
          const first = list.find((e: any) => !e?.archived_at) ?? list[0];
          if (first?.id) effectiveEnvId = first.id;
        } catch {
          // fall through
        }
      }
      if (!effectiveEnvId) {
        return NextResponse.json(
          { error: "environment_id is required. Create one at /environments/new" },
          { status: 400 }
        );
      }

      // Combine agent-attached vaults with the global tunnel vault fallback.
      const { resolveVaultIdsForAgent } = await import("@/lib/db");
      const vaultIds = resolveVaultIdsForAgent(effectiveAgentId);

      const session = await client.beta.sessions.create({
        agent: effectiveAgentId,
        environment_id: effectiveEnvId,
        ...(vaultIds.length > 0 && { vault_ids: vaultIds }),
      });

      updateTask(taskId, {
        status: "in_progress",
        session_id: session.id,
        agent_id: effectiveAgentId,
        environment_id: effectiveEnvId,
      });

      // Check if this task mentions any connected routines - if so, add explicit tool instructions
      const taskMessage = await enrichWithRoutineHint(
        task.description || task.title,
        effectiveAgentId
      );

      // Send the task and stream agent's response (fire and forget)
      runAgentTask(client, session.id, taskMessage, taskId, effectiveAgentId);

      const updated = getTask(taskId);
      return NextResponse.json(updated);
    }

    async function enrichWithRoutineHint(message: string, agentId: string): Promise<string> {
      try {
        const db = (await import("@/lib/db")).getDb();
        db.exec(`CREATE TABLE IF NOT EXISTS agent_routines (
          id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
          routine_id INTEGER NOT NULL, tool_name TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')), UNIQUE(agent_id, routine_id)
        )`);
        const routines = db.prepare(
          `SELECT ar.tool_name, r.name FROM agent_routines ar
           JOIN routines r ON ar.routine_id = r.id WHERE ar.agent_id = ?`
        ).all(agentId) as Array<{ tool_name: string; name: string }>;

        if (routines.length === 0) return message;

        const msgLower = message.toLowerCase();
        const matched = routines.filter((r) =>
          msgLower.includes(r.name.toLowerCase()) ||
          msgLower.includes("routine")
        );

        if (matched.length > 0) {
          const toolHints = matched
            .map((r) => `Use the MCP tool "${r.tool_name}" to fire the "${r.name}" routine.`)
            .join(" ");
          return `${message}\n\nIMPORTANT: You MUST use your MCP tools to complete this task. ${toolHints} Call the tool NOW - do not just describe what you would do.`;
        }
      } catch {}
      return message;
    }

    // For other updates, just apply the fields directly
    const updated = updateTask(taskId, {
      ...(status && { status }),
      ...(result !== undefined && { result }),
      ...(agent_id && { agent_id }),
      ...(environment_id && { environment_id }),
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/board/:id
 * Remove a task from the board.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const removed = deleteTask(taskId);

    if (!removed) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// Agent task runner with MCP auto-recovery
// ---------------------------------------------------------------------------

async function runAgentTask(
  client: any,
  sessionId: string,
  message: string,
  taskId: number,
  agentId: string,
  retryCount = 0
) {
  try {
    const result = await streamAgentResponse(client, sessionId, message);
    updateTask(taskId, { status: "done", result: result || "Completed" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Agent failed";

    // Check for MCP init failure - auto-strip the broken server and retry
    const mcpMatch = msg.match(/MCP server '([^']+)' initialize failed/);
    if (mcpMatch && retryCount < 2) {
      const brokenServer = mcpMatch[1];
      console.log(`Auto-removing broken MCP server "${brokenServer}" from agent ${agentId}`);

      try {
        const agent = await client.beta.agents.retrieve(agentId);
        const version = (agent as any).version;
        const servers: any[] = (agent as any).mcp_servers || [];
        const tools: any[] = (agent as any).tools || [];

        const updatedServers = servers.filter((s: any) => s.name !== brokenServer);
        const updatedTools = tools.filter(
          (t: any) => !(t.type === "mcp_toolset" && t.mcp_server_name === brokenServer)
        );

        await client.beta.agents.update(agentId, {
          version,
          mcp_servers: updatedServers,
          tools: updatedTools,
        });

        // Create a new session without the broken MCP and retry
        const task = getTask(taskId);
        const { resolveVaultIdsForAgent } = await import("@/lib/db");
        const retryVaultIds = resolveVaultIdsForAgent(agentId);
        const newSession = await client.beta.sessions.create({
          agent: agentId,
          environment_id: task?.environment_id || (agent as any).environment_id,
          ...(retryVaultIds.length > 0 && { vault_ids: retryVaultIds }),
        });

        updateTask(taskId, { session_id: newSession.id });

        return runAgentTask(
          client,
          newSession.id,
          message,
          taskId,
          agentId,
          retryCount + 1
        );
      } catch (retryErr) {
        const retryMsg = retryErr instanceof Error ? retryErr.message : "Retry failed";
        updateTask(taskId, {
          status: "failed",
          result: `Removed broken MCP "${brokenServer}" but retry failed: ${retryMsg}`,
        });
      }
      return;
    }

    updateTask(taskId, { status: "failed", result: `Agent failed: ${msg}` });
  }
}

async function streamAgentResponse(
  client: any,
  sessionId: string,
  message: string
): Promise<string> {
  const streamPromise = (client.beta as any).sessions.events.stream(sessionId);

  await (client.beta as any).sessions.events.send(sessionId, {
    events: [
      {
        type: "user.message",
        content: [{ type: "text", text: message }],
      },
    ],
  });

  const stream = await streamPromise;
  const chunks: string[] = [];
  const TIMEOUT_MS = 180_000;
  const start = Date.now();
  let sawRunning = false;

  try {
    for await (const ev of stream as AsyncIterable<any>) {
      if (Date.now() - start > TIMEOUT_MS) break;

      if (ev?.type === "session.status_running") sawRunning = true;

      if (ev?.type === "agent.message" && Array.isArray(ev.content)) {
        for (const block of ev.content) {
          if (block?.type === "text" && typeof block.text === "string") {
            chunks.push(block.text);
          }
        }
      }

      if (ev?.type === "session.status_idle" && sawRunning) break;
      if (ev?.type === "session.error") {
        const errDetail =
          ev?.error?.message || ev?.message || ev?.description || JSON.stringify(ev?.error || ev);
        throw new Error(errDetail);
      }
      if (ev?.type === "session.deleted") break;
    }
  } finally {
    try { (stream as any)?.controller?.abort?.(); } catch { /* ignore */ }
  }

  return chunks.join("");
}
