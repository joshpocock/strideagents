/**
 * 01 - Basic Agent
 *
 * The simplest possible Managed Agent. This example walks through the full
 * lifecycle: create an agent config, create an environment, start a session,
 * send a message, and stream the response.
 *
 * Run: npx tsx create-agent.ts
 *
 * Note: The SDK automatically sets the required beta header:
 *   managed-agents-2026-04-01
 * You do not need to set it manually, but it is good to know it exists.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  // ---------------------------------------------------------------
  // Step 1: Create an Agent
  //
  // An agent is a reusable configuration. It defines the model,
  // system prompt, and tools. You create it once and then spin up
  // as many sessions as you want from it.
  //
  // API: POST /v1/agents
  // ---------------------------------------------------------------
  const agent = await client.agents.create({
    name: "basic-assistant",
    description: "A simple assistant that answers questions and writes files.",
    model: "claude-sonnet-4-6",
    system_prompt:
      "You are a helpful assistant. When asked to create files, write them to the /workspace directory. Be concise and direct.",
    // agent_toolset_20260401 gives the agent bash, file ops, web search, and web fetch
    tools: [{ type: "agent_toolset_20260401" }],
  });

  console.log(`Created agent: ${agent.id}`);

  // ---------------------------------------------------------------
  // Step 2: Create an Environment
  //
  // An environment is the container template your agent runs in.
  // It defines what software is installed and what the filesystem
  // looks like. Think of it as a Dockerfile for your agent.
  //
  // API: POST /v1/environments
  // ---------------------------------------------------------------
  const environment = await client.environments.create({
    name: "basic-env",
    description: "Default environment with standard tools.",
  });

  console.log(`Created environment: ${environment.id}`);

  // ---------------------------------------------------------------
  // Step 3: Create a Session
  //
  // A session is a running instance of your agent in an environment.
  // Each session is fully isolated with its own filesystem and state.
  // Files written in one message persist for subsequent messages
  // within the same session.
  //
  // API: POST /v1/sessions
  // ---------------------------------------------------------------
  const session = await client.sessions.create({
    agent_id: agent.id,
    environment_id: environment.id,
  });

  console.log(`Created session: ${session.id}`);

  // ---------------------------------------------------------------
  // Step 4: Send a message and stream the response
  //
  // Messages are sent to a session. The response comes back as
  // Server-Sent Events (SSE), giving you real-time visibility into
  // what the agent is doing: tool calls, text output, status changes.
  //
  // API: POST /v1/sessions/{id}/messages (streaming)
  // ---------------------------------------------------------------
  console.log("\nSending message...\n");

  const stream = await client.sessions.messages.stream(session.id, {
    message: "Write a haiku about cloud computing and save it to /workspace/haiku.txt. Then read it back to confirm.",
  });

  // Process events as they arrive
  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        // The agent is generating text output
        process.stdout.write(event.delta);
        break;

      case "tool_use":
        // The agent is calling a tool (bash, file write, etc.)
        console.log(`\n[Tool: ${event.name}]`);
        break;

      case "tool_result":
        // A tool call has completed
        console.log(`[Tool result received]`);
        break;

      case "message_stop":
        // The agent has finished responding
        console.log("\n\nDone.");
        break;
    }
  }
}

main().catch(console.error);
