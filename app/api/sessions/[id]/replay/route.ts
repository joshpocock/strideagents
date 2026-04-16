import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/sessions/:id/replay
 * Fetches all events for a session and returns them with timing data
 * for the replay timeline UI.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const client = getClient();

    // Fetch session details
    let session;
    try {
      session = await client.beta.sessions.retrieve(id);
    } catch {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Fetch events for the session
    let events: Array<Record<string, unknown>> = [];
    try {
      // @ts-expect-error - list_events may not be in current SDK type defs
      const eventData = await client.beta.sessions.list_events(id, {});
      const rawEvents = Array.isArray(eventData)
        ? eventData
        : (eventData as unknown as { data?: unknown[] }).data || [];

      // Process events into replay format
      let baseTime: number | null = null;
      events = (rawEvents as Array<Record<string, unknown>>).map(
        (event, index) => {
          const timestamp = (event.created_at as string) || new Date().toISOString();
          const eventTime = new Date(timestamp).getTime();

          if (baseTime === null) baseTime = eventTime;
          const offsetMs = eventTime - (baseTime || 0);

          let eventType = "unknown";
          let description = "";
          let detail = event;

          const type = event.type as string;

          if (
            type === "content_block_start" &&
            (event.content_block as Record<string, unknown>)?.type === "tool_use"
          ) {
            eventType = "tool_use";
            description = `Tool: ${(event.content_block as Record<string, unknown>)?.name || "unknown"}`;
          } else if (type === "content_block_delta") {
            const delta = event.delta as Record<string, unknown>;
            if (delta?.type === "text_delta") {
              eventType = "text";
              description = ((delta.text as string) || "").substring(0, 100);
            } else if (delta?.type === "input_json_delta") {
              eventType = "tool_use";
              description = "Tool input data";
            }
          } else if (type === "message_start") {
            eventType = "status";
            description = "Agent started processing";
          } else if (type === "message_stop") {
            eventType = "status";
            description = "Agent finished processing";
          } else if (type === "session.completed") {
            eventType = "status";
            description = "Session completed";
          } else if (type === "session.failed") {
            eventType = "error";
            description =
              (event.error as Record<string, unknown>)?.message as string ||
              "Session failed";
          } else if (type === "error") {
            eventType = "error";
            description =
              ((event.error as Record<string, unknown>)?.message as string) ||
              "Error occurred";
          } else {
            eventType = "status";
            description = type || "Event";
          }

          return {
            id: (event.id as string) || `event-${index}`,
            index,
            type: eventType,
            rawType: type,
            description,
            timestamp,
            offsetMs,
            detail,
          };
        }
      );
    } catch {
      // Events may not be available
    }

    // Calculate duration
    let durationMs = 0;
    if (events.length > 1) {
      const first = events[0].offsetMs as number;
      const last = events[events.length - 1].offsetMs as number;
      durationMs = last - first;
    }

    // Estimate token count from events
    let tokenEstimate = 0;
    for (const event of events) {
      if ((event.type as string) === "text") {
        tokenEstimate += Math.ceil(
          ((event.description as string) || "").length / 4
        );
      }
    }

    return NextResponse.json({
      session: {
        id: (session as unknown as Record<string, unknown>).id || id,
        agent_id: (session as unknown as Record<string, unknown>).agent_id,
        status: (session as unknown as Record<string, unknown>).status || "unknown",
        created_at: (session as unknown as Record<string, unknown>).created_at,
        durationMs,
        tokenEstimate,
      },
      events,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch replay data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
