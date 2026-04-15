"""
09 - Chat Agent: Multi-turn web chat with Claude Managed Agents (Python/Flask)

A simple Flask server that powers a web chat interface using Claude's
Managed Agent API. Conversations persist across page refreshes via
SQLite session storage.

This replaces n8n's 10-node workflow with a single Flask server.
No visual workflow builder needed -- just Python and the Anthropic SDK.

NOT production-ready. This is a learning demo for the starter kit.

Usage:
    pip install -r requirements.txt
    ANTHROPIC_API_KEY=sk-ant-... python server.py

Then open http://localhost:3000 in your browser.
"""

import json
import os
import sqlite3
import time
import uuid

import anthropic
from flask import Flask, jsonify, request, send_file

# --- Config ---

PORT = 3000
AGENT_MODEL = "claude-sonnet-4-6"
AGENT_NAME = "chat-assistant"
SYSTEM_PROMPT = (
    "You are a helpful customer support assistant. Be friendly, concise, "
    "and helpful. If you cannot help with something, let the user know clearly."
)

# The SDK handles the beta header (interop-2025-01-24) automatically
# when using client.agents, client.environments, and client.sessions.
client = anthropic.Anthropic()

app = Flask(__name__)

# --- Database setup ---
# sqlite3 is built into Python, no pip install needed.
# For production, consider PostgreSQL or another managed database.

DB_PATH = os.path.join(os.path.dirname(__file__), "chat-sessions.db")


def get_db():
    """Get a database connection. Creates the table if it does not exist."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sessions (
            chat_id TEXT PRIMARY KEY,
            agent_id TEXT NOT NULL,
            environment_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    return conn


def get_session(chat_id: str) -> dict | None:
    """Look up an existing session by chat_id."""
    conn = get_db()
    row = conn.execute(
        "SELECT * FROM sessions WHERE chat_id = ?", (chat_id,)
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None


def insert_session(session: dict) -> None:
    """Store a new session mapping in the database."""
    conn = get_db()
    conn.execute(
        "INSERT INTO sessions (chat_id, agent_id, environment_id, session_id, created_at) "
        "VALUES (?, ?, ?, ?, ?)",
        (
            session["chat_id"],
            session["agent_id"],
            session["environment_id"],
            session["session_id"],
            session["created_at"],
        ),
    )
    conn.commit()
    conn.close()


# --- Agent helpers ---


def create_agent_session(chat_id: str) -> dict:
    """
    Create a complete managed agent session:
    1. Agent (defines model, system prompt, tools)
    2. Environment (sandbox for the agent)
    3. Session (conversation thread)
    """
    print(f"[{chat_id}] Creating new agent, environment, and session...")

    # Step 1: Create the agent
    # agent_toolset_20260401 gives the agent access to its standard toolset
    agent = client.agents.create(
        name=AGENT_NAME,
        model=AGENT_MODEL,
        instructions=SYSTEM_PROMPT,
        tools=[{"type": "agent_toolset_20260401"}],
    )
    print(f"[{chat_id}] Agent created: {agent.id}")

    # Step 2: Create an environment (isolated sandbox)
    environment = client.environments.create(
        agent_id=agent.id,
        name=f"env-{chat_id}",
    )
    print(f"[{chat_id}] Environment created: {environment.id}")

    # Step 3: Create a session (conversation thread)
    session = client.sessions.create(
        agent_id=agent.id,
        environment_id=environment.id,
    )
    print(f"[{chat_id}] Session created: {session.id}")

    from datetime import datetime, timezone

    return {
        "chat_id": chat_id,
        "agent_id": agent.id,
        "environment_id": environment.id,
        "session_id": session.id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def send_and_get_response(session: dict, message: str) -> str:
    """
    Send a user message and poll for Claude's response.

    In production, you would use webhooks or streaming instead of polling.
    Times out after 30 seconds if no response is received.
    """
    print(f"[{session['chat_id']}] Sending message: \"{message[:80]}...\"")

    # Send the user's message to the session
    client.sessions.messages.create(
        session["session_id"],
        agent_id=session["agent_id"],
        environment_id=session["environment_id"],
        message={
            "role": "user",
            "content": message,
        },
    )

    # Poll for Claude's response
    max_attempts = 60  # 30 seconds at 500ms intervals
    poll_interval = 0.5

    for attempt in range(max_attempts):
        time.sleep(poll_interval)

        # Fetch events from the session
        events = client.sessions.events.list(
            session["session_id"],
            agent_id=session["agent_id"],
            environment_id=session["environment_id"],
        )

        # Scan from the end to find the most recent assistant message
        event_list = events.data or []
        for event in reversed(event_list):
            if (
                event.type == "agent.message"
                and getattr(event.message, "role", None) == "assistant"
            ):
                # Extract text from content blocks
                content = getattr(event.message, "content", []) or []
                text_blocks = [b for b in content if getattr(b, "type", None) == "text"]

                if text_blocks:
                    response_text = "\n".join(b.text for b in text_blocks)
                    print(
                        f"[{session['chat_id']}] Got response (attempt {attempt + 1})"
                    )
                    return response_text

    raise TimeoutError("Timed out waiting for Claude's response (30s)")


# --- Routes ---


@app.route("/")
def index():
    """Serve the chat UI. Uses the same chat.html from the Next.js public dir."""
    # For the Python version, we serve a standalone HTML file.
    # The Next.js version uses React components instead.
    html_path = os.path.join(os.path.dirname(__file__), "chat-standalone.html")
    if os.path.exists(html_path):
        return send_file(html_path)
    return "chat-standalone.html not found. See the README for setup instructions.", 404


@app.route("/api/chat", methods=["POST"])
def chat():
    """Receive a message, return Claude's response."""
    try:
        data = request.get_json()
        chat_id = data.get("chat_id")
        message = data.get("message")

        if not chat_id or not message:
            return jsonify({"error": "chat_id and message are required"}), 400

        # Look up or create the session for this chat
        session = get_session(chat_id)

        if not session:
            # First message -- set up agent, environment, and session
            session = create_agent_session(chat_id)
            insert_session(session)
        else:
            print(f"[{chat_id}] Reusing existing session: {session['session_id']}")

        # Send the message and wait for a response
        response = send_and_get_response(session, message)

        return jsonify({"response": response})

    except Exception as e:
        print(f"Chat error: {e}")
        return jsonify({"error": str(e)}), 500


# --- Start the server ---

if __name__ == "__main__":
    print(f"Chat agent server running at http://localhost:{PORT}")
    print("Open the URL above in your browser to start chatting.")
    app.run(host="0.0.0.0", port=PORT, debug=True)
