import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import {
  getAgentVaultIds,
  attachAgentVault,
  detachAgentVault,
} from "@/lib/db";

/**
 * GET /api/agents/:id/vaults
 *
 * Returns the vault IDs attached to this agent along with any metadata we can
 * fetch from the Anthropic Vaults API (name, credential count). Used by the
 * agent detail page and by the scheduler-triggered session paths.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const ids = getAgentVaultIds(id);

    // Best-effort enrich with vault names from Anthropic. Local attachment
    // always wins — we just add display info.
    const enriched: Array<{ id: string; name?: string; error?: string }> = [];
    if (ids.length > 0) {
      const client = getClient();
      for (const vaultId of ids) {
        try {
          const vault: any = await (client.beta as any).vaults.retrieve(vaultId);
          enriched.push({ id: vaultId, name: vault?.name });
        } catch (err) {
          enriched.push({
            id: vaultId,
            error:
              err instanceof Error ? err.message : "Failed to load vault",
          });
        }
      }
    }

    return NextResponse.json({ vaults: enriched });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list agent vaults";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/agents/:id/vaults
 * Body: { vault_id }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const vaultId = body.vault_id;
    if (!vaultId || typeof vaultId !== "string") {
      return NextResponse.json(
        { error: "vault_id is required" },
        { status: 400 }
      );
    }
    attachAgentVault(id, vaultId);
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to attach vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
