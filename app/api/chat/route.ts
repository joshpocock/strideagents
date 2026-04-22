import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import {
  getChatSession,
  insertChatSession,
  resolveVaultIdsForAgent,
  resolveEnvironmentForAgent,
} from "@/lib/db";

// Allow up to 5 minutes for agent responses
export const maxDuration = 300;

/**
 * POST /api/chat
 *
 * High-level chat endpoint. Sends a message and waits for the full agent
 * response. Uses the same fire-and-wait pattern as the kanban board
 * (which works reliably).
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chat_id, message, agent_id, environment_id } = body;

    if (!chat_id || !message) {
      return NextResponse.json(
        { error: "chat_id and message are required" },
        { status: 400 }
      );
    }

    const client = getClient();
    let session = getChatSession(chat_id);

    if (!session) {
      if (!agent_id) {
        return NextResponse.json(
          { error: "agent_id is required for the first message in a new chat" },
          { status: 400 }
        );
      }

      // Preference order: explicit body override → saved agent default → first
      // environment we can find on Anthropic.
      let resolvedEnvId =
        resolveEnvironmentForAgent(agent_id, environment_id as string | undefined) ?? undefined;
      if (!resolvedEnvId) {
        try {
          const envResp: any = await (client.beta as any).environments.list();
          const list: any[] = Array.isArray(envResp)
            ? envResp
            : envResp?.data ?? [];
          const first = list.find((e) => !e?.archived_at) ?? list[0];
          if (first?.id) resolvedEnvId = first.id;
        } catch {
          // Fall through
        }
      }
      if (!resolvedEnvId) {
        return NextResponse.json(
          {
            error:
              "environment_id is required. Create an environment at /environments/new, or pass environment_id explicitly.",
          },
          { status: 400 }
        );
      }

      // Combine agent-attached vaults with the global tunnel vault fallback.
      const vaultIds = resolveVaultIdsForAgent(agent_id);

      const newSession = await client.beta.sessions.create({
        agent: agent_id,
        environment_id: resolvedEnvId,
        ...(vaultIds.length > 0 && { vault_ids: vaultIds }),
      });

      const sessionRecord = {
        chat_id,
        agent_id,
        environment_id: resolvedEnvId,
        session_id: newSession.id,
      };

      insertChatSession(sessionRecord);
      session = sessionRecord as unknown as typeof session;
    }

    const sessionId = session!.session_id;
    const effectiveAgentId = agent_id || session!.agent_id;

    // If user mentions a routine, add explicit tool-use hint
    let enrichedMessage = message;
    try {
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      db.exec(`CREATE TABLE IF NOT EXISTS agent_routines (
        id INTEGER PRIMARY KEY AUTOINCREMENT, agent_id TEXT NOT NULL,
        routine_id INTEGER NOT NULL, tool_name TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')), UNIQUE(agent_id, routine_id)
      )`);
      const routines = db.prepare(
        `SELECT ar.tool_name, r.name FROM agent_routines ar
         JOIN routines r ON ar.routine_id = r.id WHERE ar.agent_id = ?`
      ).all(effectiveAgentId) as Array<{ tool_name: string; name: string }>;

      if (routines.length > 0) {
        const msgLower = message.toLowerCase();
        const matched = routines.filter((r) =>
          msgLower.includes(r.name.toLowerCase()) || msgLower.includes("routine")
        );
        if (matched.length > 0) {
          const hints = matched
            .map((r) => `Use MCP tool "${r.tool_name}" for "${r.name}".`)
            .join(" ");
          enrichedMessage = `${message}\n\n[System: ${hints} Call the tool - do not just describe it.]`;
        }
      }
    } catch {}

    // Send the message
    await (client.beta as any).sessions.events.send(sessionId, {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: enrichedMessage }],
        },
      ],
    });

    // Poll for session to go idle (agent finished responding)
    const POLL_INTERVAL = 1500;
    const MAX_WAIT = 180_000;
    const start = Date.now();

    while (Date.now() - start < MAX_WAIT) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));

      try {
        const sessionStatus = await client.beta.sessions.retrieve(sessionId);
        const status = (sessionStatus as any).status;

        if (status === "idle" || status === "completed" || status === "terminated") {
          break;
        }
        if (status === "error") {
          // Check if it's an MCP init failure - try to get details
          let errMsg = "Session encountered an error";
          try {
            const events = await (client.beta as any).sessions.events.list(sessionId);
            for await (const ev of events) {
              if (ev?.type === "session.error") {
                errMsg = ev?.error?.message || ev?.message || errMsg;
                break;
              }
            }
          } catch { /* ignore */ }

          // Auto-strip broken MCP server if that's the issue
          const mcpMatch = errMsg.match(/MCP server '([^']+)' initialize failed/);
          if (mcpMatch) {
            const brokenServer = mcpMatch[1];
            try {
              const effectiveAgentId = agent_id || session!.agent_id;
              const agent = await client.beta.agents.retrieve(effectiveAgentId);
              const version = (agent as any).version;
              const servers: any[] = (agent as any).mcp_servers || [];
              const tools: any[] = (agent as any).tools || [];

              await client.beta.agents.update(effectiveAgentId, {
                version,
                mcp_servers: servers.filter((s: any) => s.name !== brokenServer),
                tools: tools.filter((t: any) =>
                  !(t.type === "mcp_toolset" && t.mcp_server_name === brokenServer)
                ),
              });

              return NextResponse.json({
                chat_id,
                session_id: sessionId,
                response: `Removed broken MCP server "${brokenServer}" (credential expired or invalid). Please send your message again.`,
              });
            } catch { /* fall through to generic error */ }
          }

          return NextResponse.json(
            { error: errMsg },
            { status: 500 }
          );
        }
      } catch {
        // Keep polling
      }
    }

    // Fetch the full conversation from replay to get the complete response
    let fullResponse = "";
    let toolCalls: Array<Record<string, unknown>> = [];
    try {
      const replayRes = await (client.beta as any).sessions.events.list(sessionId);
      const events: any[] = [];

      // Handle both array and paginated responses
      if (Symbol.asyncIterator in Object(replayRes)) {
        for await (const ev of replayRes) {
          events.push(ev);
        }
      } else if (Array.isArray(replayRes)) {
        events.push(...replayRes);
      } else if (replayRes?.data) {
        events.push(...replayRes.data);
      }

      // Get the LAST agent message(s) - these are the response to our message.
      // Also accumulate any tool_use + tool_result events that happened in
      // that same turn so the client can render them inline.
      const agentMessages: string[] = [];
      const pendingTools = new Map<string, any>(); // tool_use_id → partial
      const completedTools: Array<Record<string, unknown>> = [];
      let foundOurMessage = false;

      for (const ev of events) {
        if (ev?.type === "user.message") {
          // Check if this is the message we just sent
          const text = ev?.content?.[0]?.text || "";
          if (text === message) {
            foundOurMessage = true;
            agentMessages.length = 0; // Reset - only want messages after ours
            pendingTools.clear();
            completedTools.length = 0;
          }
        }
        if (!foundOurMessage) continue;

        if (ev?.type === "agent.message" && Array.isArray(ev.content)) {
          for (const block of ev.content) {
            if (block?.type === "text" && typeof block.text === "string") {
              agentMessages.push(block.text);
            }
          }
        } else if (
          ev?.type === "agent.tool_use" ||
          ev?.type === "agent.mcp_tool_use"
        ) {
          const toolId = ev?.id || ev?.tool_use_id || `tu-${completedTools.length}`;
          pendingTools.set(toolId, {
            id: toolId,
            name: ev?.name || ev?.tool_name || "unknown",
            input: ev?.input ?? ev?.tool_input ?? null,
            is_mcp: ev?.type === "agent.mcp_tool_use",
          });
        } else if (
          ev?.type === "agent.tool_result" ||
          ev?.type === "agent.mcp_tool_result"
        ) {
          const tuId = ev?.tool_use_id || ev?.mcp_tool_use_id || ev?.id;
          const existing = pendingTools.get(tuId);
          const resultPayload = ev?.content ?? ev?.result ?? null;
          if (existing) {
            existing.result = resultPayload;
            existing.is_error = Boolean(ev?.is_error);
            completedTools.push(existing);
            pendingTools.delete(tuId);
          } else {
            // Result without a matching pending use (rare) — still log it.
            completedTools.push({
              id: tuId || `tr-${completedTools.length}`,
              name: "tool",
              result: resultPayload,
              is_error: Boolean(ev?.is_error),
            });
          }
        }
      }

      // Any tool_use left in pending means the matching result didn't arrive
      // yet (session still running or the poll raced the last event). Surface
      // them as in-flight entries so the user at least sees the call happened.
      for (const stillPending of pendingTools.values()) {
        completedTools.push(stillPending);
      }

      fullResponse = agentMessages.join("\n\n");
      toolCalls = completedTools;
    } catch (err) {
      console.error("Failed to fetch replay:", err);
    }

    // If replay failed, try a simpler approach - just get latest events
    if (!fullResponse) {
      try {
        const stream = await (client.beta as any).sessions.events.stream(sessionId);
        const chunks: string[] = [];
        const streamStart = Date.now();

        for await (const ev of stream as AsyncIterable<any>) {
          if (Date.now() - streamStart > 5000) break; // Quick scan
          if (ev?.type === "agent.message" && Array.isArray(ev.content)) {
            for (const block of ev.content) {
              if (block?.type === "text" && typeof block.text === "string") {
                chunks.push(block.text);
              }
            }
          }
          if (ev?.type === "session.status_idle") break;
        }

        fullResponse = chunks.join("\n\n");

        try {
          (stream as any)?.controller?.abort?.();
        } catch { /* ignore */ }
      } catch {
        fullResponse = "Agent responded but could not retrieve the full message. Check the session for details.";
      }
    }

    return NextResponse.json({
      chat_id,
      session_id: sessionId,
      response: fullResponse,
      tool_calls: toolCalls,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Chat request failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
