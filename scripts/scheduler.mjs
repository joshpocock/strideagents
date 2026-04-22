#!/usr/bin/env node

/**
 * Local scheduler for routines and agents.
 *
 * Every SYNC_INTERVAL_MS it polls /api/routines and /api/agents/schedules,
 * registers any entry that has a cron_schedule with node-cron, and fires on
 * tick by POSTing to the same endpoints the UI uses. Reconciles on every poll
 * so UI edits take effect without restarting the worker.
 *
 * Usage: node scripts/scheduler.mjs
 */

import cron from "node-cron";

const START_PORT = Number(process.env.PORT || 3002);
let LOCAL_URL = process.env.LOCAL_URL || `http://localhost:${START_PORT}`;
const SYNC_INTERVAL_MS = 30_000;
const READY_TIMEOUT_MS = 60_000;

// Tracks live node-cron tasks. Keys are namespaced ("routine:<id>" or
// "agent:<agentId>") so routines and agents never collide; the value records
// the schedule string we registered with so we can detect UI-side changes.
const active = new Map(); // key -> { schedule, task, label }

async function findDevServer() {
  // Try ports from START_PORT to START_PORT+20 to find a running dev server
  for (let port = START_PORT; port < START_PORT + 20; port++) {
    try {
      const url = `http://localhost:${port}`;
      const res = await fetch(`${url}/api/routines`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return url;
    } catch {}
  }
  return null;
}

async function waitForDevServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    // First try the known URL
    try {
      const res = await fetch(`${LOCAL_URL}/api/routines`, {
        signal: AbortSignal.timeout(1500),
      });
      if (res.ok) return true;
    } catch {}

    // If that fails, scan ports to find where the dev server is running
    const found = await findDevServer();
    if (found) {
      LOCAL_URL = found;
      console.log(`  Dev server found at ${LOCAL_URL}`);
      return true;
    }

    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

async function fireRoutine(routine) {
  try {
    const res = await fetch(`${LOCAL_URL}/api/routines/${routine.id}/fire`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`  ✗ [routine ${routine.name}] fire failed (${res.status}): ${txt.slice(0, 200)}`);
      return;
    }
    const data = await res.json();
    const url = data.last_session_url || data.claude_code_session_url || "";
    console.log(`  ✓ [routine ${routine.name}] fired${url ? ` → ${url}` : ""}`);
  } catch (err) {
    console.error(`  ✗ [routine ${routine.name}] fire errored:`, err.message);
  }
}

async function fireAgent(schedule) {
  const label = schedule.agent_name || schedule.agent_id;
  try {
    const res = await fetch(`${LOCAL_URL}/api/agents/${schedule.agent_id}/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger_source: "scheduler",
        environment_id: schedule.environment_id || undefined,
        prompt: schedule.prompt || undefined,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error(`  ✗ [agent ${label}] trigger failed (${res.status}): ${txt.slice(0, 200)}`);
      return;
    }
    const data = await res.json();
    const url = data.session_url || "";
    console.log(`  ✓ [agent ${label}] triggered${url ? ` → ${url}` : ""}`);

    // After the trigger returns, give the session some time to produce output
    // and then ask the app to snapshot the last agent message into
    // agent_runs.output_preview. Retries a couple times since the first agent
    // message can take 30–90s to arrive.
    if (data.run_id) {
      captureOutputLater(data.run_id, label, [45_000, 90_000, 150_000]);
    }
  } catch (err) {
    console.error(`  ✗ [agent ${label}] trigger errored:`, err.message);
  }
}

function captureOutputLater(runId, label, delays) {
  for (const delay of delays) {
    setTimeout(async () => {
      try {
        const res = await fetch(`${LOCAL_URL}/api/agent-runs/${runId}/capture`, {
          method: "POST",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.captured) {
            console.log(`  • [agent ${label}] captured output (${data.chars} chars)`);
          }
        }
      } catch {
        // best effort — dev server may be restarting
      }
    }, delay);
  }
}

async function writeHeartbeat() {
  try {
    await fetch(`${LOCAL_URL}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scheduler_heartbeat_at: new Date().toISOString() }),
    });
  } catch {
    // best effort — dev server may be restarting
  }
}

async function sync() {
  let routines = [];
  let agentSchedules = [];

  try {
    const res = await fetch(`${LOCAL_URL}/api/routines`);
    if (res.ok) routines = await res.json();
    else console.error(`  ⚠ Could not list routines: HTTP ${res.status}`);
  } catch (err) {
    console.error("  ⚠ Could not reach dev server (routines):", err.message);
    return;
  }

  try {
    const res = await fetch(`${LOCAL_URL}/api/agents/schedules`);
    if (res.ok) agentSchedules = await res.json();
    else console.error(`  ⚠ Could not list agent schedules: HTTP ${res.status}`);
  } catch (err) {
    // Non-fatal — routines can still run even if agent endpoint is missing.
    console.error("  ⚠ Could not fetch agent schedules:", err.message);
  }

  await writeHeartbeat();

  const seen = new Set();

  // Routines
  for (const routine of routines) {
    const schedule = routine.cron_schedule?.trim();
    if (!schedule) continue;
    const key = `routine:${routine.id}`;
    const label = `routine ${routine.name}`;
    seen.add(key);

    if (!cron.validate(schedule)) {
      console.error(`  ⚠ [${label}] invalid cron expression: "${schedule}"`);
      const existing = active.get(key);
      if (existing) {
        existing.task.stop();
        active.delete(key);
      }
      continue;
    }

    const existing = active.get(key);
    if (existing && existing.schedule === schedule) continue;
    if (existing) existing.task.stop();

    const task = cron.schedule(schedule, () => fireRoutine(routine));
    active.set(key, { schedule, task, label });
    console.log(`  + [${label}] scheduled (${schedule})`);
  }

  // Agent schedules
  for (const entry of agentSchedules) {
    const schedule = entry.cron_schedule?.trim();
    if (!schedule) continue;
    const key = `agent:${entry.agent_id}`;
    const label = `agent ${entry.agent_name || entry.agent_id}`;
    seen.add(key);

    if (!cron.validate(schedule)) {
      console.error(`  ⚠ [${label}] invalid cron expression: "${schedule}"`);
      const existing = active.get(key);
      if (existing) {
        existing.task.stop();
        active.delete(key);
      }
      continue;
    }

    const existing = active.get(key);
    if (existing && existing.schedule === schedule) continue;
    if (existing) existing.task.stop();

    const task = cron.schedule(schedule, () => fireAgent(entry));
    active.set(key, { schedule, task, label });
    console.log(`  + [${label}] scheduled (${schedule})`);
  }

  // Unschedule anything that's no longer in the two source lists.
  for (const [key, entry] of active) {
    if (!seen.has(key)) {
      entry.task.stop();
      active.delete(key);
      console.log(`  - [${entry.label}] unscheduled`);
    }
  }
}

async function main() {
  console.log(`\n  Scheduler connecting to ${LOCAL_URL}...`);
  const ready = await waitForDevServer();
  if (!ready) {
    console.error("\n  ✗ Dev server didn't respond within 60s — is `npm run dev` running?");
    process.exit(1);
  }
  console.log("  ✓ Connected\n");

  await sync();
  setInterval(sync, SYNC_INTERVAL_MS);
}

process.on("SIGINT", () => {
  for (const entry of active.values()) entry.task.stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  for (const entry of active.values()) entry.task.stop();
  process.exit(0);
});

main().catch((err) => {
  console.error("Scheduler crashed:", err);
  process.exit(1);
});
