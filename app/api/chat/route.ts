import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getChatSession, insertChatSession } from "@/lib/db";

/**
 * POST /api/chat
 *
 * High-level chat endpoint that abstracts away session management.
 * The frontend sends a chat_id and message. If no Anthropic session exists
 * for that chat_id yet, one is created automatically. The message is then
 * forwarded to the session and the agent's response is returned.
 *
 * Body: {
 *   chat_id: string       - stable local identifier for this conversation
 *   message: string       - the user's message
 *   agent_id?: string     - required on the first message to create a session
 *   environment_id?: string - optional environment for the session
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chat_id, message, agent_id, environment_id } = body;

    if (!chat_id || !message) {
      return NextResponse.json(
        { error: "chat_id and message are required" },
        { status: 400 }
      );
    }

    const client = getClient();
    let session = getChatSession(chat_id);

    // If this is a new conversation, create a session first
    if (!session) {
      if (!agent_id) {
        return NextResponse.json(
          { error: "agent_id is required for the first message in a new chat" },
          { status: 400 }
        );
      }

      const newSession = await client.beta.sessions.create({
        agent_id,
        ...(environment_id && { environment_id }),
      });

      const sessionRecord = {
        chat_id,
        agent_id,
        environment_id: environment_id || "",
        session_id: newSession.id,
      };

      insertChatSession(sessionRecord);
      session = sessionRecord as unknown as typeof session;
    }

    // Send the user message to the session
    // @ts-expect-error - turn may not be in current SDK type defs
    const response = await client.beta.sessions.turn(session!.session_id, {
      messages: [
        {
          role: "user",
          content: message,
        },
      ],
    });

    return NextResponse.json({
      chat_id,
      session_id: session!.session_id,
      response,
    });
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : "Chat request failed";
    return NextResponse.json({ error: errMsg }, { status: 500 });
  }
}
