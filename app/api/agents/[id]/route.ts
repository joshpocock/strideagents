import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/agents/:id
 * Retrieve a single agent by ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();
    const agent = await client.beta.agents.retrieve(id);
    return NextResponse.json(agent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/agents/:id
 * Update an existing agent. Auto-fetches current version for concurrency control.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getClient();

    // If no version provided, fetch current agent to get it
    let version = body.version;
    if (version == null) {
      const current = await client.beta.agents.retrieve(id);
      version = (current as any).version;
    }

    const agent = await client.beta.agents.update(id, { ...body, version });
    return NextResponse.json(agent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/:id
 * Archive the agent. Anthropic's Managed Agents API soft-deletes via `archive`
 * (not `delete`); archived agents stop appearing in the default list but can
 * still be referenced by existing sessions.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();
    const result = await (client.beta as any).agents.archive(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
