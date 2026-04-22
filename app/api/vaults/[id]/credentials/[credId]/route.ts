import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/vaults/:id/credentials/:credId
 * Retrieve a single credential's current state from Anthropic.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; credId: string }> }
) {
  try {
    const { id, credId } = await params;
    const client = getClient();
    const credential = await (client.beta as any).vaults.credentials.retrieve(
      credId,
      { vault_id: id }
    );
    return NextResponse.json(credential);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to load credential";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PATCH /api/vaults/:id/credentials/:credId
 * Update display_name or auth fields (token, mcp_server_url) on a credential.
 * Body: { display_name?, auth?: { type, token?, mcp_server_url? } }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; credId: string }> }
) {
  try {
    const { id, credId } = await params;
    const body = await request.json();
    const updates: Record<string, unknown> = { vault_id: id };
    if (typeof body.display_name === "string") {
      updates.display_name = body.display_name.trim();
    }
    if (body.auth && typeof body.auth === "object") {
      updates.auth = body.auth;
    }
    const client = getClient();
    const credential = await (client.beta as any).vaults.credentials.update(
      credId,
      updates
    );
    return NextResponse.json(credential);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to update credential";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/vaults/:id/credentials/:credId
 * Delete a single credential from a vault.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; credId: string }> }
) {
  try {
    const { id, credId } = await params;
    const client = getClient();
    await (client.beta as any).vaults.credentials.delete(credId, {
      vault_id: id,
    });
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to delete credential";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
