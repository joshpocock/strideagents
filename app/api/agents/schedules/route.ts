import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getAgentSchedules } from "@/lib/db";

/**
 * GET /api/agents/schedules
 * Returns every saved agent schedule with the agent's name joined in.
 * Used by the scheduler worker and the unified calendar.
 */
export async function GET() {
  try {
    const schedules = getAgentSchedules();

    // Best-effort name lookup so the UI has something human-readable.
    let nameById: Record<string, string> = {};
    try {
      const client = getClient();
      const res: any = await (client.beta as any).agents.list();
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      for (const agent of list) {
        if (agent?.id) nameById[agent.id] = agent.name ?? "Unnamed agent";
      }
    } catch {
      // Agents list may be unreachable — scheduler still works without names.
    }

    return NextResponse.json(
      schedules.map((s) => ({
        ...s,
        agent_name: nameById[s.agent_id] ?? null,
      }))
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list schedules";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
