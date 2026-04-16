/**
 * 04 - Scheduled Agent
 *
 * Shows how to trigger Managed Agent sessions on a schedule. The agent itself
 * is just a normal agent. The scheduling happens outside the API, using
 * whatever scheduler you prefer (cron, CI/CD, trigger.dev, etc.).
 *
 * This example creates a "daily digest" agent that checks for new GitHub
 * issues and summarizes them. You would run this script from a cron job
 * or a scheduled CI workflow.
 *
 * When to use what:
 * - Managed Agents + cron/CI: Full control, any trigger, any frequency.
 *   Best when you want to own the scheduling infrastructure.
 * - trigger.dev: Managed scheduling with retries, queues, and observability.
 *   Best when you need reliability guarantees and a dashboard.
 * - Claude Code /schedule: Built-in scheduling for personal dev workflows.
 *   Best for individual developer productivity (not production systems).
 *
 * Run: npx tsx scheduled.ts
 *
 * In production, you would schedule this with something like:
 *   # GitHub Actions (runs daily at 9am UTC)
 *   schedule:
 *     - cron: '0 9 * * *'
 *
 *   # Traditional cron
 *   0 9 * * * cd /path/to/project && npx tsx scheduled.ts
 *
 * The SDK handles the managed-agents-2026-04-01 beta header automatically.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Configure for your project
const GITHUB_ORG = "your-org";
const REPOS = ["repo-one", "repo-two", "repo-three"];

async function main() {
  console.log(`[${new Date().toISOString()}] Starting scheduled digest run...`);

  // -------------------------------------------------------------------
  // Create the agent (or reuse an existing one)
  //
  // In production, you would create the agent once and store its ID.
  // Then each scheduled run just creates a new session from that agent.
  // We create it fresh here for demonstration purposes.
  //
  // API: POST /v1/agents
  // -------------------------------------------------------------------
  const agent = await client.agents.create({
    name: "daily-digest",
    description: "Generates a daily summary of open GitHub issues across repos.",
    model: "claude-sonnet-4-6",
    system_prompt: `You are a project manager assistant. When triggered:

1. For each repository provided, search the web for its recent GitHub issues.
2. Categorize issues by priority: critical (bugs, security), high (feature requests with many reactions), normal (everything else).
3. Write a daily digest to /workspace/digest.md with:
   - Date and time of the report
   - Summary statistics (total open, new today, closed today)
   - Critical issues that need immediate attention
   - Trending issues (most discussed)
   - Suggested priorities for the day

Keep the digest concise and actionable. Focus on what changed since yesterday.`,
    tools: [{ type: "agent_toolset_20260401" }],
  });

  // -------------------------------------------------------------------
  // Create or reuse an environment
  //
  // For scheduled tasks, you typically reuse the same environment config.
  // Each session still gets its own isolated container.
  //
  // API: POST /v1/environments
  // -------------------------------------------------------------------
  const environment = await client.environments.create({
    name: "digest-env",
    description: "Clean environment for generating daily digests.",
  });

  // -------------------------------------------------------------------
  // Start a session and run the digest
  //
  // This is the core of the scheduled job. Create a session, send the
  // task, wait for completion. In production you might also:
  // - Store the session ID for debugging
  // - Post the digest to Slack via a webhook
  // - Save results to a database
  //
  // API: POST /v1/sessions
  // API: POST /v1/sessions/{id}/messages (streaming)
  // -------------------------------------------------------------------
  const session = await client.sessions.create({
    agent_id: agent.id,
    environment_id: environment.id,
  });

  console.log(`Session: ${session.id}`);

  const repoList = REPOS.map((r) => `- https://github.com/${GITHUB_ORG}/${r}`).join("\n");

  const stream = await client.sessions.messages.stream(session.id, {
    message: `Generate a daily digest for these repositories:\n\n${repoList}\n\nToday's date: ${new Date().toISOString().split("T")[0]}`,
  });

  // For scheduled tasks, we usually just want the final text output
  // rather than all the intermediate tool calls
  let fullOutput = "";

  for await (const event of stream) {
    if (event.type === "text_delta") {
      fullOutput += event.delta;
    } else if (event.type === "message_stop") {
      console.log("\nDigest generated successfully.");
    }
  }

  // In production, you would do something with the output here:
  // - Post to Slack
  // - Send an email
  // - Save to a database
  // - Create a GitHub issue
  console.log("\n--- DIGEST OUTPUT ---\n");
  console.log(fullOutput);
  console.log("\n--- END DIGEST ---");
  console.log(`\n[${new Date().toISOString()}] Scheduled run complete.`);
}

main().catch((err) => {
  console.error(`[${new Date().toISOString()}] Scheduled run failed:`, err.message);
  process.exit(1);
});
