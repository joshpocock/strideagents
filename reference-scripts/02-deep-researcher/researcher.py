"""
02 - Deep Researcher

A research agent that searches the web for information on a topic,
synthesizes findings, and writes a structured report to disk.

This shows how to:
- Give an agent a research-focused system prompt
- Use the built-in web search and file write tools
- Stream events and watch the agent work in real time
- Collect the final output

Run: python researcher.py

The SDK handles the managed-agents-2026-04-01 beta header automatically.
"""

import anthropic

# Change this to whatever you want to research
RESEARCH_TOPIC = (
    "The current state of WebAssembly in 2026: "
    "adoption, performance benchmarks, and major use cases"
)


def main():
    client = anthropic.Anthropic()

    # -------------------------------------------------------------------
    # Create a research-focused agent
    #
    # The system prompt is where the magic happens. A good system prompt
    # turns a general-purpose agent into a specialist.
    #
    # API: POST /v1/agents
    # -------------------------------------------------------------------
    agent = client.agents.create(
        name="deep-researcher",
        description="Searches the web, synthesizes information, and writes structured reports.",
        model="claude-sonnet-4-6",
        system_prompt=(
            "You are a research analyst. When given a topic:\n\n"
            "1. Search the web for recent, authoritative sources (at least 5 different searches).\n"
            "2. Read the most relevant pages to gather detailed information.\n"
            "3. Synthesize your findings into a well-structured markdown report.\n"
            "4. Save the report to /workspace/report.md.\n"
            "5. Save a sources list to /workspace/sources.md with URLs and brief descriptions.\n\n"
            "Your report should include:\n"
            "- Executive summary (2-3 sentences)\n"
            "- Key findings (organized by theme)\n"
            "- Data points and statistics where available\n"
            "- Open questions or areas needing further research\n\n"
            "Be thorough but concise. Cite your sources inline using [Source Name](URL) format."
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )

    print(f"Created research agent: {agent.id}")

    # -------------------------------------------------------------------
    # Create an environment for the researcher
    #
    # API: POST /v1/environments
    # -------------------------------------------------------------------
    environment = client.environments.create(
        name="research-env",
        description="Clean environment for web research and report writing.",
    )

    # -------------------------------------------------------------------
    # Start a session and send the research request
    #
    # API: POST /v1/sessions
    # API: POST /v1/sessions/{id}/messages (streaming)
    # -------------------------------------------------------------------
    session = client.sessions.create(
        agent_id=agent.id,
        environment_id=environment.id,
    )

    print(f"Session started: {session.id}")
    print(f'\nResearching: "{RESEARCH_TOPIC}"\n')
    print("=" * 60)

    tool_call_count = 0
    search_count = 0

    with client.sessions.messages.stream(
        session_id=session.id,
        message=f"Research the following topic and write a comprehensive report:\n\n{RESEARCH_TOPIC}",
    ) as stream:
        for event in stream:
            if event.type == "text_delta":
                print(event.delta, end="", flush=True)

            elif event.type == "tool_use":
                tool_call_count += 1
                if event.name == "web_search":
                    search_count += 1
                    print(f"\n[Search #{search_count}]")
                elif event.name == "web_fetch":
                    print("\n[Fetching URL...]")
                elif event.name == "file_write":
                    print("\n[Writing file...]")
                else:
                    print(f"\n[Tool: {event.name}]")

            elif event.type == "message_stop":
                print("\n\n" + "=" * 60)
                print(
                    f"Research complete. {search_count} web searches, "
                    f"{tool_call_count} total tool calls."
                )
                print("Report saved to /workspace/report.md in the session container.")


if __name__ == "__main__":
    main()
