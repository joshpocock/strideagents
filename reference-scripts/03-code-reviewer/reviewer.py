"""
03 - Code Reviewer

An agent that reviews code from a GitHub pull request. It clones the repo,
checks out the PR branch, analyzes the diff, and writes a structured review.

This shows how to:
- Create an environment with specific software installed (git, node)
- Connect an MCP server for GitHub integration
- Give the agent a practical, production-ready task
- Handle multi-step workflows

Run: GITHUB_TOKEN=ghp_xxx python reviewer.py

The SDK handles the managed-agents-2026-04-01 beta header automatically.
"""

import os
import sys

import anthropic

# Configure these for your PR
REPO_OWNER = "your-org"
REPO_NAME = "your-repo"
PR_NUMBER = 42
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")


def main():
    if not GITHUB_TOKEN:
        print("Set GITHUB_TOKEN environment variable to use the code reviewer.")
        print("Example: GITHUB_TOKEN=ghp_xxx python reviewer.py")
        sys.exit(1)

    client = anthropic.Anthropic()

    # -------------------------------------------------------------------
    # Create a code review agent
    #
    # The system prompt defines the review criteria and output format.
    #
    # API: POST /v1/agents
    # -------------------------------------------------------------------
    agent = client.agents.create(
        name="code-reviewer",
        description="Reviews pull requests for bugs, style issues, and improvement opportunities.",
        model="claude-sonnet-4-6",
        system_prompt=(
            "You are a senior software engineer conducting a code review. When given a PR to review:\n\n"
            "1. Clone the repository and check out the PR branch.\n"
            "2. Run `git diff main...HEAD` to see all changes.\n"
            "3. Analyze the changes for:\n"
            "   - Bugs or logic errors\n"
            "   - Security vulnerabilities\n"
            "   - Performance concerns\n"
            "   - Code style and readability\n"
            "   - Missing error handling\n"
            "   - Test coverage gaps\n"
            "4. Write a structured review to /workspace/review.md with:\n"
            "   - Summary of changes (what the PR does)\n"
            "   - Critical issues (must fix before merge)\n"
            "   - Suggestions (nice to have improvements)\n"
            "   - Approval recommendation (approve, request changes, or needs discussion)\n"
            "5. Be constructive and specific. Reference file names and line numbers.\n\n"
            "If the project has a linter or test suite, run those too and report any failures."
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )

    print(f"Created code review agent: {agent.id}")

    # -------------------------------------------------------------------
    # Create an environment with git and development tools
    #
    # The setup_commands run once when the container starts. This is where
    # you install dependencies, configure git, or do any other prep work.
    #
    # API: POST /v1/environments
    # -------------------------------------------------------------------
    environment = client.environments.create(
        name="code-review-env",
        description="Environment with git, node, and GitHub CLI configured.",
        setup_commands=[
            # Configure git with the token for private repo access
            f'git config --global url."https://{GITHUB_TOKEN}@github.com/".insteadOf "https://github.com/"',
            # Install GitHub CLI
            "apt-get update && apt-get install -y gh",
            f'echo "{GITHUB_TOKEN}" | gh auth login --with-token',
        ],
    )

    print(f"Created environment: {environment.id}")

    # -------------------------------------------------------------------
    # Start a session and request the review
    #
    # API: POST /v1/sessions
    # API: POST /v1/sessions/{id}/messages (streaming)
    # -------------------------------------------------------------------
    session = client.sessions.create(
        agent_id=agent.id,
        environment_id=environment.id,
    )

    print(f"Session started: {session.id}")
    print(f"\nReviewing: {REPO_OWNER}/{REPO_NAME}#{PR_NUMBER}\n")
    print("=" * 60)

    with client.sessions.messages.stream(
        session_id=session.id,
        message=(
            f"Review this pull request:\n\n"
            f"Repository: https://github.com/{REPO_OWNER}/{REPO_NAME}\n"
            f"PR number: {PR_NUMBER}\n\n"
            f"Clone the repo, check out the PR branch, analyze the diff, "
            f"and write a thorough review. If there are tests, run them. "
            f"If there is a linter, run it."
        ),
    ) as stream:
        for event in stream:
            if event.type == "text_delta":
                print(event.delta, end="", flush=True)

            elif event.type == "tool_use":
                if event.name == "bash":
                    print("\n[Running command...]")
                else:
                    print(f"\n[{event.name}]")

            elif event.type == "message_stop":
                print("\n\n" + "=" * 60)
                print("Review complete. Check /workspace/review.md in the session container.")


if __name__ == "__main__":
    main()
