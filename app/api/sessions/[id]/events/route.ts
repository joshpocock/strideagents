import { getClient } from "@/lib/anthropic";

/**
 * GET /api/sessions/:id/events
 *
 * Server-Sent Events endpoint that streams events from an Anthropic session.
 * The frontend connects using EventSource and receives real-time updates
 * as the agent works (tool calls, text output, status changes, etc.).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Create a readable stream that pushes SSE-formatted data
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Helper to send an SSE event to the client
      function sendEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const client = getClient();

        // Attempt to use the SDK streaming method.
        // If client.beta.sessions.stream() exists, use it.
        // Otherwise fall back to polling the events list endpoint.
        if (typeof (client.beta.sessions as any).stream === "function") {
          const eventStream = (client.beta.sessions as any).stream(id);

          for await (const event of eventStream) {
            sendEvent(event.type || "message", event);
          }
        } else {
          // Fallback: poll the events list endpoint every 2 seconds
          let lastEventId: string | undefined;
          let done = false;

          while (!done) {
            try {
              const listParams: Record<string, unknown> = {};
              if (lastEventId) {
                listParams.after = lastEventId;
              }

              // @ts-expect-error - list_events may not be in current SDK type defs
              const events = await client.beta.sessions.list_events(id, listParams);
              const eventList = Array.isArray(events) ? events : (events as unknown as { data?: unknown[] }).data || [];

              for (const event of eventList as Array<{ id?: string; type?: string; [key: string]: unknown }>) {
                sendEvent(event.type || "message", event);
                if (event.id) {
                  lastEventId = event.id;
                }

                // Check if the session has ended
                if (event.type === "session.completed" || event.type === "session.failed") {
                  done = true;
                }
              }

              if (!done) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } catch {
              // If polling fails, close the stream gracefully
              done = true;
            }
          }
        }

        sendEvent("done", { status: "complete" });
        controller.close();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : "Stream error";
        sendEvent("error", { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
