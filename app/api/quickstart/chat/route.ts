import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * POST /api/quickstart/chat
 *
 * Send a message to a quickstart session and return the agent response.
 *
 * Body: { session_id: string, message: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id, message } = body;

    if (!session_id || !message) {
      return NextResponse.json(
        { error: "session_id and message are required" },
        { status: 400 }
      );
    }

    const client = getClient();

    // @ts-expect-error - turn may not be in current SDK type defs
    const response = await client.beta.sessions.turn(session_id, {
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    // Extract text from the response
    let response_text = "";
    if (response && typeof response === "object") {
      // Handle different response shapes
      if (Array.isArray(response)) {
        for (const event of response) {
          if (event?.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                response_text += block.text;
              }
            }
          }
        }
      } else if (response.message?.content) {
        for (const block of response.message.content) {
          if (block.type === "text" && block.text) {
            response_text += block.text;
          }
        }
      } else {
        response_text = JSON.stringify(response);
      }
    }

    return NextResponse.json({ response_text, raw: response });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Chat request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
