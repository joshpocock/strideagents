import { getClient } from "@/lib/anthropic";
import { getTask } from "@/lib/db";

/**
 * GET /api/board/:id/stream
 *
 * Server-Sent Events endpoint that streams real-time events from a task's
 * Anthropic session. The frontend connects using EventSource to watch the
 * agent work on the task.
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

  // Wait for session_id to be set (PATCH may still be creating the session)
  let sessionId = task.session_id;
  if (!sessionId) {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const refreshed = getTask(taskId);
      if (refreshed?.session_id) {
        sessionId = refreshed.session_id;
        break;
      }
    }
  }

  if (!sessionId) {
    return new Response(
      JSON.stringify({ error: "Task has no active session" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Emit SSE frames WITHOUT named `event:` prefixes so the browser's
      // EventSource.onmessage handler picks them up. The event type is
      // already carried inside the JSON payload (data.type).
      function sendEvent(eventName: string, data: unknown) {
        const payload = `data: ${JSON.stringify({ ...(data as object), type: (data as any)?.type ?? eventName })}\n\n`;
        controller.enqueue(encoder.encode(payload));
      }

      try {
        const client = getClient();

        sendEvent("task_status", {
          id: task.id,
          title: task.title,
          status: task.status,
          session_id: sessionId,
        });

        // Use the SDK's event stream
        const eventStream = await (
          client.beta as any
        ).sessions.events.stream(sessionId);

        for await (const event of eventStream as AsyncIterable<any>) {
          sendEvent(event.type || "message", event);

          // Stop on terminal events
          if (
            event.type === "session.status_idle" ||
            event.type === "session.status_terminated" ||
            event.type === "session.deleted"
          ) {
            break;
          }
        }

        const finalTask = getTask(taskId);
        sendEvent("task_complete", {
          id: taskId,
          status: finalTask?.status || "done",
          result: finalTask?.result,
        });

        sendEvent("done", { status: "stream_complete" });
        controller.close();
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Stream error";
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
