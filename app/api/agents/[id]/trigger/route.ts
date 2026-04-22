import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import {
  logAgentRun,
  updateAgentScheduleLastFired,
  getAgentSchedule,
  resolveVaultIdsForAgent,
  resolveEnvironmentForAgent,
} from "@/lib/db";

/**
 * POST /api/agents/:id/trigger
 *
 * Programmatic trigger for a managed agent. Creates a session and optionally
 * sends an initial user prompt. Mirrors the routines/fire shape so the local
 * scheduler worker, webhooks, Zapier, or any external cron can drive agents
 * the same way they drive routines.
 *
 * Body (all optional):
 *   environment_id  — required to start a session; falls back to the schedule
 *                     row's environment_id if this agent has a saved schedule
 *   prompt          — user message to send as soon as the session is created
 *   trigger_source  — free-form label written to agent_runs (e.g. "scheduler",
 *                     "webhook", "manual"). Defaults to "api".
 *
 * Returns: { session_id, session_url, last_fired_at }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params;
  let agentName: string | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    const triggerSource: string = body.trigger_source || "api";
    const prompt: string | undefined = body.prompt;
    const envFromBody: string | undefined = body.environment_id;

    // Preference order for environment_id:
    //   1. Explicit body override
    //   2. The saved schedule's environment_id (if this agent has a cron)
    //   3. The agent's Runtime default environment
    const schedule = getAgentSchedule(agentId);
    const environmentId =
      resolveEnvironmentForAgent(agentId, envFromBody || schedule?.environment_id) ??
      undefined;

    if (!environmentId) {
      const err =
        "environment_id is required — pass in body, save one on the agent's Runtime defaults, or configure a schedule with an env.";
      logAgentRun({
        agent_id: agentId,
        status: "error",
        trigger_source: triggerSource,
        error: err,
      });
      return NextResponse.json({ error: err }, { status: 400 });
    }

    const client = getClient();

    // Look up the agent name for nicer run-history display — best effort only.
    try {
      const agent = (await (client.beta as any).agents.retrieve(agentId)) as {
        name?: string;
      };
      agentName = agent?.name ?? null;
    } catch {
      // Agent may not be readable; continue without the name.
    }

    const vaultIds = resolveVaultIdsForAgent(agentId);
    const session = (await client.beta.sessions.create({
      agent: agentId,
      environment_id: environmentId,
      ...(vaultIds.length > 0 && { vault_ids: vaultIds }),
    })) as { id: string };

    const sessionId = session.id;
    // Anthropic's console routes under /workspaces/<slug>/sessions/<id>. The
    // bare /sessions/<id> form 303-redirects but the redirect target 404s in
    // some flows, so we construct the full path. Workspace slug is "default"
    // for single-workspace accounts — if the Anthropic SDK exposes a slug on
    // the session or account later, switch to that.
    const workspaceSlug =
      (session as unknown as { workspace_slug?: string }).workspace_slug ||
      "default";
    const sessionUrl = `https://platform.claude.com/workspaces/${workspaceSlug}/sessions/${sessionId}`;

    // Optionally send the initial prompt as a user message.
    if (prompt && prompt.trim()) {
      try {
        await (client.beta as any).sessions.events.send(sessionId, {
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: prompt }],
            },
          ],
        });
      } catch (err) {
        // Log but don't fail — the session exists, the user can recover by
        // sending the message manually from the UI.
        console.error(`[agent trigger] send prompt failed:`, err);
      }
    }

    const now = new Date().toISOString();
    if (schedule) {
      updateAgentScheduleLastFired(agentId, now, sessionUrl);
    }
    const runId = logAgentRun({
      agent_id: agentId,
      agent_name: agentName,
      status: "success",
      session_id: sessionId,
      session_url: sessionUrl,
      trigger_source: triggerSource,
    });

    return NextResponse.json({
      run_id: runId,
      session_id: sessionId,
      session_url: sessionUrl,
      last_fired_at: now,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to trigger agent";
    logAgentRun({
      agent_id: agentId,
      agent_name: agentName,
      status: "error",
      trigger_source: "api",
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
