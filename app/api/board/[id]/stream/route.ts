import { getClient } from "@/lib/anthropic";
import { getTask } from "@/lib/db";

/**
 * GET /api/board/:id/stream
 *
 * Server-Sent Events endpoint that streams real-time events from a task's
 * Anthropic session. The frontend connects using EventSource to watch the
 * agent work on the task.
 *
 * The task must already have a session_id (status = "in_progress").
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const taskId = parseInt(id, 10);
  const task = getTask(taskId);

  if (!task) {
    return new Response(JSON.stringify({ error: "Task not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!task.session_id) {
    return new Response(
      JSON.stringify({ error: "Task has no active session. Start the task first." }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const sessionId = task.session_id;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function sendEvent(event: string, data: unknown) {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const client = getClient();

        // Send the current task state as the first event
        sendEvent("task_status", {
          id: task.id,
          title: task.title,
          status: task.status,
          session_id: sessionId,
        });

        // Stream session events using the SDK or polling fallback
        if (typeof (client.beta.sessions as any).stream === "function") {
          const eventStream = (client.beta.sessions as any).stream(sessionId);

          for await (const event of eventStream) {
            sendEvent(event.type || "message", event);
          }
        } else {
          // Polling fallback: check for events every 2 seconds
          let lastEventId: string | undefined;
          let done = false;
          let pollCount = 0;
          const maxPolls = 300; // 10 minutes max at 2s intervals

          while (!done && pollCount < maxPolls) {
            pollCount++;

            try {
              const listParams: Record<string, unknown> = {};
              if (lastEventId) {
                listParams.after = lastEventId;
              }

              // @ts-expect-error - list_events may not be in current SDK type defs
              const events = await client.beta.sessions.list_events(sessionId, listParams);
              const eventList = Array.isArray(events)
                ? events
                : (events as unknown as { data?: unknown[] }).data || [];

              for (const event of eventList as Array<{
                id?: string;
                type?: string;
                [key: string]: unknown;
              }>) {
                sendEvent(event.type || "message", event);
                if (event.id) {
                  lastEventId = event.id;
                }

                if (
                  event.type === "session.completed" ||
                  event.type === "session.failed"
                ) {
                  done = true;
                }
              }

              if (!done) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } catch {
              // Stop polling on error
              done = true;
            }
          }
        }

        // Refresh the task to send the final status
        const finalTask = getTask(taskId);
        sendEvent("task_complete", {
          id: taskId,
          status: finalTask?.status || "done",
          result: finalTask?.result,
        });

        sendEvent("done", { status: "stream_complete" });
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
