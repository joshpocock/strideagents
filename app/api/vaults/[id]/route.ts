import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/vaults/:id
 * Retrieve a single vault by ID, including its credentials list.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();

    // Fetch vault details and its credentials in parallel
    const [vault, credentials] = await Promise.all([
      client.beta.vaults.retrieve(id),
      client.beta.vaults.credentials.list(id),
    ]);

    return NextResponse.json({ ...vault, credentials });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to retrieve vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/vaults/:id
 * Delete a vault by ID.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();

    // Try the SDK delete method if available
    try {
      await (client.beta as any).vaults.delete(id);
    } catch {
      // Fall back to raw fetch if the SDK method isn't available
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          { error: "ANTHROPIC_API_KEY is not configured" },
          { status: 500 }
        );
      }
      const res = await fetch(`https://api.anthropic.com/v1/vaults/${id}`, {
        method: "DELETE",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "managed-agents-2026-04-01",
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        return NextResponse.json(
          { error: `Delete failed: ${errText || res.statusText}` },
          { status: res.status }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete vault";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
