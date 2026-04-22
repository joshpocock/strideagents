"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  Trash2,
  Pencil,
  ExternalLink,
  Clock,
  Info,
  Send,
  Loader2,
} from "lucide-react";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import ScheduleBuilder from "@/components/ScheduleBuilder";
import { useToast } from "@/components/Toast";

interface Routine {
  id: number;
  name: string;
  routine_id: string;
  token: string;
  description: string | null;
  trigger_type: string;
  cron_schedule: string | null;
  last_fired_at: string | null;
  last_session_url: string | null;
  created_at: string;
}

interface RoutineRun {
  id: number;
  routine_id: number;
  routine_name: string;
  status: string;
  session_id: string | null;
  session_url: string | null;
  error: string | null;
  fired_at: string;
}

interface UpcomingRun {
  routine_id: number;
  routine_name: string;
  at: string;
}

interface UpcomingAgentRun {
  agent_id: string;
  agent_name: string;
  at: string;
}

interface AgentRunRow {
  id: number;
  agent_id: string;
  agent_name: string | null;
  status: "success" | "error";
  session_id: string | null;
  session_url: string | null;
  trigger_source: string | null;
  error: string | null;
  fired_at: string;
}

function trimError(err: string | null): string {
  if (!err) return "failed";
  // Most errors look like "401: {"type":"error","error":{"message":"..."}}"
  // Pull out the Anthropic message if we can find one, else truncate.
  const match = err.match(/"message":\s*"([^"]+)"/);
  const label = match ? match[1] : err;
  const statusMatch = err.match(/^(\d{3}):/);
  const prefix = statusMatch ? `${statusMatch[1]} — ` : "";
  const out = `${prefix}${label}`;
  return out.length > 120 ? out.slice(0, 117) + "…" : out;
}

function formatRelativeFuture(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(hours / 24);
  return `in ${days}d`;
}

function SchedulerStatusPill({
  status,
}: {
  status: { connected: boolean; heartbeat_at: string | null } | null;
}) {
  const connected = status?.connected === true;
  const never = !status?.heartbeat_at;
  return (
    <span
      title={
        never
          ? "Run `npm run dev:scheduler` (or `npm run dev:all`) to enable cron triggers."
          : status?.heartbeat_at
          ? `Last heartbeat: ${new Date(status.heartbeat_at).toLocaleString()}`
          : undefined
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 10px",
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 600,
        border: "1px solid var(--border-color)",
        background: connected ? "rgba(34, 197, 94, 0.1)" : "var(--bg-card)",
        color: connected ? "var(--success)" : "var(--text-muted)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: connected ? "var(--success)" : "var(--text-muted)",
        }}
      />
      {connected ? "Scheduler connected" : never ? "Scheduler not running" : "Scheduler stale"}
    </span>
  );
}

function describeCron(cron: string | null): string | null {
  if (!cron) return null;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [m, h, , , dow] = parts;
  const pad = (n: string) => n.padStart(2, "0");
  if (h === "*" && /^\d+$/.test(m)) return `Every hour at :${pad(m)}`;
  if (/^\d+$/.test(h) && /^\d+$/.test(m) && dow === "*")
    return `Daily at ${pad(h)}:${pad(m)}`;
  if (/^\d+$/.test(h) && /^\d+$/.test(m) && dow === "1-5")
    return `Weekdays at ${pad(h)}:${pad(m)}`;
  if (/^\d+$/.test(h) && /^\d+$/.test(m) && /^\d+$/.test(dow)) {
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return `${days[Number(dow)]} at ${pad(h)}:${pad(m)}`;
  }
  return cron;
}

const triggerColors: Record<string, { bg: string; color: string }> = {
  api: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  scheduled: { bg: "rgba(34, 197, 94, 0.1)", color: "var(--success)" },
  github: { bg: "var(--bg-hover)", color: "var(--text-secondary)" },
};

export default function RoutinesPage() {
  const { showToast } = useToast();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    routine_id: "",
    token: "",
    description: "",
    trigger_type: "api",
    cron_schedule: null as string | null,
  });
  const [saving, setSaving] = useState(false);
  const [firingId, setFiringId] = useState<number | null>(null);
  const [contextTexts, setContextTexts] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null);
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [editData, setEditData] = useState({
    name: "",
    routine_id: "",
    token: "",
    description: "",
    trigger_type: "api",
    cron_schedule: null as string | null,
  });
  const [editSaving, setEditSaving] = useState(false);

  // Tabs + run tracking
  const [tab, setTab] = useState<"all" | "calendar">("all");
  const [todayCount, setTodayCount] = useState(0);
  const [dailyLimit] = useState(15);
  const [runs, setRuns] = useState<RoutineRun[]>([]);
  const [upcoming, setUpcoming] = useState<UpcomingRun[]>([]);
  const [agentUpcoming, setAgentUpcoming] = useState<UpcomingAgentRun[]>([]);
  const [agentRuns, setAgentRuns] = useState<AgentRunRow[]>([]);
  const [schedulerStatus, setSchedulerStatus] = useState<{
    connected: boolean;
    heartbeat_at: string | null;
  } | null>(null);

  const loadRuns = () => {
    fetch("/api/routines/runs?limit=200")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { runs?: RoutineRun[]; today_count?: number }) => {
        if (Array.isArray(data.runs)) setRuns(data.runs);
        if (typeof data.today_count === "number")
          setTodayCount(data.today_count);
      })
      .catch(() => {});
  };

  const loadUpcoming = () => {
    fetch("/api/routines/upcoming?days=7")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { runs?: UpcomingRun[] }) => {
        if (Array.isArray(data.runs)) setUpcoming(data.runs);
      })
      .catch(() => {});
    fetch("/api/agents/upcoming?days=7")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { runs?: UpcomingAgentRun[] }) => {
        if (Array.isArray(data.runs)) setAgentUpcoming(data.runs);
      })
      .catch(() => {});
    fetch("/api/agents/runs?limit=200")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { runs?: AgentRunRow[] }) => {
        if (Array.isArray(data.runs)) setAgentRuns(data.runs);
      })
      .catch(() => {});
  };

  const loadSchedulerStatus = () => {
    fetch("/api/scheduler/status")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data.connected === "boolean") {
          setSchedulerStatus({
            connected: data.connected,
            heartbeat_at: data.heartbeat_at ?? null,
          });
        }
      })
      .catch(() => {});
  };

  const loadRoutines = () => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Routine[]) => setRoutines(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoutines();
    loadRuns();
    loadUpcoming();
    loadSchedulerStatus();
    const statusTimer = setInterval(loadSchedulerStatus, 15_000);
    const runsTimer = setInterval(() => {
      loadRuns();
      loadRoutines();
    }, 30_000);
    return () => {
      clearInterval(statusTimer);
      clearInterval(runsTimer);
    };
  }, []);

  // Map of routine_id → most recent run, built from the runs array (already
  // sorted newest first by the /api/routines/runs endpoint).
  const lastRunByRoutine = runs.reduce<Record<number, RoutineRun>>((acc, run) => {
    if (!acc[run.routine_id]) acc[run.routine_id] = run;
    return acc;
  }, {});

  const handleCreate = async () => {
    if (!formData.name || !formData.routine_id || !formData.token) return;
    setSaving(true);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setModalOpen(false);
        setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api", cron_schedule: null });
        loadRoutines();
        loadUpcoming();
        showToast("Routine added", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast((err as { error?: string }).error || "Failed to create routine", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleFire = async (routine: Routine) => {
    setFiringId(routine.id);
    try {
      const text = contextTexts[routine.id] || "";
      const res = await fetch(`/api/routines/${routine.id}/fire`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setRoutines((prev) =>
          prev.map((r) =>
            r.id === routine.id
              ? {
                  ...r,
                  last_fired_at: data.last_fired_at,
                  last_session_url:
                    data.last_session_url || data.claude_code_session_url,
                }
              : r
          )
        );
        showToast("Routine fired successfully", "success");
        loadRuns();
      } else {
        const err = await res.json().catch(() => ({}));
        const msg =
          (err as { error?: string }).error ||
          `Failed (${res.status})`;
        showToast(msg, "error");
      }
    } catch {
      showToast("Network error while firing routine", "error");
    } finally {
      setFiringId(null);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/routines/${id}`, { method: "DELETE" });
      if (res.ok) {
        setRoutines((prev) => prev.filter((r) => r.id !== id));
        showToast("Routine deleted", "success");
      } else {
        showToast("Failed to delete routine", "error");
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (routine: Routine) => {
    setEditingRoutine(routine);
    setEditData({
      name: routine.name,
      routine_id: routine.routine_id,
      token: routine.token,
      description: routine.description || "",
      trigger_type: routine.trigger_type,
      cron_schedule: routine.cron_schedule,
    });
  };

  const handleEdit = async () => {
    if (!editingRoutine || !editData.name || !editData.routine_id || !editData.token)
      return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/routines/${editingRoutine.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        const updated = await res.json();
        setRoutines((prev) =>
          prev.map((r) => (r.id === updated.id ? updated : r))
        );
        setEditingRoutine(null);
        loadUpcoming();
        showToast("Routine updated", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(
          (err as { error?: string }).error || "Failed to update",
          "error"
        );
      }
    } catch {
      showToast("Network error", "error");
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              marginBottom: 4,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Zap size={24} color="var(--accent)" />
            Routines
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
            Create templated routines that can be kicked off on schedule, by API, or webhook.
          </p>
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: "4px 0 0" }}>
            {todayCount} / {dailyLimit} included daily runs used.
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <SchedulerStatusPill status={schedulerStatus} />
          <button
            className="btn-primary"
            onClick={() => setModalOpen(true)}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <Plus size={16} />
            Add Routine
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {([
          { key: "all" as const, label: "All routines" },
          { key: "calendar" as const, label: "Calendar" },
        ]).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: active ? "var(--bg-card)" : "transparent",
                border: active
                  ? "1px solid var(--border-color)"
                  : "1px solid transparent",
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "calendar" && (
        <RoutineCalendar
          runs={runs}
          routines={routines}
          upcoming={upcoming}
          agentRuns={agentRuns}
          agentUpcoming={agentUpcoming}
        />
      )}

      {tab === "all" && (
      <>
      {/* Info callout */}
      <div
        className="card"
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "flex-start",
          gap: 12,
          padding: 16,
          background: "var(--accent-bg)",
          border: "1px solid var(--accent-muted)",
        }}
      >
        <Info size={18} color="var(--accent)" style={{ flexShrink: 0, marginTop: 1 }} />
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0, lineHeight: 1.6 }}>
          Routines are configured at{" "}
          <a
            href="https://claude.ai/code/routines"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--accent)" }}
          >
            claude.ai/code/routines
          </a>
          . To fire routines from here: (1) create a routine there, (2) click
          "Add another trigger" and choose "API", (3) copy the <code>trig_</code> ID from the
          URL and the <code>sk-ant-oat01-</code> bearer token, then add them below.
        </p>
      </div>

      {/* Routine list */}
      {loading ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16 }}>
            <LoadingSkeleton height={20} width="30%" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)" }}>
              <LoadingSkeleton height={16} width={`${50 + i * 10}%`} />
            </div>
          ))}
        </div>
      ) : routines.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No routines yet"
          description="Add a routine to start firing Claude Code routines from this dashboard."
          actionLabel="Add Routine"
          onAction={() => setModalOpen(true)}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {routines.map((routine) => {
            const triggerStyle = triggerColors[routine.trigger_type] || triggerColors.api;
            const isFiring = firingId === routine.id;
            const isDeleting = deletingId === routine.id;
            return (
              <div
                key={routine.id}
                className="card"
                style={{ padding: 0, overflow: "hidden" }}
              >
                {/* Card header */}
                <div
                  style={{
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 16,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                      <Zap size={16} color="var(--accent)" />
                      <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
                        {routine.name}
                      </h3>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: triggerStyle.bg,
                          color: triggerStyle.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {routine.trigger_type}
                      </span>
                      {lastRunByRoutine[routine.id]?.status === "error" && (
                        <span
                          title={lastRunByRoutine[routine.id].error || "Last attempt failed"}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                            fontWeight: 600,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: "rgba(239, 68, 68, 0.12)",
                            color: "var(--error)",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          }}
                        >
                          Last fire failed
                        </span>
                      )}
                    </div>
                    {routine.description && (
                      <p
                        style={{
                          fontSize: 13,
                          color: "var(--text-secondary)",
                          margin: 0,
                          marginTop: 4,
                        }}
                      >
                        {routine.description}
                      </p>
                    )}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        marginTop: 8,
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          background: "var(--bg-badge)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {routine.routine_id}
                      </span>
                      <span
                        style={{
                          fontFamily: "monospace",
                          background: "var(--bg-badge)",
                          padding: "2px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {routine.token}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => openEdit(routine)}
                      className="btn-secondary"
                      style={{ padding: "6px 10px" }}
                      title="Edit routine"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(routine.id)}
                      disabled={isDeleting}
                      className="btn-secondary"
                      style={{
                        padding: "6px 10px",
                        color: "var(--error)",
                        borderColor: "var(--error)",
                        opacity: isDeleting ? 0.5 : 1,
                      }}
                      title="Delete routine"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Fire section */}
                <div
                  style={{
                    borderTop: "1px solid var(--border-color)",
                    padding: "12px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "var(--bg-primary)",
                  }}
                >
                  <input
                    value={contextTexts[routine.id] || ""}
                    onChange={(e) =>
                      setContextTexts((prev) => ({
                        ...prev,
                        [routine.id]: e.target.value,
                      }))
                    }
                    placeholder="Optional context payload..."
                    style={{
                      flex: 1,
                      padding: "8px 12px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                      fontSize: 13,
                      outline: "none",
                    }}
                  />
                  <button
                    onClick={() => handleFire(routine)}
                    disabled={isFiring}
                    className="btn-primary"
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      opacity: isFiring ? 0.7 : 1,
                      flexShrink: 0,
                    }}
                  >
                    {isFiring ? (
                      <>
                        <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                        Firing...
                      </>
                    ) : (
                      <>
                        <Send size={14} />
                        Fire
                      </>
                    )}
                  </button>
                </div>

                {/* Status section */}
                {(routine.last_fired_at || routine.last_session_url || routine.cron_schedule || lastRunByRoutine[routine.id]) && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border-color)",
                      padding: "10px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      flexWrap: "wrap",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {routine.cron_schedule && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} color="var(--success)" />
                        {describeCron(routine.cron_schedule)}
                        <code style={{ marginLeft: 4, fontSize: 11, color: "var(--text-muted)" }}>
                          {routine.cron_schedule}
                        </code>
                      </span>
                    )}
                    {routine.cron_schedule && (() => {
                      const next = upcoming.find((u) => u.routine_id === routine.id);
                      if (!next) return null;
                      return (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            borderRadius: 10,
                            background: "rgba(34, 197, 94, 0.1)",
                            color: "var(--success)",
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                          title={new Date(next.at).toLocaleString()}
                        >
                          Next fires {formatRelativeFuture(next.at)}
                        </span>
                      );
                    })()}
                    {routine.last_fired_at && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} />
                        Last fired: {new Date(routine.last_fired_at).toLocaleString()}
                      </span>
                    )}
                    {lastRunByRoutine[routine.id]?.status === "error" && (
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--error)",
                          maxWidth: 360,
                        }}
                        title={lastRunByRoutine[routine.id].error || ""}
                      >
                        <Clock size={12} />
                        Last attempt {new Date(lastRunByRoutine[routine.id].fired_at).toLocaleString()}:
                        <span
                          style={{
                            fontFamily: "monospace",
                            fontSize: 11,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: 220,
                          }}
                        >
                          {trimError(lastRunByRoutine[routine.id].error)}
                        </span>
                      </span>
                    )}
                    {routine.last_session_url && (
                      <a
                        href={routine.last_session_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                      >
                        <ExternalLink size={12} />
                        View Session
                      </a>
                    )}
                    <button
                      onClick={() =>
                        setExpandedHistoryId((id) => (id === routine.id ? null : routine.id))
                      }
                      style={{
                        marginLeft: "auto",
                        background: "transparent",
                        border: "none",
                        color: "var(--accent)",
                        cursor: "pointer",
                        fontSize: 12,
                        padding: 0,
                      }}
                    >
                      {expandedHistoryId === routine.id ? "Hide history" : "Show history"}
                    </button>
                  </div>
                )}

                {expandedHistoryId === routine.id && (
                  <RoutineHistory
                    routineId={routine.id}
                    fallbackRuns={runs.filter((r) => r.routine_id === routine.id)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* Add Routine Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api", cron_schedule: null });
        }}
        title="Add Routine"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Name */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Name
            </label>
            <input
              value={formData.name}
              onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g., Nightly Triage"
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          {/* Routine ID */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Routine ID
            </label>
            <input
              value={formData.routine_id}
              onChange={(e) => setFormData((p) => ({ ...p, routine_id: e.target.value }))}
              placeholder="trig_01HJKL..."
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Prefixed <code>trig_</code>. Found in the URL shown when you add an API trigger at{" "}
              <a
                href="https://claude.ai/code/routines"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)" }}
              >
                claude.ai/code/routines
              </a>
            </p>
          </div>

          {/* Bearer Token */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Bearer Token
            </label>
            <input
              type="password"
              value={formData.token}
              onChange={(e) => setFormData((p) => ({ ...p, token: e.target.value }))}
              placeholder="sk-ant-oat01-..."
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "4px 0 0" }}>
              Prefixed <code>sk-ant-oat01-</code>. Generated per-routine — not your API key.
              Click "Generate token" in the API trigger modal at claude.ai/code/routines.
            </p>
          </div>

          {/* Description */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))}
              placeholder="What does this routine do?"
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
                resize: "vertical",
              }}
            />
          </div>

          {/* Trigger Type */}
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Trigger Type
            </label>
            <select
              value={formData.trigger_type}
              onChange={(e) => setFormData((p) => ({ ...p, trigger_type: e.target.value }))}
              style={{
                width: "100%",
                padding: "10px 12px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
            >
              <option value="api">API</option>
              <option value="scheduled">Scheduled</option>
              <option value="github">GitHub</option>
            </select>
          </div>

          {/* Schedule */}
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={formData.cron_schedule !== null}
                onChange={(e) =>
                  setFormData((p) => ({
                    ...p,
                    cron_schedule: e.target.checked ? "0 9 * * *" : null,
                  }))
                }
              />
              Run on a schedule
            </label>
            <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "0 0 8px" }}>
              {formData.cron_schedule === null
                ? "Leave unchecked to fire this routine manually or via API only."
                : "The local scheduler worker (npm run dev:scheduler) will fire this routine on a cron."}
            </p>
            {formData.cron_schedule !== null && (
              <ScheduleBuilder
                value={formData.cron_schedule}
                onChange={(cron) => setFormData((p) => ({ ...p, cron_schedule: cron }))}
              />
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              className="btn-secondary"
              onClick={() => {
                setModalOpen(false);
                setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api", cron_schedule: null });
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleCreate}
              disabled={saving || !formData.name || !formData.routine_id || !formData.token}
              style={{
                opacity: saving || !formData.name || !formData.routine_id || !formData.token ? 0.5 : 1,
              }}
            >
              {saving ? "Saving..." : "Add Routine"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Routine Modal */}
      <Modal
        open={editingRoutine !== null}
        onClose={() => setEditingRoutine(null)}
        title="Edit Routine"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={modalLabelStyle}>Name</label>
            <input
              value={editData.name}
              onChange={(e) =>
                setEditData((p) => ({ ...p, name: e.target.value }))
              }
              placeholder="Routine name"
              style={{ width: "100%" }}
            />
          </div>
          <div>
            <label style={modalLabelStyle}>Routine ID</label>
            <input
              value={editData.routine_id}
              onChange={(e) =>
                setEditData((p) => ({ ...p, routine_id: e.target.value }))
              }
              placeholder="trig_01HJKL..."
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            />
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}
            >
              Prefixed <code>trig_</code>. From the URL at
              claude.ai/code/routines.
            </p>
          </div>
          <div>
            <label style={modalLabelStyle}>Bearer Token</label>
            <input
              type="password"
              value={editData.token}
              onChange={(e) =>
                setEditData((p) => ({ ...p, token: e.target.value }))
              }
              placeholder="sk-ant-oat01-..."
              style={{
                width: "100%",
                fontFamily: "monospace",
                fontSize: 13,
              }}
            />
            <p
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                margin: "4px 0 0",
              }}
            >
              Prefixed <code>sk-ant-oat01-</code>. Generated per-routine.
            </p>
          </div>
          <div>
            <label style={modalLabelStyle}>Description</label>
            <textarea
              value={editData.description}
              onChange={(e) =>
                setEditData((p) => ({ ...p, description: e.target.value }))
              }
              placeholder="Optional description..."
              rows={2}
              style={{ width: "100%", resize: "vertical" }}
            />
          </div>
          <div>
            <label style={modalLabelStyle}>Trigger Type</label>
            <select
              value={editData.trigger_type}
              onChange={(e) =>
                setEditData((p) => ({ ...p, trigger_type: e.target.value }))
              }
              style={{ width: "100%" }}
            >
              <option value="api">API</option>
              <option value="cron">Cron / Scheduled</option>
              <option value="github">GitHub Event</option>
              <option value="manual">Manual</option>
            </select>
          </div>
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={editData.cron_schedule !== null}
                onChange={(e) =>
                  setEditData((p) => ({
                    ...p,
                    cron_schedule: e.target.checked ? "0 9 * * *" : null,
                  }))
                }
              />
              Run on a schedule
            </label>
            {editData.cron_schedule !== null && (
              <ScheduleBuilder
                value={editData.cron_schedule}
                onChange={(cron) =>
                  setEditData((p) => ({ ...p, cron_schedule: cron }))
                }
              />
            )}
          </div>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn-secondary"
              onClick={() => setEditingRoutine(null)}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleEdit}
              disabled={
                editSaving ||
                !editData.name ||
                !editData.routine_id ||
                !editData.token
              }
              style={{
                padding: "8px 16px",
                fontSize: 13,
                opacity:
                  editSaving ||
                  !editData.name ||
                  !editData.routine_id ||
                  !editData.token
                    ? 0.5
                    : 1,
              }}
            >
              {editSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Spin animation for loader */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const modalLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

// ---------------------------------------------------------------------------
// Calendar view — shows a week strip + daily run history
// ---------------------------------------------------------------------------

function RoutineCalendar({
  runs,
  routines,
  upcoming,
  agentRuns,
  agentUpcoming,
}: {
  runs: RoutineRun[];
  routines: Routine[];
  upcoming: UpcomingRun[];
  agentRuns: AgentRunRow[];
  agentUpcoming: UpcomingAgentRun[];
}) {
  const today = new Date();
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const dayNames = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

  const localDateKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const runsForDate = (date: Date) => {
    const key = localDateKey(date);
    return runs.filter((r) => localDateKey(new Date(r.fired_at)) === key);
  };

  const upcomingForDate = (date: Date) => {
    const key = localDateKey(date);
    return upcoming.filter((u) => localDateKey(new Date(u.at)) === key);
  };

  const agentRunsForDate = (date: Date) => {
    const key = localDateKey(date);
    return agentRuns.filter((r) => localDateKey(new Date(r.fired_at)) === key);
  };

  const agentUpcomingForDate = (date: Date) => {
    const key = localDateKey(date);
    return agentUpcoming.filter((u) => localDateKey(new Date(u.at)) === key);
  };

  const [selectedDay, setSelectedDay] = useState(0);
  const selectedDate = days[selectedDay];
  const selectedRuns = runsForDate(selectedDate);
  const selectedUpcoming = upcomingForDate(selectedDate);
  const selectedAgentRuns = agentRunsForDate(selectedDate);
  const selectedAgentUpcoming = agentUpcomingForDate(selectedDate);

  const isToday = (d: Date) =>
    d.toDateString() === today.toDateString();
  const isPast = (d: Date) => d < today && !isToday(d);

  return (
    <div>
      {/* Week strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 8,
          marginBottom: 20,
        }}
      >
        {days.map((d, i) => {
          const active = i === selectedDay;
          const runCount = runsForDate(d).length + agentRunsForDate(d).length;
          const upcomingCount = upcomingForDate(d).length + agentUpcomingForDate(d).length;
          return (
            <button
              key={i}
              onClick={() => setSelectedDay(i)}
              style={{
                padding: "12px 8px",
                borderRadius: 10,
                border: active
                  ? "2px solid var(--accent)"
                  : "1px solid var(--border-color)",
                background: active ? "var(--accent-subtle)" : "var(--bg-card)",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: "var(--text-muted)",
                  letterSpacing: "0.5px",
                  marginBottom: 4,
                }}
              >
                {dayNames[d.getDay()]}
              </div>
              <div
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: active
                    ? "var(--accent)"
                    : "var(--text-primary)",
                }}
              >
                {d.getDate()}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  display: "flex",
                  gap: 3,
                  alignItems: "center",
                }}
              >
                {runCount > 0 && (
                  <span
                    title={`${runCount} run${runCount === 1 ? "" : "s"}`}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: "3px 5px",
                      borderRadius: 8,
                      background: "var(--accent)",
                      color: "var(--bg-card)",
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {runCount}
                  </span>
                )}
                {upcomingCount > 0 && (
                  <span
                    title={`${upcomingCount} scheduled`}
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      lineHeight: 1,
                      padding: "3px 5px",
                      borderRadius: 8,
                      background: "var(--success)",
                      color: "var(--bg-card)",
                      minWidth: 16,
                      textAlign: "center",
                    }}
                  >
                    {upcomingCount}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day detail */}
      <div
        className="card"
        style={{ padding: 20 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
          }}
        >
          {isToday(selectedDate) && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--error)",
              }}
            />
          )}
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            {isToday(selectedDate)
              ? "Today"
              : selectedDate.toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
          </h3>
        </div>

        {selectedRuns.length === 0 &&
        selectedUpcoming.length === 0 &&
        selectedAgentRuns.length === 0 &&
        selectedAgentUpcoming.length === 0 ? (
          <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>
            Nothing ran or scheduled on this day.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedRuns.map((run) => (
              <div
                key={`run-${run.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "var(--bg-input)",
                  borderRadius: 8,
                  fontSize: 13,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        run.status === "success"
                          ? "var(--success)"
                          : "var(--error)",
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>{run.routine_name}</span>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--bg-badge)",
                      color: "var(--text-muted)",
                    }}
                  >
                    Ran
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: "var(--text-muted)",
                    fontSize: 12,
                  }}
                >
                  {run.error && (
                    <span style={{ color: "var(--error)", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {run.error}
                    </span>
                  )}
                  {run.session_url && (
                    <a
                      href={run.session_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      View session
                    </a>
                  )}
                  <span>
                    {new Date(run.fired_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}
            {!isPast(selectedDate) &&
              selectedUpcoming.map((u, idx) => (
                <div
                  key={`up-${u.routine_id}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "var(--bg-input)",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px dashed var(--border-color)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={14} color="var(--success)" />
                    <span style={{ fontWeight: 500 }}>{u.routine_name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(34, 197, 94, 0.1)",
                        color: "var(--success)",
                      }}
                    >
                      Scheduled
                    </span>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(u.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}

            {/* Agent runs (historical) */}
            {selectedAgentRuns.map((run) => (
              <div
                key={`agent-run-${run.id}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 12px",
                  background: "var(--bg-input)",
                  borderRadius: 8,
                  fontSize: 13,
                  borderLeft: "3px solid var(--accent)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background:
                        run.status === "success"
                          ? "var(--success)"
                          : "var(--error)",
                    }}
                  />
                  <span style={{ fontWeight: 500 }}>
                    {run.agent_name || run.agent_id}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: "var(--accent-subtle)",
                      color: "var(--accent)",
                    }}
                  >
                    Agent · Ran
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    color: "var(--text-muted)",
                    fontSize: 12,
                  }}
                >
                  {run.error && (
                    <span
                      style={{
                        color: "var(--error)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={run.error}
                    >
                      {run.error}
                    </span>
                  )}
                  {run.session_url && (
                    <a
                      href={run.session_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--accent)", textDecoration: "none" }}
                    >
                      View session
                    </a>
                  )}
                  <span>
                    {new Date(run.fired_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))}

            {/* Agent upcoming */}
            {!isPast(selectedDate) &&
              selectedAgentUpcoming.map((u, idx) => (
                <div
                  key={`agent-up-${u.agent_id}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "var(--bg-input)",
                    borderRadius: 8,
                    fontSize: 13,
                    border: "1px dashed var(--accent-muted)",
                    borderLeft: "3px solid var(--accent)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Clock size={14} color="var(--accent)" />
                    <span style={{ fontWeight: 500 }}>{u.agent_name}</span>
                    <span
                      style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: "0.5px",
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--accent-subtle)",
                        color: "var(--accent)",
                      }}
                    >
                      Agent · Scheduled
                    </span>
                  </div>
                  <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                    {new Date(u.at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-routine run history (expandable panel under each card)
// ---------------------------------------------------------------------------

function RoutineHistory({
  routineId,
  fallbackRuns,
}: {
  routineId: number;
  fallbackRuns: RoutineRun[];
}) {
  const [runs, setRuns] = useState<RoutineRun[]>(fallbackRuns);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/routines/runs?routine_id=${routineId}&limit=50`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { runs?: RoutineRun[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.runs)) setRuns(data.runs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [routineId]);

  return (
    <div
      style={{
        borderTop: "1px solid var(--border-color)",
        padding: "12px 20px",
        background: "var(--bg-primary)",
      }}
    >
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
      {loading && runs.length === 0 ? (
        <LoadingSkeleton height={16} width="40%" />
      ) : runs.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
          No runs yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {runs.map((run) => (
            <div
              key={run.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: "var(--bg-input)",
                borderRadius: 6,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      run.status === "success"
                        ? "var(--success)"
                        : "var(--error)",
                  }}
                />
                <span style={{ color: "var(--text-secondary)" }}>
                  {new Date(run.fired_at).toLocaleString()}
                </span>
                {run.error && (
                  <span
                    style={{
                      color: "var(--error)",
                      maxWidth: 300,
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
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {run.session_id && (
                  <code
                    style={{
                      fontSize: 11,
                      color: "var(--text-muted)",
                      background: "var(--bg-badge)",
                      padding: "1px 5px",
                      borderRadius: 4,
                    }}
                  >
                    {run.session_id.slice(0, 10)}…
                  </code>
                )}
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
                    }}
                  >
                    <ExternalLink size={11} />
                    View
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
