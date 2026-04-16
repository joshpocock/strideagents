/**
 * 03 - Code Reviewer
 *
 * An agent that reviews code from a GitHub pull request. It clones the repo,
 * checks out the PR branch, analyzes the diff, and writes a structured review.
 *
 * This shows how to:
 * - Create an environment with specific software installed (git, node)
 * - Connect an MCP server for GitHub integration
 * - Give the agent a practical, production-ready task
 * - Handle multi-step workflows
 *
 * Run: GITHUB_TOKEN=ghp_xxx npx tsx reviewer.ts
 *
 * The SDK handles the managed-agents-2026-04-01 beta header automatically.
 */

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Configure these for your PR
const REPO_OWNER = "your-org";
const REPO_NAME = "your-repo";
const PR_NUMBER = 42;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";

async function main() {
  if (!GITHUB_TOKEN) {
    console.error("Set GITHUB_TOKEN environment variable to use the code reviewer.");
    console.error("Example: GITHUB_TOKEN=ghp_xxx npx tsx reviewer.ts");
    process.exit(1);
  }

  // -------------------------------------------------------------------
  // Create a code review agent
  //
  // The system prompt defines the review criteria and output format.
  // A well-structured prompt means consistent, useful reviews every time.
  //
  // API: POST /v1/agents
  // -------------------------------------------------------------------
  const agent = await client.agents.create({
    name: "code-reviewer",
    description: "Reviews pull requests for bugs, style issues, and improvement opportunities.",
    model: "claude-sonnet-4-6",
    system_prompt: `You are a senior software engineer conducting a code review. When given a PR to review:

1. Clone the repository and check out the PR branch.
2. Run \`git diff main...HEAD\` to see all changes.
3. Analyze the changes for:
   - Bugs or logic errors
   - Security vulnerabilities
   - Performance concerns
   - Code style and readability
   - Missing error handling
   - Test coverage gaps
4. Write a structured review to /workspace/review.md with:
   - Summary of changes (what the PR does)
   - Critical issues (must fix before merge)
   - Suggestions (nice to have improvements)
   - Approval recommendation (approve, request changes, or needs discussion)
5. Be constructive and specific. Reference file names and line numbers.

If the project has a linter or test suite, run those too and report any failures.`,
    tools: [{ type: "agent_toolset_20260401" }],
  });

  console.log(`Created code review agent: ${agent.id}`);

  // -------------------------------------------------------------------
  // Create an environment with git and development tools
  //
  // The environment setup_commands run once when the container starts.
  // This is where you install dependencies, configure git, clone repos,
  // or do any other setup work.
  //
  // API: POST /v1/environments
  // -------------------------------------------------------------------
  const environment = await client.environments.create({
    name: "code-review-env",
    description: "Environment with git, node, and GitHub CLI configured.",
    setup_commands: [
      // Configure git with the token so the agent can clone private repos
      `git config --global url."https://${GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"`,
      // Install GitHub CLI for richer PR interaction
      "apt-get update && apt-get install -y gh",
      `echo "${GITHUB_TOKEN}" | gh auth login --with-token`,
    ],
  });

  console.log(`Created environment: ${environment.id}`);

  // -------------------------------------------------------------------
  // Start a session and request the review
  //
  // API: POST /v1/sessions
  // API: POST /v1/sessions/{id}/messages (streaming)
  // -------------------------------------------------------------------
  const session = await client.sessions.create({
    agent_id: agent.id,
    environment_id: environment.id,
  });

  console.log(`Session started: ${session.id}`);
  console.log(`\nReviewing: ${REPO_OWNER}/${REPO_NAME}#${PR_NUMBER}\n`);
  console.log("=".repeat(60));

  const stream = await client.sessions.messages.stream(session.id, {
    message: `Review this pull request:

Repository: https://github.com/${REPO_OWNER}/${REPO_NAME}
PR number: ${PR_NUMBER}

Clone the repo, check out the PR branch, analyze the diff, and write a thorough review.
If there are tests, run them. If there is a linter, run it.`,
  });

  for await (const event of stream) {
    switch (event.type) {
      case "text_delta":
        process.stdout.write(event.delta);
        break;

      case "tool_use":
        // Show what the agent is doing at each step
        if (event.name === "bash") {
          console.log(`\n[Running command...]`);
        } else {
          console.log(`\n[${event.name}]`);
        }
        break;

      case "message_stop":
        console.log("\n\n" + "=".repeat(60));
        console.log("Review complete. Check /workspace/review.md in the session container.");
        break;
    }
  }
}

main().catch(console.error);
