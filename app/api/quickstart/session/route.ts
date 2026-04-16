import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * POST /api/quickstart/session
 *
 * Create a session for the quickstart wizard.
 *
 * Body: { agent_id: string, environment_id: string, vault_ids?: string[] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { agent_id, environment_id, vault_ids } = body;

    if (!agent_id || !environment_id) {
      return NextResponse.json(
        { error: "agent_id and environment_id are required" },
        { status: 400 }
      );
    }

    const client = getClient();

    const session = await client.beta.sessions.create({
      agent: agent_id,
      environment_id,
      ...(vault_ids && vault_ids.length > 0 && { vault_ids }),
    });

    return NextResponse.json({ session }, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
