import { NextResponse } from "next/server";
import { CronExpressionParser } from "cron-parser";
import { getClient } from "@/lib/anthropic";
import { getAgentSchedules } from "@/lib/db";

/**
 * GET /api/agents/upcoming?days=7
 *
 * Returns every scheduled agent's upcoming fire times in the window. Mirrors
 * /api/routines/upcoming so the calendar view can merge both streams.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const days = Math.max(1, Math.min(31, Number(searchParams.get("days") ?? "7")));

    const now = new Date();
    const horizon = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    // Best-effort agent-name lookup for nicer calendar labels.
    let nameById: Record<string, string> = {};
    try {
      const client = getClient();
      const res: any = await (client.beta as any).agents.list();
      const list = Array.isArray(res) ? res : (res?.data ?? []);
      for (const agent of list) {
        if (agent?.id) nameById[agent.id] = agent.name ?? "Unnamed agent";
      }
    } catch {
      // fall through without names
    }

    const results: Array<{ agent_id: string; agent_name: string; at: string }> = [];

    for (const schedule of getAgentSchedules()) {
      if (!schedule.cron_schedule) continue;
      try {
        const iter = CronExpressionParser.parse(schedule.cron_schedule, {
          currentDate: now,
          endDate: horizon,
        });
        while (true) {
          const next = iter.next();
          results.push({
            agent_id: schedule.agent_id,
            agent_name: nameById[schedule.agent_id] ?? "Unknown agent",
            at: next.toDate().toISOString(),
          });
        }
      } catch (err) {
        if (err instanceof Error && err.message === "Out of the timespan range") {
          // normal end-of-iteration signal
        }
      }
    }

    return NextResponse.json({ runs: results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to compute upcoming agent runs";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
