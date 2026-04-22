import { NextResponse } from "next/server";
import { getAgentDefaults, setAgentDefaults } from "@/lib/db";

/**
 * GET /api/agents/:id/defaults — returns the saved runtime defaults
 *   (environment_id, etc.) for this agent.
 * PUT /api/agents/:id/defaults — create or replace them.
 *   Body: { environment_id?: string | null }
 *
 * Vaults are managed separately via /api/agents/:id/vaults. Callers of the
 * session-creation routes use resolveEnvironmentForAgent + resolveVaultIdsForAgent
 * (both in lib/db) to apply these defaults automatically.
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const defaults = getAgentDefaults(id);
  return NextResponse.json(
    defaults ?? { agent_id: id, environment_id: null, updated_at: null }
  );
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const defaults = setAgentDefaults(id, {
      environment_id: body.environment_id ?? null,
    });
    return NextResponse.json(defaults);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to save defaults";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
