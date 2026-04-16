/**
 * 02 - Deep Researcher
 *
 * A research agent that searches the web for information on a topic,
 * synthesizes findings, and writes a structured report to disk.
 *
 * This shows how to:
 * - Give an agent a research-focused system prompt
 * - Use the built-in web search and file write tools
 * - Stream events and watch the agent work in real time
 * - Collect the final output
 *
 * Run: npx tsx researcher.ts
 *
 * The SDK handles the managed-agents-2026-04-01 beta header automatically.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Change this to whatever you want to research
const RESEARCH_TOPIC = "The current state of WebAssembly in 2026: adoption, performance benchmarks, and major use cases";

async function main() {
  // -------------------------------------------------------------------
  // Create a research-focused agent
  //
  // The system prompt is where the magic happens. A good system prompt
  // turns a general-purpose agent into a specialist. Here we tell it
  // exactly how to structure its research process.
  //
  // API: POST /v1/agents
  // -------------------------------------------------------------------
  const agent = await client.agents.create({
    name: "deep-researcher",
    description: "Searches the web, synthesizes information, and writes structured reports.",
    model: "claude-sonnet-4-6",
    system_prompt: `You are a research analyst. When given a topic:

1. Search the web for recent, authoritative sources (at least 5 different searches).
2. Read the most relevant pages to gather detailed information.
3. Synthesize your findings into a well-structured markdown report.
4. Save the report to /workspace/report.md.
5. Save a sources list to /workspace/sources.md with URLs and brief descriptions.

Your report should include:
- Executive summary (2-3 sentences)
- Key findings (organized by theme)
- Data points and statistics where available
- Open questions or areas needing further research

Be thorough but concise. Cite your sources inline using [Source Name](URL) format.`,
    tools: [{ type: "agent_toolset_20260401" }],
  });

  console.log(`Created research agent: ${agent.id}`);

  // -------------------------------------------------------------------
  // Create an environment for the researcher
  //
  // The default environment works fine here since we only need
  // web search, web fetch, and file writing. All of those come
  // built in with agent_toolset_20260401.
  //
  // API: POST /v1/environments
  // -------------------------------------------------------------------
  const environment = await client.environments.create({
    name: "research-env",
    description: "Clean environment for web research and report writing.",
  });

  // -------------------------------------------------------------------
  // Start a session and send the research request
  //
  // API: POST /v1/sessions
  // API: POST /v1/sessions/{id}/messages (streaming)
  // -------------------------------------------------------------------
  const session = await client.sessions.create({
    agent_id: agent.id,
    environment_id: environment.id,
  });

  console.log(`Session started: ${session.id}`);
  console.log(`\nResearching: "${RESEARCH_TOPIC}"\n`);
  console.log("=".repeat(60));

  const stream = await client.sessions.messages.stream(session.id, {
    message: `Research the following topic and write a comprehensive report:\n\n${RESEARCH_TOPIC}`,
  });

  // Track what the agent is doing so we can show a nice summary
  let toolCallCount = 0;
  let searchCount = 0;

  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        process.stdout.write(event.delta);
        break;

      case "tool_use":
        toolCallCount++;
        if (event.name === "web_search") {
          searchCount++;
          console.log(`\n[Search #${searchCount}: ${JSON.stringify(event.input).slice(0, 80)}...]`);
        } else if (event.name === "web_fetch") {
          console.log(`\n[Fetching URL...]`);
        } else if (event.name === "file_write") {
          console.log(`\n[Writing file...]`);
        } else {
          console.log(`\n[Tool: ${event.name}]`);
        }
        break;

      case "tool_result":
        // We don't print tool results to keep output clean
        break;

      case "message_stop":
        console.log("\n\n" + "=".repeat(60));
        console.log(`Research complete. ${searchCount} web searches, ${toolCallCount} total tool calls.`);
        console.log("Report saved to /workspace/report.md in the session container.");
        break;
    }
  }
}

main().catch(console.error);
