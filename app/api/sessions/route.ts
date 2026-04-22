import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { resolveVaultIdsForAgent, resolveEnvironmentForAgent } from "@/lib/db";

/**
 * GET /api/sessions
 * List sessions. Optionally filter by agent_id via query param.
 *
 * Query params:
 *   agent_id - filter sessions belonging to a specific agent
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const agentVersion = searchParams.get("agent_version");
    const includeArchived = searchParams.get("include_archived");
    const createdAfter = searchParams.get("created_after");

    const client = getClient();
    const listParams: Record<string, unknown> = {};
    if (agentId) listParams.agent_id = agentId;
    if (agentVersion) listParams.agent_version = Number(agentVersion);
    if (includeArchived === "true") listParams.include_archived = true;
    if (createdAfter) listParams.created_after = createdAfter;

    const response: any = await (client.beta as any).sessions.list(listParams);
    const sessions = Array.isArray(response)
      ? response
      : (response?.data ?? []);
    return NextResponse.json(sessions);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list sessions";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/sessions
 * Create a new session tied to an agent and (optionally) an environment.
 *
 * Body: { agent_id, environment_id? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, environment_id } = body;

    if (!agent_id) {
      return NextResponse.json(
        { error: "agent_id is required" },
        { status: 400 }
      );
    }

    const client = getClient();
    const vaultIds = resolveVaultIdsForAgent(agent_id);
    const envId = resolveEnvironmentForAgent(agent_id, environment_id);
    if (!envId) {
      return NextResponse.json(
        {
          error:
            "environment_id is required — pass in body or save one on the agent's Runtime defaults.",
        },
        { status: 400 }
      );
    }
    const session = await client.beta.sessions.create({
      agent: agent_id,
      environment_id: envId,
      ...(vaultIds.length > 0 && { vault_ids: vaultIds }),
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
