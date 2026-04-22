import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/vaults/mcp-credentials
 *
 * Returns every credential in every vault that carries an
 * `auth.mcp_server_url`. That's the natural "MCP-aware vault" — picking one
 * of these in the agent editor should fill the MCP server row AND attach the
 * parent vault in one action.
 */
export async function GET() {
  try {
    const client = getClient();

    // List vaults first. Paginated response shapes vary, so we handle both.
    const vaultsResp: any = await (client.beta as any).vaults.list();
    const vaults: any[] = Array.isArray(vaultsResp)
      ? vaultsResp
      : vaultsResp?.data ?? [];

    const results: Array<{
      vault_id: string;
      vault_name: string | null;
      credential_id: string;
      display_name: string;
      mcp_url: string;
    }> = [];

    for (const vault of vaults) {
      const vaultId = vault?.id;
      if (!vaultId) continue;
      try {
        const credsResp: any = await (client.beta as any).vaults.credentials.list(
          vaultId
        );
        const creds: any[] = Array.isArray(credsResp)
          ? credsResp
          : credsResp?.data ?? [];
        for (const cred of creds) {
          const url = cred?.auth?.mcp_server_url;
          if (!url) continue;
          results.push({
            vault_id: vaultId,
            vault_name: vault?.name ?? null,
            credential_id: cred.id,
            display_name: cred.display_name || vault?.name || "MCP",
            mcp_url: url,
          });
        }
      } catch {
        // Skip vaults that can't be read rather than failing the whole list.
      }
    }

    return NextResponse.json(results);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list MCP credentials";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
