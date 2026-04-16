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
 * Update an existing agent. Accepts any updatable fields.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const client = getClient();
    const agent = await client.beta.agents.update(id, body);
    return NextResponse.json(agent);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/:id
 * Archive (delete) an agent.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();
    // @ts-expect-error - delete may not be in current SDK type defs
    const result = await client.beta.agents.delete(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
