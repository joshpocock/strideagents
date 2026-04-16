/**
 * 05 - Multi-Environment
 *
 * Same agent, different environments. This shows how to reuse a single
 * agent configuration across different runtime environments. The agent
 * adapts its behavior based on what tools are available in the container.
 *
 * This is useful when you have one agent that needs to work with
 * different tech stacks, or when you want to test the same agent
 * in different configurations.
 *
 * Run: npx tsx environments.ts
 *
 * The SDK handles the managed-agents-2026-04-01 beta header automatically.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

async function main() {
  // -------------------------------------------------------------------
  // Create a single agent that adapts to its environment
  //
  // The system prompt tells the agent to inspect its environment first
  // and then use whatever tools are available. This makes the agent
  // portable across different setups.
  //
  // API: POST /v1/agents
  // -------------------------------------------------------------------
  const agent = await client.agents.create({
    name: "polyglot-developer",
    description: "A developer agent that works in any language environment.",
    model: "claude-sonnet-4-6",
    system_prompt: `You are a developer assistant. When given a task:

1. First, inspect your environment: check what languages, package managers, and tools are installed.
2. Use whatever is available to complete the task.
3. Write clean, well-documented code.
4. Save all output to /workspace/.
5. If a test framework is available, write and run tests.

You adapt to your environment. If you have Python, write Python. If you have Node, write JavaScript/TypeScript. If you have both, pick the best tool for the job.`,
    tools: [{ type: "agent_toolset_20260401" }],
  });

  console.log(`Created agent: ${agent.id}\n`);

  // -------------------------------------------------------------------
  // Define three different environments
  //
  // Each environment has different software installed. The same agent
  // will behave differently in each one based on what is available.
  //
  // API: POST /v1/environments
  // -------------------------------------------------------------------

  // Environment 1: Python data science stack
  const pythonEnv = await client.environments.create({
    name: "python-data-science",
    description: "Python environment with pandas, numpy, and matplotlib.",
    setup_commands: [
      "pip install pandas numpy matplotlib seaborn scikit-learn",
    ],
  });

  console.log(`Python environment: ${pythonEnv.id}`);

  // Environment 2: Node.js web development stack
  const nodeEnv = await client.environments.create({
    name: "node-web-dev",
    description: "Node.js environment with Express, TypeScript, and testing tools.",
    setup_commands: [
      "npm init -y",
      "npm install express typescript tsx vitest @types/express @types/node",
    ],
  });

  console.log(`Node environment: ${nodeEnv.id}`);

  // Environment 3: Full-stack with both Python and Node
  const fullStackEnv = await client.environments.create({
    name: "full-stack",
    description: "Full-stack environment with Python, Node, Docker, and database tools.",
    setup_commands: [
      "pip install fastapi uvicorn sqlalchemy",
      "npm init -y",
      "npm install next react react-dom",
      "apt-get update && apt-get install -y sqlite3",
    ],
  });

  console.log(`Full-stack environment: ${fullStackEnv.id}`);

  // -------------------------------------------------------------------
  // Run the same task in each environment
  //
  // We send the exact same message to three different sessions, each
  // using a different environment. The agent will use different tools
  // and languages in each one.
  //
  // API: POST /v1/sessions
  // API: POST /v1/sessions/{id}/messages (streaming)
  // -------------------------------------------------------------------
  const task = "Build a simple REST API with one endpoint: GET /api/stats that returns JSON with the current timestamp, a random number, and the hostname. Include a health check endpoint. Write tests if a test framework is available.";

  const environments = [
    { env: pythonEnv, label: "Python" },
    { env: nodeEnv, label: "Node.js" },
    { env: fullStackEnv, label: "Full-Stack" },
  ];

  // Run sessions sequentially so the output is readable
  for (const { env, label } of environments) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Running in ${label} environment...`);
    console.log("=".repeat(60));

    const session = await client.sessions.create({
      agent_id: agent.id,
      environment_id: env.id,
    });

    const stream = await client.sessions.messages.stream(session.id, {
      message: task,
    });

    for await (const event of stream) {
      switch (event.type) {
        case "text_delta":
          process.stdout.write(event.delta);
          break;
        case "tool_use":
          console.log(`\n[${event.name}]`);
          break;
        case "message_stop":
          console.log(`\n\n[${label} session complete]`);
          break;
      }
    }
  }

  console.log("\n\nAll three environments processed the same task.");
  console.log("Compare the approaches each environment took!");
}

main().catch(console.error);
