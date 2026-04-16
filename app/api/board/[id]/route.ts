import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getTask, updateTask, deleteTask } from "@/lib/db";

/**
 * PATCH /api/board/:id
 *
 * Update a task's status or other fields.
 *
 * When status changes to "in_progress", the handler:
 *   1. Creates a new Anthropic session for the task's agent
 *   2. Sends the task description as the first message
 *   3. Stores the session_id on the task for later streaming
 *
 * Body: { status?, result?, agent_id?, environment_id? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const body = await request.json();
    const { status, result, agent_id, environment_id } = body;

    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // When transitioning to in_progress, spin up a session and kick it off
    if (status === "in_progress" && task.status !== "in_progress") {
      const effectiveAgentId = agent_id || task.agent_id;
      if (!effectiveAgentId) {
        return NextResponse.json(
          { error: "agent_id is required to start a task" },
          { status: 400 }
        );
      }

      const client = getClient();

      // Create a session for this task
      const effectiveEnvId = environment_id || task.environment_id;
      const session = await client.beta.sessions.create({
        agent_id: effectiveAgentId,
        ...(effectiveEnvId && { environment_id: effectiveEnvId }),
      });

      // Update the task with the session info before sending the message
      updateTask(taskId, {
        status: "in_progress",
        session_id: session.id,
        agent_id: effectiveAgentId,
        ...(effectiveEnvId && { environment_id: effectiveEnvId }),
      });

      // Send the task description as the first message (fire and forget).
      // The frontend will stream results via /api/board/:id/stream.
      (client.beta.sessions as any).turn(session.id, {
          messages: [
            {
              role: "user",
              content: task.description,
            },
          ],
        })
        .then((response: any) => {
          // Extract the text result from the response
          let resultText = "";
          const resp = response as { content?: Array<{ type: string; text?: string }> };
          if (resp.content) {
            resultText = resp.content
              .filter((block: { type: string }) => block.type === "text")
              .map((block: { text?: string }) => block.text || "")
              .join("\n");
          }
          updateTask(taskId, { status: "done", result: resultText || "Completed" });
        })
        .catch((err: Error) => {
          updateTask(taskId, {
            status: "failed",
            result: `Agent failed: ${err.message}`,
          });
        });

      const updated = getTask(taskId);
      return NextResponse.json(updated);
    }

    // For other updates, just apply the fields directly
    const updated = updateTask(taskId, {
      ...(status && { status }),
      ...(result !== undefined && { result }),
      ...(agent_id && { agent_id }),
      ...(environment_id && { environment_id }),
    });

    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/board/:id
 * Remove a task from the board.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = parseInt(id, 10);
    const removed = deleteTask(taskId);

    if (!removed) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
