import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * POST /api/sessions/:id/messages
 *
 * Send a user message to an existing session and return the agent's response.
 *
 * Body: { message: string }
 *
 * The SDK sends the message to the session and waits for the agent to finish
 * processing (including any tool use loops). The full response is returned
 * as JSON once complete.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { message } = body;

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "message (string) is required" },
        { status: 400 }
      );
    }

    const client = getClient();

    // Send the user turn to the session.
    // The SDK handles polling until the agent's turn is complete.
    // @ts-expect-error - turn may not be in current SDK type defs
    const response = await client.beta.sessions.turn(id, {
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    return NextResponse.json(response);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
