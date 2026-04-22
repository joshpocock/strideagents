import { NextResponse } from "next/server";
import { getAgentRuns } from "@/lib/db";

/**
 * GET /api/agents/runs?agent_id=...&limit=...
 *
 * Agent run history. Mirrors /api/routines/runs.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agent_id");
    const limit = Number(searchParams.get("limit") ?? "100");
    const since = searchParams.get("since");

    const runs = getAgentRuns({
      agentId: agentId ?? undefined,
      since: since ?? undefined,
      limit,
    });

    return NextResponse.json({ runs });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get agent runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
