import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

export const dynamic = "force-dynamic";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

interface SessionRecord {
  id: string;
  agent_id?: string;
  status?: string;
  model?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/**
 * GET /api/analytics
 * Aggregates usage, cost, and session data for the analytics dashboard.
 */
export async function GET() {
  try {
    const client = getClient();

    // Fetch sessions
    const sessionsRes = await client.beta.sessions.list({});
    const allSessions: SessionRecord[] = Array.isArray(sessionsRes)
      ? sessionsRes
      : (sessionsRes as unknown as { data?: SessionRecord[] }).data || [];

    const totalSessions = allSessions.length;
    const activeSessions = allSessions.filter(
      (s) => s.status === "running" || s.status === "active" || s.status === "awaiting_input"
    ).length;

    // Calculate tokens and costs per session (sample recent 20)
    const recentSessions = allSessions.slice(0, 20);
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    const modelBreakdown: Record<string, { input_tokens: number; output_tokens: number; cost: number; count: number }> = {};
    const dailyUsage: Record<string, { input_tokens: number; output_tokens: number; sessions: number }> = {};

    // Fetch cost data for recent sessions
    const sessionDetails = await Promise.all(
      recentSessions.map(async (session) => {
        let inputTokens = 0;
        let outputTokens = 0;
        const model = session.model || "claude-sonnet-4-6";

        try {
          // @ts-expect-error - list_messages may not be in current SDK type defs
          const messagesRes = await client.beta.sessions.list_messages(session.id, {});
          const messages = Array.isArray(messagesRes)
            ? messagesRes
            : (messagesRes as unknown as { data?: Array<Record<string, unknown>> }).data || [];

          for (const msg of messages as Array<Record<string, unknown>>) {
            const usage = msg.usage as Record<string, number> | undefined;
            if (usage) {
              inputTokens += usage.input_tokens || 0;
              outputTokens += usage.output_tokens || 0;
            } else if (msg.content) {
              const content = msg.content as Array<{ type?: string; text?: string }>;
              const textLength = content
                .filter((c) => c.type === "text" && c.text)
                .reduce((sum, c) => sum + (c.text?.length || 0), 0);
              const estimated = Math.ceil(textLength / 4);
              if (msg.role === "user") inputTokens += estimated;
              else outputTokens += estimated;
            }
          }
        } catch {
          // Skip if messages can't be fetched
        }

        const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-6"];
        const cost =
          (inputTokens / 1_000_000) * pricing.input +
          (outputTokens / 1_000_000) * pricing.output;

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
        totalCost += cost;

        // Model breakdown
        if (!modelBreakdown[model]) {
          modelBreakdown[model] = { input_tokens: 0, output_tokens: 0, cost: 0, count: 0 };
        }
        modelBreakdown[model].input_tokens += inputTokens;
        modelBreakdown[model].output_tokens += outputTokens;
        modelBreakdown[model].cost += cost;
        modelBreakdown[model].count += 1;

        // Daily usage
        const dateKey = session.created_at
          ? new Date(session.created_at).toISOString().split("T")[0]
          : "unknown";
        if (!dailyUsage[dateKey]) {
          dailyUsage[dateKey] = { input_tokens: 0, output_tokens: 0, sessions: 0 };
        }
        dailyUsage[dateKey].input_tokens += inputTokens;
        dailyUsage[dateKey].output_tokens += outputTokens;
        dailyUsage[dateKey].sessions += 1;

        // Duration
        let durationMinutes = 0;
        if (session.created_at) {
          const endTime = session.updated_at
            ? new Date(session.updated_at).getTime()
            : Date.now();
          durationMinutes = Math.round(
            (endTime - new Date(session.created_at).getTime()) / 60000
          );
        }

        return {
          id: session.id,
          agent_id: session.agent_id,
          status: session.status || "unknown",
          model,
          created_at: session.created_at,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost,
          duration_minutes: durationMinutes,
        };
      })
    );

    // Build daily data for the last 7 days
    const last7Days: Array<{ date: string; input_tokens: number; output_tokens: number; sessions: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];
      last7Days.push({
        date: dateKey,
        ...(dailyUsage[dateKey] || { input_tokens: 0, output_tokens: 0, sessions: 0 }),
      });
    }

    // Build activity grid (last 30 days)
    const activityGrid: Array<{ date: string; count: number }> = [];
    const sessionDateCounts: Record<string, number> = {};
    for (const s of allSessions) {
      if (s.created_at) {
        const dk = new Date(s.created_at).toISOString().split("T")[0];
        sessionDateCounts[dk] = (sessionDateCounts[dk] || 0) + 1;
      }
    }
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split("T")[0];
      activityGrid.push({
        date: dateKey,
        count: sessionDateCounts[dateKey] || 0,
      });
    }

    return NextResponse.json({
      stats: {
        total_sessions: totalSessions,
        active_sessions: activeSessions,
        total_input_tokens: totalInputTokens,
        total_output_tokens: totalOutputTokens,
        total_cost: totalCost,
      },
      daily_usage: last7Days,
      model_breakdown: Object.entries(modelBreakdown).map(([model, data]) => ({
        model,
        ...data,
      })),
      activity_grid: activityGrid,
      recent_sessions: sessionDetails,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get analytics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
