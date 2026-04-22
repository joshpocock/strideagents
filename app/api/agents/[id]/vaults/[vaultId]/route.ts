import { NextResponse } from "next/server";
import { detachAgentVault } from "@/lib/db";

/**
 * DELETE /api/agents/:id/vaults/:vaultId
 * Detach a vault from an agent. Leaves the vault itself untouched on Anthropic.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; vaultId: string }> }
) {
  try {
    const { id, vaultId } = await params;
    const removed = detachAgentVault(id, vaultId);
    if (!removed) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to detach vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
