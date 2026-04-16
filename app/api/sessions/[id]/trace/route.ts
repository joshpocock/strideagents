import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

interface TraceEvent {
  type: string;
  timestamp?: string;
  relative_time?: string;
  relative_seconds?: number;
  content?: unknown;
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  error_type?: string;
  error_message?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  model?: string;
  cost?: number;
  cumulative_cost?: number;
  [key: string]: unknown;
}

function formatRelativeTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `+${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * GET /api/sessions/:id/trace
 * Returns enriched trace events for a session.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();

    // Get session details
    const session = await client.beta.sessions.retrieve(id) as unknown as Record<string, unknown>;
    const sessionCreated = session.created_at
      ? new Date(session.created_at as string).getTime()
      : Date.now();
    const sessionModel = (session.model as string) || "claude-sonnet-4-6";

    // Get all events
    let rawEvents: Array<Record<string, unknown>> = [];
    try {
      // @ts-expect-error - list_events may not be in current SDK type defs
      const eventsRes = await client.beta.sessions.list_events(id, {});
      rawEvents = Array.isArray(eventsRes)
        ? eventsRes
        : (eventsRes as unknown as { data?: Array<Record<string, unknown>> }).data || [];
    } catch {
      // If list_events is not available, try listing messages as fallback
      // @ts-expect-error - list_messages may not be in current SDK type defs
      const messagesRes = await client.beta.sessions.list_messages(id, {});
      const messages = Array.isArray(messagesRes)
        ? messagesRes
        : (messagesRes as unknown as { data?: Array<Record<string, unknown>> }).data || [];

      rawEvents = messages.map((msg: Record<string, unknown>) => ({
        type: msg.role === "user" ? "user.message" : "agent.message",
        timestamp: msg.created_at || msg.timestamp,
        content: msg.content,
        usage: msg.usage,
      }));
    }

    // Enrich events
    const pricing = MODEL_PRICING[sessionModel] || MODEL_PRICING["claude-sonnet-4-6"];
    let cumulativeCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const traceEvents: TraceEvent[] = rawEvents.map((event) => {
      const eventTime = event.timestamp || event.created_at;
      let relativeSeconds = 0;
      if (eventTime) {
        relativeSeconds = (new Date(eventTime as string).getTime() - sessionCreated) / 1000;
        if (relativeSeconds < 0) relativeSeconds = 0;
      }

      const enriched: TraceEvent = {
        ...event,
        type: (event.type as string) || "unknown",
        relative_time: formatRelativeTime(relativeSeconds),
        relative_seconds: relativeSeconds,
      };

      // Extract token usage from model_request_end or usage fields
      if (event.type === "span.model_request_end" || event.usage) {
        const usage = (event.usage || event) as Record<string, unknown>;
        const inputTokens = (usage.input_tokens as number) || 0;
        const outputTokens = (usage.output_tokens as number) || 0;
        const cacheRead = (usage.cache_read_input_tokens as number) || (usage.cache_read_tokens as number) || 0;
        const cacheCreation = (usage.cache_creation_input_tokens as number) || (usage.cache_creation_tokens as number) || 0;

        enriched.input_tokens = inputTokens;
        enriched.output_tokens = outputTokens;
        enriched.cache_read_tokens = cacheRead;
        enriched.cache_creation_tokens = cacheCreation;
        enriched.model = sessionModel;

        const eventCost =
          (inputTokens / 1_000_000) * pricing.input +
          (outputTokens / 1_000_000) * pricing.output;
        cumulativeCost += eventCost;
        enriched.cost = eventCost;
        enriched.cumulative_cost = cumulativeCost;

        totalInputTokens += inputTokens;
        totalOutputTokens += outputTokens;
      }

      // Extract tool info
      if (event.type === "agent.tool_use" || event.type === "agent.custom_tool_use" || event.type === "agent.mcp_tool_use") {
        enriched.tool_name = (event.name as string) || (event.tool_name as string) || "unknown";
        enriched.tool_input = event.input || event.tool_input;
      }

      // Extract error info
      if (event.type === "session.error") {
        enriched.error_type = (event.error_type as string) || "error";
        enriched.error_message = (event.error_message as string) || (event.message as string) || "Unknown error";
      }

      // Extract message content
      if (event.type === "user.message" || event.type === "agent.message") {
        enriched.content = event.content;
      }

      return enriched;
    });

    // Calculate session duration
    const lastEvent = traceEvents[traceEvents.length - 1];
    const durationSeconds = lastEvent?.relative_seconds || 0;

    return NextResponse.json({
      session_id: id,
      model: sessionModel,
      status: session.status || "unknown",
      created_at: session.created_at,
      duration_seconds: durationSeconds,
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_cost: cumulativeCost,
      events: traceEvents,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to get trace";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
