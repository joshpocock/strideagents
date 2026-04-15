/**
 * Anthropic SDK helper for Claude Managed Agents.
 *
 * Handles creating agents, environments, and sessions, plus
 * sending messages and polling for responses.
 *
 * The SDK handles the beta header (interop-2025-01-24) automatically
 * when using client.agents, client.environments, and client.sessions.
 *
 * This replaces n8n's 10-node workflow with plain SDK calls.
 * No visual workflow builder, no webhook nodes, no JSON parsing nodes.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { SessionRow } from "./db";

// --- Config ---

const AGENT_MODEL = "claude-sonnet-4-6";
const AGENT_NAME = "chat-assistant";
const SYSTEM_PROMPT =
  "You are a helpful customer support assistant. Be friendly, concise, and helpful. " +
  "If you cannot help with something, let the user know clearly.";

// Initialize the SDK client. Reads ANTHROPIC_API_KEY from environment.
const client = new Anthropic();

// --- Create a new agent + environment + session ---

/**
 * Creates a complete managed agent session:
 * 1. Agent (defines model, system prompt, tools)
 * 2. Environment (sandbox for the agent)
 * 3. Session (conversation thread)
 *
 * Returns a SessionRow ready to be stored in SQLite.
 */
export async function createAgentSession(chatId: string): Promise<SessionRow> {
  // Step 1: Create the agent
  // The agent defines what model to use, the system prompt, and available tools.
  // agent_toolset_20260401 gives the agent access to its standard toolset.
  const agent = await client.agents.create({
    name: AGENT_NAME,
    model: AGENT_MODEL,
    instructions: SYSTEM_PROMPT,
    tools: [{ type: "agent_toolset_20260401" }],
  });
  console.log(`[${chatId}] Agent created: ${agent.id}`);

  // Step 2: Create an environment
  // The environment is an isolated sandbox for the agent to operate in.
  const environment = await client.environments.create({
    agent_id: agent.id,
    name: `env-${chatId}`,
  });
  console.log(`[${chatId}] Environment created: ${environment.id}`);

  // Step 3: Create a session
  // A session is a single conversation thread within the environment.
  // Multiple sessions can exist in one environment if needed.
  const session = await client.sessions.create({
    agent_id: agent.id,
    environment_id: environment.id,
  });
  console.log(`[${chatId}] Session created: ${session.id}`);

  return {
    chat_id: chatId,
    agent_id: agent.id,
    environment_id: environment.id,
    session_id: session.id,
    created_at: new Date().toISOString(),
  };
}

// --- Send a message and poll for the response ---

/**
 * Sends a user message to an existing session, then polls the events
 * endpoint until Claude responds with text.
 *
 * In production, you would use webhooks or streaming instead of polling.
 * This polling approach is simpler for demos but adds latency.
 *
 * Times out after 30 seconds if no response is received.
 */
export async function sendAndGetResponse(
  session: SessionRow,
  message: string
): Promise<string> {
  console.log(
    `[${session.chat_id}] Sending message: "${message.slice(0, 80)}..."`
  );

  // Send the user's message to the session
  await client.sessions.messages.create(session.session_id, {
    agent_id: session.agent_id,
    environment_id: session.environment_id,
    message: {
      role: "user",
      content: message,
    },
  });

  // Poll for Claude's response by checking session events
  const maxAttempts = 60; // 30 seconds at 500ms intervals
  const pollInterval = 500;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));

    // Fetch events from the session
    const events = await client.sessions.events.list(session.session_id, {
      agent_id: session.agent_id,
      environment_id: session.environment_id,
    });

    // Scan from the end to find the most recent assistant message
    const eventList = events.data ?? [];
    for (let i = eventList.length - 1; i >= 0; i--) {
      const event = eventList[i];

      if (
        event.type === "agent.message" &&
        event.message?.role === "assistant"
      ) {
        // Extract text from content blocks
        const textBlocks = (event.message.content ?? []).filter(
          (block: any) => block.type === "text"
        );

        if (textBlocks.length > 0) {
          const responseText = textBlocks
            .map((b: any) => b.text)
            .join("\n");
          console.log(
            `[${session.chat_id}] Got response (attempt ${attempt + 1})`
          );
          return responseText;
        }
      }
    }
  }

  throw new Error("Timed out waiting for Claude's response (30s)");
}
