import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

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

    const client = getClient();
    const listParams: Record<string, unknown> = {};
    if (agentId) {
      listParams.agent_id = agentId;
    }

    const response: any = await (client.beta as any).sessions.list(listParams);
    // Normalize paginated response to plain array
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
    const session = await client.beta.sessions.create({
      agent_id,
      ...(environment_id && { environment_id }),
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
