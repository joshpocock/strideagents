import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

interface ActivityEvent {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  type: string;
  description: string;
  timestamp: string;
}

/**
 * GET /api/activity
 * Fetches recent sessions and their latest events to build an activity feed.
 * Returns the last 50 events sorted by time (newest first).
 */
export async function GET() {
  try {
    const client = getClient();
    const activityEvents: ActivityEvent[] = [];

    // Fetch agents for name lookup
    let agentMap: Record<string, string> = {};
    try {
      const agentsData = await client.beta.agents.list();
      const agents = Array.isArray(agentsData)
        ? agentsData
        : (agentsData as unknown as { data?: Array<Record<string, unknown>> }).data || [];

      for (const agent of agents as Array<Record<string, unknown>>) {
        agentMap[agent.id as string] = (agent.name as string) || "Unnamed Agent";
      }
    } catch {
      // Agents may not be available
    }

    // Fetch recent sessions
    let sessions: Array<Record<string, unknown>> = [];
    try {
      const sessionsData = await client.beta.sessions.list({});
      sessions = Array.isArray(sessionsData)
        ? sessionsData
        : (sessionsData as unknown as { data?: Array<Record<string, unknown>> }).data || [];
    } catch {
      // Sessions may not be available
    }

    // For each recent session (limit to 10 most recent), get events
    const recentSessions = sessions.slice(0, 10);

    for (const session of recentSessions) {
      const sessionId = session.id as string;
      const agentId = session.agent_id as string;
      const agentName = agentMap[agentId] || "Unknown Agent";

      try {
        // @ts-expect-error - list_events may not be in current SDK type defs
        const eventData = await client.beta.sessions.list_events(sessionId, {});
        const rawEvents = Array.isArray(eventData)
          ? eventData
          : (eventData as unknown as { data?: unknown[] }).data || [];

        for (const event of rawEvents as Array<Record<string, unknown>>) {
          const type = event.type as string;
          let eventType = "status";
          let description = "";

          if (
            type === "content_block_start" &&
            (event.content_block as Record<string, unknown>)?.type === "tool_use"
          ) {
            eventType = "tool_use";
            description = `Used tool: ${(event.content_block as Record<string, unknown>)?.name || "unknown"}`;
          } else if (type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown>;
            if (delta?.type === "text_delta") {
              eventType = "text";
              const text = (delta.text as string) || "";
              description =
                text.length > 80 ? text.substring(0, 80) + "..." : text;
            } else {
              continue; // Skip partial JSON deltas
            }
          } else if (type === "message_start") {
            eventType = "status";
            description = "Started processing";
          } else if (type === "message_stop") {
            eventType = "status";
            description = "Finished processing";
          } else if (type === "session.completed") {
            eventType = "status";
            description = "Session completed";
          } else if (type === "session.failed") {
            eventType = "error";
            description = "Session failed";
          } else if (type === "error") {
            eventType = "error";
            description =
              ((event.error as Record<string, unknown>)?.message as string) ||
              "Error occurred";
          } else {
            continue; // Skip unknown event types
          }

          activityEvents.push({
            id: `${sessionId}-${(event.id as string) || activityEvents.length}`,
            sessionId,
            agentId,
            agentName,
            type: eventType,
            description,
            timestamp:
              (event.created_at as string) ||
              (session.created_at as string) ||
              new Date().toISOString(),
          });
        }
      } catch {
        // If we can't get events for a session, add a session-level entry
        activityEvents.push({
          id: `session-${sessionId}`,
          sessionId,
          agentId,
          agentName,
          type: "status",
          description: `Session ${(session.status as string) || "created"}`,
          timestamp:
            (session.created_at as string) || new Date().toISOString(),
        });
      }
    }

    // Sort by timestamp descending and limit to 50
    activityEvents.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json(activityEvents.slice(0, 50));
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch activity";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
