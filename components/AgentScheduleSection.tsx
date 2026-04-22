"use client";

import { useEffect, useState } from "react";
import { Clock, Copy, ExternalLink, Loader2, Play, Trash2 } from "lucide-react";
import ScheduleBuilder from "./ScheduleBuilder";

/**
 * Scheduling + manual-trigger + run-history panel for an agent.
 * Renders on the agent detail page below the main sections.
 */

interface Schedule {
  id: number;
  agent_id: string;
  environment_id: string | null;
  prompt: string | null;
  cron_schedule: string;
  last_fired_at: string | null;
  last_session_url: string | null;
}

interface AgentRun {
  id: number;
  agent_id: string;
  agent_name: string | null;
  status: "success" | "error";
  session_id: string | null;
  session_url: string | null;
  trigger_source: string | null;
  error: string | null;
  output_preview: string | null;
  fired_at: string;
}

interface Props {
  agentId: string;
  availableEnvironments?: Array<{ id: string; name?: string }>;
}

export default function AgentScheduleSection({ agentId, availableEnvironments }: Props) {
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [cron, setCron] = useState<string | null>("0 9 * * *");
  const [environmentId, setEnvironmentId] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [firing, setFiring] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);

  const triggerUrl = `/api/agents/${agentId}/trigger`;

  const loadSchedule = () =>
    fetch(`/api/agents/${agentId}/schedule`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Schedule | null) => {
        if (data && data.cron_schedule) {
          setSchedule(data);
          setEnabled(true);
          setCron(data.cron_schedule);
          setEnvironmentId(data.environment_id ?? "");
          setPrompt(data.prompt ?? "");
        } else {
          setSchedule(null);
        }
      })
      .catch(() => {});

  const loadRuns = () =>
    fetch(`/api/agents/runs?agent_id=${agentId}&limit=25`)
      .then((r) => (r.ok ? r.json() : { runs: [] }))
      .then((data) => {
        if (Array.isArray(data.runs)) setRuns(data.runs);
      })
      .catch(() => {});

  useEffect(() => {
    loadSchedule();
    loadRuns();
    const t = setInterval(loadRuns, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const saveSchedule = async () => {
    if (!cron || !cron.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/schedule`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cron_schedule: cron,
          environment_id: environmentId || null,
          prompt: prompt || null,
        }),
      });
      if (res.ok) {
        setStatus("Schedule saved. The scheduler worker will pick it up within 30s.");
        await loadSchedule();
      } else {
        const err = await res.json().catch(() => ({}));
        setStatus(err.error || "Failed to save schedule.");
      }
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = async () => {
    setSaving(true);
    try {
      await fetch(`/api/agents/${agentId}/schedule`, { method: "DELETE" });
      setSchedule(null);
      setEnabled(false);
      setStatus("Schedule removed.");
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setFiring(true);
    setStatus(null);
    try {
      const res = await fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trigger_source: "manual",
          environment_id: environmentId || undefined,
          prompt: prompt || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus(
          data.session_url
            ? `Session started: ${data.session_url}`
            : "Session started."
        );
        loadRuns();
        // Capture the first agent message into the run's output_preview once
        // the session has had time to produce one. Retries a few times.
        if (data.run_id) {
          [45_000, 90_000, 150_000].forEach((delay) => {
            setTimeout(() => {
              fetch(`/api/agent-runs/${data.run_id}/capture`, { method: "POST" })
                .then(() => loadRuns())
                .catch(() => {});
            }, delay);
          });
        }
      } else {
        setStatus(data.error || `Failed (${res.status}).`);
      }
    } finally {
      setFiring(false);
    }
  };

  const curlExample = `curl -X POST ${
    typeof window !== "undefined" ? window.location.origin : ""
  }${triggerUrl} \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"say hi","environment_id":"${environmentId || "env_..."}"}'`;

  return (
    <div>
      {/* Enable toggle */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 10,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            if (!e.target.checked) setCron(null);
            else if (!cron) setCron("0 9 * * *");
          }}
        />
        Run on a schedule
      </label>

      {enabled && cron !== null && (
        <div style={{ marginBottom: 12 }}>
          <ScheduleBuilder value={cron} onChange={setCron} />
        </div>
      )}

      {/* Environment + prompt inputs (always visible — they also drive Run Now) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Environment ID</label>
          {availableEnvironments && availableEnvironments.length > 0 ? (
            <select
              value={environmentId}
              onChange={(e) => setEnvironmentId(e.target.value)}
              style={inputStyle}
            >
              <option value="">— choose environment —</option>
              {availableEnvironments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name ? `${env.name} (${env.id})` : env.id}
                </option>
              ))}
            </select>
          ) : (
            <input
              value={environmentId}
              onChange={(e) => setEnvironmentId(e.target.value)}
              placeholder="env_..."
              style={{ ...inputStyle, fontFamily: "monospace" }}
            />
          )}
          <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
            Required to start a session. Saved with the schedule and also used by Run now.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Initial prompt (optional)</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={2}
            placeholder="Optional user message sent as soon as the session starts..."
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <button
          onClick={runNow}
          disabled={firing || !environmentId}
          className="btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            fontSize: 13,
            opacity: firing || !environmentId ? 0.6 : 1,
          }}
          title={!environmentId ? "Set an environment first" : "Trigger a session now"}
        >
          {firing ? (
            <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <Play size={14} />
          )}
          {firing ? "Running..." : "Run now"}
        </button>
        {enabled && (
          <button
            onClick={saveSchedule}
            disabled={saving || !cron}
            className="btn-secondary"
            style={{ padding: "8px 14px", fontSize: 13 }}
          >
            {saving ? "Saving..." : schedule ? "Save schedule" : "Create schedule"}
          </button>
        )}
        {schedule && (
          <button
            onClick={removeSchedule}
            className="btn-secondary"
            style={{
              padding: "8px 14px",
              fontSize: 13,
              color: "var(--error)",
              borderColor: "var(--error)",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Trash2 size={13} />
            Delete schedule
          </button>
        )}
      </div>

      {status && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginBottom: 12,
            padding: "8px 12px",
            background: "var(--bg-input)",
            borderRadius: 6,
          }}
        >
          {status}
        </p>
      )}

      {/* Trigger endpoint info */}
      <details
        style={{
          marginBottom: 16,
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          padding: "10px 14px",
          background: "var(--bg-card)",
        }}
      >
        <summary
          style={{
            cursor: "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-secondary)",
          }}
        >
          Trigger via API
        </summary>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "8px 0" }}>
          Any HTTP client can fire this agent by POSTing to the endpoint below.
          Body fields are optional if this agent has a saved schedule
          (<code>environment_id</code> and <code>prompt</code> fall back to the
          saved values).
        </p>
        <div
          style={{
            position: "relative",
            background: "var(--bg-input)",
            borderRadius: 6,
            padding: "10px 12px",
            fontFamily: "monospace",
            fontSize: 12,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {curlExample}
          <button
            onClick={() => {
              navigator.clipboard.writeText(curlExample).catch(() => {});
              setStatus("Copied curl command to clipboard.");
            }}
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              background: "transparent",
              border: "1px solid var(--border-color)",
              color: "var(--text-secondary)",
              fontSize: 11,
              padding: "3px 6px",
              borderRadius: 4,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Copy size={11} />
            Copy
          </button>
        </div>
      </details>

      {/* Run history */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          color: "var(--text-muted)",
          marginBottom: 10,
        }}
      >
        Run history
      </div>
      {runs.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          No runs yet. Use Run now or wait for a scheduled fire.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runs.map((run) => (
            <div
              key={run.id}
              style={{
                padding: "10px 12px",
                background: "var(--bg-input)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background:
                        run.status === "success"
                          ? "var(--success)"
                          : "var(--error)",
                      flexShrink: 0,
                    }}
                  />
                  <Clock size={12} color="var(--text-muted)" />
                  <span style={{ color: "var(--text-secondary)" }}>
                    {new Date(run.fired_at).toLocaleString()}
                  </span>
                  {run.trigger_source && (
                    <span
                      style={{
                        fontSize: 10,
                        padding: "1px 6px",
                        borderRadius: 4,
                        background: "var(--bg-badge)",
                        color: "var(--text-muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.4px",
                      }}
                    >
                      {run.trigger_source}
                    </span>
                  )}
                  {run.error && (
                    <span
                      style={{
                        color: "var(--error)",
                        maxWidth: 280,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={run.error}
                    >
                      {run.error}
                    </span>
                  )}
                </div>
                {run.session_url && (
                  <a
                    href={run.session_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--accent)",
                      textDecoration: "none",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      flexShrink: 0,
                    }}
                  >
                    <ExternalLink size={11} />
                    View
                  </a>
                )}
              </div>
              {run.output_preview && (
                <div
                  style={{
                    marginTop: 8,
                    padding: "8px 10px",
                    background: "var(--bg-card)",
                    borderLeft: "3px solid var(--accent)",
                    borderRadius: 4,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    maxHeight: 140,
                    overflow: "auto",
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                  }}
                >
                  {run.output_preview}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};
