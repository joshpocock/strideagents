"""
04 - Scheduled Agent

Shows how to trigger Managed Agent sessions on a schedule. The agent itself
is just a normal agent. The scheduling happens outside the API, using
whatever scheduler you prefer (cron, CI/CD, trigger.dev, etc.).

This example creates a "daily digest" agent that checks for new GitHub
issues and summarizes them.

When to use what:
- Managed Agents + cron/CI: Full control, any trigger, any frequency.
  Best when you want to own the scheduling infrastructure.
- trigger.dev: Managed scheduling with retries, queues, and observability.
  Best when you need reliability guarantees and a dashboard.
- Claude Code /schedule: Built-in scheduling for personal dev workflows.
  Best for individual developer productivity (not production systems).

Run: python scheduled.py

In production, you would schedule this with something like:
  # GitHub Actions (runs daily at 9am UTC)
  schedule:
    - cron: '0 9 * * *'

  # Traditional cron
  0 9 * * * cd /path/to/project && python scheduled.py

The SDK handles the managed-agents-2026-04-01 beta header automatically.
"""

import sys
from datetime import datetime, timezone

import anthropic

# Configure for your project
GITHUB_ORG = "your-org"
REPOS = ["repo-one", "repo-two", "repo-three"]


def main():
    now = datetime.now(timezone.utc).isoformat()
    print(f"[{now}] Starting scheduled digest run...")

    client = anthropic.Anthropic()

    # -------------------------------------------------------------------
    # Create the agent (or reuse an existing one)
    #
    # In production, you would create the agent once and store its ID.
    # Then each scheduled run just creates a new session from that agent.
    #
    # API: POST /v1/agents
    # -------------------------------------------------------------------
    agent = client.agents.create(
        name="daily-digest",
        description="Generates a daily summary of open GitHub issues across repos.",
        model="claude-sonnet-4-6",
        system_prompt=(
            "You are a project manager assistant. When triggered:\n\n"
            "1. For each repository provided, search the web for its recent GitHub issues.\n"
            "2. Categorize issues by priority: critical (bugs, security), "
            "high (feature requests with many reactions), normal (everything else).\n"
            "3. Write a daily digest to /workspace/digest.md with:\n"
            "   - Date and time of the report\n"
            "   - Summary statistics (total open, new today, closed today)\n"
            "   - Critical issues that need immediate attention\n"
            "   - Trending issues (most discussed)\n"
            "   - Suggested priorities for the day\n\n"
            "Keep the digest concise and actionable. Focus on what changed since yesterday."
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )

    # -------------------------------------------------------------------
    # Create or reuse an environment
    #
    # API: POST /v1/environments
    # -------------------------------------------------------------------
    environment = client.environments.create(
        name="digest-env",
        description="Clean environment for generating daily digests.",
    )

    # -------------------------------------------------------------------
    # Start a session and run the digest
    #
    # This is the core of the scheduled job. Create a session, send the
    # task, wait for completion.
    #
    # API: POST /v1/sessions
    # API: POST /v1/sessions/{id}/messages (streaming)
    # -------------------------------------------------------------------
    session = client.sessions.create(
        agent_id=agent.id,
        environment_id=environment.id,
    )

    print(f"Session: {session.id}")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    repo_list = "\n".join(
        f"- https://github.com/{GITHUB_ORG}/{r}" for r in REPOS
    )

    full_output = ""

    with client.sessions.messages.stream(
        session_id=session.id,
        message=(
            f"Generate a daily digest for these repositories:\n\n"
            f"{repo_list}\n\n"
            f"Today's date: {today}"
        ),
    ) as stream:
        for event in stream:
            if event.type == "text_delta":
                full_output += event.delta

            elif event.type == "message_stop":
                print("\nDigest generated successfully.")

    # In production, you would do something with the output here:
    # - Post to Slack via webhook
    # - Send an email
    # - Save to a database
    # - Create a GitHub issue
    print("\n--- DIGEST OUTPUT ---\n")
    print(full_output)
    print("\n--- END DIGEST ---")

    now = datetime.now(timezone.utc).isoformat()
    print(f"\n[{now}] Scheduled run complete.")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        now = datetime.now(timezone.utc).isoformat()
        print(f"[{now}] Scheduled run failed: {e}", file=sys.stderr)
        sys.exit(1)
