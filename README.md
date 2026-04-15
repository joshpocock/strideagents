# Anthropic Full Stack Starter Kit

Everything you need to build with Anthropic's cloud automation stack: Managed Agents and Routines. Real, runnable examples in TypeScript and Python.

Companion repo for the Stride AI Academy video: "Anthropic's Full Automation Stack: From Terminal to Cloud"

## What's Inside

**Managed Agents (examples 01-05):** Build production AI agents that run on Anthropic's cloud. Create agents, configure environments, start sessions, stream events. These agents run 24/7, survive crashes, and handle long-running tasks autonomously.

**Routines (examples 06-08):** Pre-configured automations triggered by schedules, API calls, or GitHub webhooks. Fire-and-forget tasks that run without your laptop open.

**Templates:** Reusable YAML configs you can paste directly into the Anthropic console.

## Prerequisites

Before running anything:

1. **Anthropic API key** with Managed Agents access (beta, enabled by default for all API accounts)
2. **Node.js 18+** (for TypeScript examples) or **Python 3.10+** (for Python examples)
3. **GitHub token** (only for example 03, the code reviewer)

## Setup

### Step 1: Install dependencies

TypeScript:
```bash
npm install @anthropic-ai/sdk
```

Python:
```bash
pip install anthropic
```

### Step 2: Set your API key

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

Or copy `.env.example` to `.env` and fill in your key.

### Step 3: Verify access

Quick check that your key works with Managed Agents:

```bash
curl -s https://api.anthropic.com/v1/agents \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "anthropic-beta: managed-agents-2026-04-01" \
  -H "content-type: application/json" \
  -d '{"name":"test","model":"claude-sonnet-4-6","tools":[{"type":"agent_toolset_20260401"}]}' | head -c 200
```

If you get back a JSON object with an `id` field, you're good.

## Testing Guide: Run Every Example

Use this checklist to verify everything works before recording or presenting.

### Managed Agents Examples

**Example 01: Basic Agent (start here)**
```bash
# TypeScript
npx tsx examples/01-basic-agent/create-agent.ts

# Python
python examples/01-basic-agent/create-agent.py
```
What to expect: Creates an agent, environment, and session. Sends a message asking Claude to write a haiku to a file, then read it back. You should see streamed events including tool calls (file write, file read) and text output.

Proves: Full agent lifecycle works (create agent, create environment, create session, stream response).

**Example 02: Deep Researcher**
```bash
npx tsx examples/02-deep-researcher/researcher.ts
# or
python examples/02-deep-researcher/researcher.py
```
What to expect: Creates a research agent that searches the web and writes a report. Takes 1-3 minutes. You should see web search tool calls and a final report.

Proves: Web search tool, file writing, longer multi-step sessions.

**Example 03: Code Reviewer**
```bash
export GITHUB_TOKEN="ghp_..."
npx tsx examples/03-code-reviewer/reviewer.ts
# or
python examples/03-code-reviewer/reviewer.py
```
What to expect: Creates an agent that reviews a GitHub PR. Requires a valid GITHUB_TOKEN. You should see git clone operations and review comments.

Proves: Environment setup commands, GitHub integration, practical production use case.

**Example 04: Scheduled Agent**
```bash
npx tsx examples/04-scheduled-agent/scheduled.ts
# or
python examples/04-scheduled-agent/scheduled.py
```
What to expect: Demonstrates the pattern for triggering agent sessions on a schedule. Shows how you would wire this into cron or trigger.dev.

Proves: Programmatic session creation for recurring tasks.

**Example 05: Multi-Environment**
```bash
npx tsx examples/05-multi-environment/environments.ts
# or
python examples/05-multi-environment/environments.py
```
What to expect: Creates one agent config but three different environments (Python data science, Node web dev, full-stack). Runs the same task in each to show how the environment changes the agent's capabilities.

Proves: Environment reuse, agent config reuse, different container setups.

**Example 09: Chat Agent (Next.js)**
```bash
cd examples/09-chat-agent
npm install
npm run dev
# Open http://localhost:3000
```
What to expect: A full chat interface in your browser. Dark theme with gold accents. Type a message, Claude responds. Conversations persist across page refreshes using SQLite session mapping.

First message takes 30-60 seconds (provisioning the container). Subsequent messages are faster.

There's also a Python/Flask version:
```bash
cd examples/09-chat-agent
pip install -r requirements.txt
python server.py
# Open http://localhost:3000
```

Proves: Multi-turn conversations, session reuse, real product pattern (replaces n8n's 10-node workflow with one app).

---

### Routines Examples

**Example 06: Scheduled Routine**
```bash
npx tsx examples/06-scheduled-routine/routine.ts
# or
python examples/06-scheduled-routine/routine.py
```
What to expect: Fires a routine via the `/fire` API endpoint. Returns a session URL where you can track progress.

Before running: You need a routine configured at claude.ai/code/routines. Replace `TRIGGER_ID` in the code with your actual trigger ID.

Proves: Routines API, fire-and-forget pattern, session URL tracking.

**Example 07: API-Triggered Routine (Webhook Handler)**
```bash
# Start the server
npx tsx examples/07-api-triggered-routine/webhook-handler.ts
# or
python examples/07-api-triggered-routine/webhook-handler.py

# In another terminal, simulate an alert
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -d '{"alert":"High error rate in auth-service","severity":"critical"}'
```
What to expect: Starts a local Express/Flask server. When it receives a webhook, it forwards the payload to a routine's /fire endpoint. Returns the session URL.

Before running: Replace `TRIGGER_ID` with your actual trigger ID.

Proves: Webhook-to-routine pattern, how to wire Datadog/Sentry/PagerDuty into routines.

**Example 08: GitHub Routine (Setup Guide)**

This one is a markdown guide, not runnable code. Read it at:
```
examples/08-github-routine/setup-guide.md
```
Walk through it step by step in the claude.ai/code/routines web UI to set up a GitHub-triggered PR review routine.

Proves: GitHub webhook configuration, PR filters, event types, branch safety.

## Video Coverage Map

If you run all examples, here's what you've covered from the video:

| Video Section | Starter Kit Coverage |
|---|---|
| Routines: API trigger | Example 06 (scheduled), Example 07 (webhook) |
| Routines: GitHub trigger | Example 08 (setup guide) |
| Managed Agents: Platform tour | Not in kit. Screen-record platform.claude.com |
| Managed Agents: Architecture | Example 01 demonstrates brain/hands/session in action |
| Managed Agents: Code walkthrough | Examples 01-05 cover every API pattern |
| Managed Agents: Multi-environment | Example 05 |
| Managed Agents: Chat product | Example 09 (Next.js chat agent with session persistence) |
| When to use what | Example 04 comments explain routines vs crons vs trigger.dev |

The only thing NOT covered by the starter kit is the Console UI walkthrough (screen-record the wizard at platform.claude.com) and the Ultraplan demo (run `/ultraplan` in Claude Code CLI).

## Templates

Paste these YAML configs into the Anthropic Console to create agents and routines quickly.

**Managed Agent templates:**

| Template | Use Case |
|---|---|
| `templates/deep-researcher.yaml` | Web research and report writing |
| `templates/code-reviewer.yaml` | GitHub PR review with structured checklist |
| `templates/data-processor.yaml` | CSV/JSON data analysis and transformation |
| `templates/content-writer.yaml` | Blog posts and documentation drafting |

**Routine templates:**

| Template | Use Case |
|---|---|
| `templates/nightly-triage.yaml` | Scheduled issue triage with Slack summary |
| `templates/pr-reviewer.yaml` | GitHub-triggered code review with team checklist |

## Two Different APIs

This starter kit covers two separate Anthropic products:

| | Managed Agents | Routines |
|---|---|---|
| API base | `/v1/agents`, `/v1/sessions`, `/v1/environments` | `/v1/claude_code/routines/{id}/fire` |
| Beta header | `managed-agents-2026-04-01` | `experimental-cc-routine-2026-04-01` |
| Billing | $0.08/session-hour + tokens | Subscription (Pro/Max/Team/Enterprise) |
| Use case | Production agent apps | Developer workflow automation |
| Daily limits | Rate limited (60 creates/min) | 5-25 runs/day depending on plan |

## Built-in Tools

Every Managed Agent session includes `agent_toolset_20260401`:

- **Bash**: run shell commands in the container
- **File operations**: read, write, edit, glob, grep
- **Web search**: search the internet
- **Web fetch**: retrieve content from URLs
- **MCP servers**: connect to external tool providers

## Troubleshooting

**"unauthorized" error**: Check your ANTHROPIC_API_KEY is set and valid.

**"beta header required" error**: Make sure you're using the SDK (it sets the header automatically). If using curl, add `-H "anthropic-beta: managed-agents-2026-04-01"`.

**Routine returns 404**: Make sure you've created the routine at claude.ai/code/routines first. The trigger ID in the code must match your actual routine.

**Session takes a long time to start**: First session after creating an environment can take 30-60 seconds while the container provisions. Subsequent sessions are faster.

**Rate limit errors**: Managed Agents allow 60 creates per minute and 600 reads per minute per organization. Space out your requests if running multiple examples.

## Links

- Managed Agents docs: https://platform.claude.com/docs/en/managed-agents/overview
- Routines docs: https://code.claude.com/docs/en/routines
- Anthropic Console: https://platform.claude.com
- Routines UI: https://claude.ai/code/routines
- Free Stride community: https://www.skool.com/stride-ai-academy-7057

## License

MIT. Use these examples however you want.
