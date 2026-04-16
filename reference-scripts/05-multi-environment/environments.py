"""
05 - Multi-Environment

Same agent, different environments. This shows how to reuse a single
agent configuration across different runtime environments. The agent
adapts its behavior based on what tools are available in the container.

Run: python environments.py

The SDK handles the managed-agents-2026-04-01 beta header automatically.
"""

import anthropic


def main():
    client = anthropic.Anthropic()

    # -------------------------------------------------------------------
    # Create a single agent that adapts to its environment
    #
    # API: POST /v1/agents
    # -------------------------------------------------------------------
    agent = client.agents.create(
        name="polyglot-developer",
        description="A developer agent that works in any language environment.",
        model="claude-sonnet-4-6",
        system_prompt=(
            "You are a developer assistant. When given a task:\n\n"
            "1. First, inspect your environment: check what languages, "
            "package managers, and tools are installed.\n"
            "2. Use whatever is available to complete the task.\n"
            "3. Write clean, well-documented code.\n"
            "4. Save all output to /workspace/.\n"
            "5. If a test framework is available, write and run tests.\n\n"
            "You adapt to your environment. If you have Python, write Python. "
            "If you have Node, write JavaScript/TypeScript. "
            "If you have both, pick the best tool for the job."
        ),
        tools=[{"type": "agent_toolset_20260401"}],
    )

    print(f"Created agent: {agent.id}\n")

    # -------------------------------------------------------------------
    # Define three different environments
    #
    # API: POST /v1/environments
    # -------------------------------------------------------------------

    # Environment 1: Python data science stack
    python_env = client.environments.create(
        name="python-data-science",
        description="Python environment with pandas, numpy, and matplotlib.",
        setup_commands=[
            "pip install pandas numpy matplotlib seaborn scikit-learn",
        ],
    )
    print(f"Python environment: {python_env.id}")

    # Environment 2: Node.js web development stack
    node_env = client.environments.create(
        name="node-web-dev",
        description="Node.js environment with Express, TypeScript, and testing tools.",
        setup_commands=[
            "npm init -y",
            "npm install express typescript tsx vitest @types/express @types/node",
        ],
    )
    print(f"Node environment: {node_env.id}")

    # Environment 3: Full-stack with both Python and Node
    full_stack_env = client.environments.create(
        name="full-stack",
        description="Full-stack environment with Python, Node, Docker, and database tools.",
        setup_commands=[
            "pip install fastapi uvicorn sqlalchemy",
            "npm init -y",
            "npm install next react react-dom",
            "apt-get update && apt-get install -y sqlite3",
        ],
    )
    print(f"Full-stack environment: {full_stack_env.id}")

    # -------------------------------------------------------------------
    # Run the same task in each environment
    #
    # API: POST /v1/sessions
    # API: POST /v1/sessions/{id}/messages (streaming)
    # -------------------------------------------------------------------
    task = (
        "Build a simple REST API with one endpoint: GET /api/stats that returns "
        "JSON with the current timestamp, a random number, and the hostname. "
        "Include a health check endpoint. Write tests if a test framework is available."
    )

    environments = [
        (python_env, "Python"),
        (node_env, "Node.js"),
        (full_stack_env, "Full-Stack"),
    ]

    for env, label in environments:
        print(f"\n{'=' * 60}")
        print(f"Running in {label} environment...")
        print("=" * 60)

        session = client.sessions.create(
            agent_id=agent.id,
            environment_id=env.id,
        )

        with client.sessions.messages.stream(
            session_id=session.id,
            message=task,
        ) as stream:
            for event in stream:
                if event.type == "text_delta":
                    print(event.delta, end="", flush=True)
                elif event.type == "tool_use":
                    print(f"\n[{event.name}]")
                elif event.type == "message_stop":
                    print(f"\n\n[{label} session complete]")

    print("\n\nAll three environments processed the same task.")
    print("Compare the approaches each environment took!")


if __name__ == "__main__":
    main()
