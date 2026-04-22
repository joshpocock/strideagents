"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Play,
  Pause,
  SkipForward,
  Wrench,
  Type,
  AlertCircle,
  Clock,
  Bot,
  Zap,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Timer,
  Hash,
  Activity,
  MessageSquare,
  Settings,
  Plug,
  Cpu,
  Coins,
  Archive,
  OctagonMinus,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { useToast } from "@/components/Toast";
import Modal from "@/components/Modal";

interface ReplayEvent {
  id: string;
  index: number;
  type: string;
  rawType: string;
  description: string;
  timestamp: string;
  offsetMs: number;
  detail: Record<string, unknown>;
}

interface SessionInfo {
  id: string;
  agent_id: string | null;
  environment_id?: string | null;
  status: string;
  created_at: string;
  updated_at?: string;
  archived_at?: string | null;
  durationMs: number;
  tokenEstimate: number;
}

const typeConfig: Record<
  string,
  { color: string; bg: string; icon: typeof Wrench; label: string }
> = {
  tool_use: {
    color: "#5B9BD5",
    bg: "rgba(91, 155, 213, 0.1)",
    icon: Wrench,
    label: "Tool",
  },
  text: {
    color: "var(--text-primary)",
    bg: "var(--bg-card-hover)",
    icon: Type,
    label: "Text",
  },
  error: {
    color: "var(--error)",
    bg: "rgba(239, 68, 68, 0.1)",
    icon: AlertCircle,
    label: "Error",
  },
  status: {
    color: "var(--text-secondary)",
    bg: "var(--bg-badge)",
    icon: Clock,
    label: "Status",
  },
};

// ---------------------------------------------------------------------------
// Trace types & helpers
// ---------------------------------------------------------------------------

interface TraceEvent {
  type: string;
  relative_time?: string;
  relative_seconds?: number;
  content?: unknown;
  tool_name?: string;
  tool_input?: unknown;
  tool_result?: unknown;
  error_type?: string;
  error_message?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
  model?: string;
  cost?: number;
  cumulative_cost?: number;
  [key: string]: unknown;
}

interface TraceData {
  session_id: string;
  model: string;
  status: string;
  created_at: string;
  duration_seconds: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  events: TraceEvent[];
}

const traceEventIcons: Record<string, { icon: typeof MessageSquare; color: string }> = {
  "user.message": { icon: MessageSquare, color: "var(--accent)" },
  "agent.message": { icon: Bot, color: "var(--success)" },
  "agent.tool_use": { icon: Wrench, color: "var(--warning)" },
  "agent.custom_tool_use": { icon: Settings, color: "var(--text-secondary)" },
  "agent.mcp_tool_use": { icon: Plug, color: "#8B5CF6" },
  "session.error": { icon: AlertCircle, color: "var(--error)" },
  "span.model_request_end": { icon: Cpu, color: "var(--accent)" },
  "session.status_idle": { icon: CheckCircle, color: "var(--success)" },
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function getTraceEventLabel(event: TraceEvent): string {
  switch (event.type) {
    case "user.message": return "User Message";
    case "agent.message": return "Agent Message";
    case "agent.tool_use": return `Tool: ${event.tool_name || "unknown"}`;
    case "agent.custom_tool_use": return `Custom Tool: ${event.tool_name || "unknown"}`;
    case "agent.mcp_tool_use": return `MCP Tool: ${event.tool_name || "unknown"}`;
    case "session.error": return `Error: ${event.error_type || "unknown"}`;
    case "span.model_request_end": return "Model Request Complete";
    case "session.status_idle": return "Session Idle";
    default: return event.type;
  }
}

function TraceJsonBlock({ data }: { data: unknown }) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return (
    <pre
      style={{
        background: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
        borderRadius: 6,
        padding: 12,
        fontSize: 12,
        fontFamily: "monospace",
        color: "var(--text-secondary)",
        overflow: "auto",
        maxHeight: 300,
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        margin: 0,
      }}
    >
      {text}
    </pre>
  );
}

function TraceContentBlocks({ content }: { content: unknown }) {
  if (!content) return null;
  const blocks = Array.isArray(content) ? content : [content];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {blocks.map((block: Record<string, unknown>, i: number) => {
        if (block.type === "text" && block.text) {
          return (
            <p key={i} style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>
              {block.text as string}
            </p>
          );
        }
        if (block.type === "tool_use") {
          return (
            <div key={i}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--warning)", marginBottom: 4 }}>
                Tool: {(block.name as string) || "unknown"}
              </div>
              <TraceJsonBlock data={block.input} />
            </div>
          );
        }
        if (block.type === "tool_result") {
          return (
            <div key={i}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--success)", marginBottom: 4 }}>Result</div>
              <TraceJsonBlock data={block.content || block.output} />
            </div>
          );
        }
        return <TraceJsonBlock key={i} data={block} />;
      })}
    </div>
  );
}

function TraceTimelineEvent({ event }: { event: TraceEvent }) {
  const [expanded, setExpanded] = useState(false);
  const iconConfig = traceEventIcons[event.type] || { icon: Activity, color: "var(--text-muted)" };
  const Icon = iconConfig.icon;
  const isError = event.type === "session.error";

  return (
    <div style={{ display: "flex", gap: 12, position: "relative" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 32, flexShrink: 0 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: 8,
            background: isError ? "rgba(239, 68, 68, 0.1)" : "var(--bg-badge)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
        >
          <Icon size={16} color={iconConfig.color} />
        </div>
        <div style={{ width: 2, flex: 1, background: "var(--border-color)", minHeight: 12 }} />
      </div>

      <div style={{ flex: 1, paddingBottom: 16, minWidth: 0 }}>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left",
          }}
        >
          <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-muted)", flexShrink: 0, width: 50 }}>
            {event.relative_time || "+0:00"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 500, color: isError ? "var(--error)" : "var(--text-primary)", flex: 1 }}>
            {getTraceEventLabel(event)}
          </span>
          {event.input_tokens !== undefined && (
            <span style={{
              fontSize: 11, fontFamily: "monospace", background: "var(--accent-subtle)",
              color: "var(--accent)", padding: "2px 6px", borderRadius: 4, flexShrink: 0,
            }}>
              {formatTokens(event.input_tokens)}in / {formatTokens(event.output_tokens || 0)}out
            </span>
          )}
          {expanded ? <ChevronDown size={14} color="var(--text-muted)" /> : <ChevronRight size={14} color="var(--text-muted)" />}
        </button>

        {expanded && (
          <div style={{ marginTop: 8, padding: 12, background: "var(--bg-card)", border: "1px solid var(--border-color)", borderRadius: 8 }}>
            {(event.type === "user.message" || event.type === "agent.message") && !!event.content && (
              <TraceContentBlocks content={event.content} />
            )}
            {(event.type === "agent.tool_use" || event.type === "agent.custom_tool_use" || event.type === "agent.mcp_tool_use") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)" }}>Input</div>
                <TraceJsonBlock data={event.tool_input} />
                {!!event.tool_result && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 4 }}>Result</div>
                    <TraceJsonBlock data={event.tool_result} />
                  </>
                )}
              </div>
            )}
            {event.type === "session.error" && (
              <div style={{
                padding: 12, background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239, 68, 68, 0.2)",
                borderRadius: 6, color: "var(--error)", fontSize: 13,
              }}>
                <strong>{event.error_type || "Error"}: </strong>{event.error_message || "Unknown error"}
              </div>
            )}
            {event.type === "span.model_request_end" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                {[
                  { label: "Input Tokens", value: formatTokens(event.input_tokens || 0) },
                  { label: "Output Tokens", value: formatTokens(event.output_tokens || 0) },
                  { label: "Cache Read", value: formatTokens(event.cache_read_tokens || 0) },
                  { label: "Cache Creation", value: formatTokens(event.cache_creation_tokens || 0) },
                ].map((item) => (
                  <div key={item.label}>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace" }}>{item.value}</div>
                  </div>
                ))}
                <div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>Cost</div>
                  <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", color: "var(--accent)" }}>
                    ${(event.cost || 0).toFixed(4)}
                  </div>
                </div>
              </div>
            )}
            {!["user.message", "agent.message", "agent.tool_use", "agent.custom_tool_use", "agent.mcp_tool_use", "session.error", "span.model_request_end", "session.status_idle"].includes(event.type) && (
              <TraceJsonBlock data={event} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trace Tab Component
// ---------------------------------------------------------------------------

function TraceTab({ sessionId }: { sessionId: string }) {
  const [trace, setTrace] = useState<TraceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    fetch(`/api/sessions/${sessionId}/trace`)
      .then(async (r) => {
        if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed to load trace"); }
        return r.json();
      })
      .then((data: TraceData) => setTrace(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 14 }}>
        Loading trace data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <AlertCircle size={40} color="var(--error)" style={{ marginBottom: 12 }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Failed to Load Trace</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>{error}</p>
      </div>
    );
  }

  if (!trace) return null;

  const totalTokens = trace.total_input_tokens + trace.total_output_tokens;
  const inputPct = totalTokens > 0 ? (trace.total_input_tokens / totalTokens) * 100 : 50;

  return (
    <div>
      {/* Token Summary Bar */}
      <div className="card" style={{ marginBottom: 24, padding: 20 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 20, marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Model</div>
            <div style={{ fontSize: 14, fontWeight: 600, fontFamily: "monospace", background: "var(--bg-badge)", padding: "3px 8px", borderRadius: 6, display: "inline-block" }}>
              {trace.model}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Duration</div>
            <div style={{ fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={16} color="var(--text-secondary)" />
              {formatDuration(trace.duration_seconds)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Input Tokens</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatTokens(trace.total_input_tokens)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Output Tokens</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{formatTokens(trace.total_output_tokens)}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Estimated Cost</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent)", display: "flex", alignItems: "center", gap: 6 }}>
              <Coins size={16} />${trace.total_cost.toFixed(4)}
            </div>
          </div>
        </div>

        {/* Token distribution bar */}
        <div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Token Distribution</div>
          <div style={{ height: 8, borderRadius: 4, background: "var(--bg-badge)", overflow: "hidden", display: "flex" }}>
            <div style={{ width: `${inputPct}%`, background: "var(--accent)", borderRadius: "4px 0 0 4px", transition: "width 0.3s ease" }} />
            <div style={{ flex: 1, background: "var(--success)", borderRadius: "0 4px 4px 0" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            <span style={{ color: "var(--accent)" }}>Input ({inputPct.toFixed(0)}%)</span>
            <span style={{ color: "var(--success)" }}>Output ({(100 - inputPct).toFixed(0)}%)</span>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="card" style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Event Timeline ({trace.events.length} events)
        </h2>
        {trace.events.length === 0 ? (
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>No events recorded for this session.</p>
        ) : (
          <div>
            {trace.events.map((event, i) => (
              <TraceTimelineEvent key={i} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page component with tabs
// ---------------------------------------------------------------------------

export default function SessionReplayPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [events, setEvents] = useState<ReplayEvent[]>([]);
  const [agentName, setAgentName] = useState("Loading...");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activeTab, setActiveTab] = useState<"transcript" | "debug">(
    "transcript"
  );
  const [messageInputOpen, setMessageInputOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [visibleUpTo, setVisibleUpTo] = useState(-1);

  const playIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Actions menu + message input + modals
  const { showToast } = useToast();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [sendEventOpen, setSendEventOpen] = useState(false);
  const [sendEventDraft, setSendEventDraft] = useState(
    '{\n  "type": "user.message",\n  "content": [{ "type": "text", "text": "..." }]\n}'
  );
  const [sendEventBusy, setSendEventBusy] = useState(false);
  const [sendEventError, setSendEventError] = useState<string | null>(null);

  const [messageInput, setMessageInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const handleSendMessage = async () => {
    const text = messageInput.trim();
    if (!text || sendingMessage) return;
    setSendingMessage(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to send message", "error");
        return;
      }
      showToast("Message sent", "success");
      setMessageInput("");
      // Give the API a beat to process, then refetch
      setTimeout(() => {
        refresh();
      }, 500);
    } finally {
      setSendingMessage(false);
    }
  };

  const handleInterrupt = async () => {
    setActionsOpen(false);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/interrupt`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to interrupt", "error");
        return;
      }
      showToast("Interrupt sent", "success");
      setTimeout(() => refresh(), 500);
    } catch {
      showToast("Network error", "error");
    }
  };

  const handleArchive = async () => {
    setActionsOpen(false);
    if (
      !window.confirm(
        "Archive this session? It will no longer accept new events."
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/sessions/${sessionId}/archive`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to archive", "error");
        return;
      }
      showToast("Session archived", "success");
    } catch {
      showToast("Network error", "error");
    }
  };

  const handleSendEvent = async () => {
    setSendEventError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(sendEventDraft);
    } catch (err) {
      setSendEventError(
        err instanceof Error ? err.message : "Invalid JSON"
      );
      return;
    }
    const body: Record<string, unknown> = Array.isArray(parsed)
      ? { events: parsed }
      : (parsed as Record<string, unknown>);
    setSendEventBusy(true);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/send-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSendEventError(err.error || "Failed to send event");
        return;
      }
      showToast("Event sent", "success");
      setSendEventOpen(false);
      setTimeout(() => refresh(), 500);
    } finally {
      setSendEventBusy(false);
    }
  };

  // Single replay refresh. Safe to call repeatedly for polling.
  const refresh = useCallback(
    async (opts?: { initial?: boolean }) => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/replay`);
        if (!res.ok) {
          if (opts?.initial) {
            const data = await res.json().catch(() => ({}));
            setError(data.error || "Failed to load session");
          }
          return;
        }
        const data = await res.json();
        setSession(data.session);
        const nextEvents: ReplayEvent[] = data.events || [];
        setEvents((prev) => {
          // Only auto-advance visibleUpTo when new events arrived
          if (nextEvents.length > prev.length) {
            setVisibleUpTo(nextEvents.length - 1);
          }
          return nextEvents;
        });

        if (opts?.initial) {
          if (nextEvents.length > 0) setSelectedIndex(0);
          if (data.session?.agent_id) {
            try {
              const agentRes = await fetch(
                `/api/agents/${data.session.agent_id}`
              );
              if (agentRes.ok) {
                const agent = await agentRes.json();
                setAgentName(agent.name || "Unknown Agent");
              } else {
                setAgentName("Unknown Agent");
              }
            } catch {
              setAgentName("Unknown Agent");
            }
          } else {
            setAgentName("Unknown Agent");
          }
        }
      } catch {
        if (opts?.initial) setError("Failed to connect to server");
      } finally {
        if (opts?.initial) setLoading(false);
      }
    },
    [sessionId]
  );

  // Initial load + polling while the session is live
  useEffect(() => {
    refresh({ initial: true });
  }, [refresh]);

  useEffect(() => {
    // Stop polling if archived or we've hit an error
    if (error || session?.status === "terminated" || session?.archived_at) {
      return;
    }
    const interval = setInterval(() => {
      refresh();
    }, 3000);
    return () => clearInterval(interval);
  }, [refresh, error, session?.status, session?.archived_at]);

  // Playback logic
  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearTimeout(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  }, []);

  const advancePlayback = useCallback(() => {
    setVisibleUpTo((prev) => {
      const next = prev + 1;
      if (next >= events.length) {
        stopPlayback();
        return prev;
      }
      setSelectedIndex(next);
      return next;
    });
  }, [events.length, stopPlayback]);

  const startPlayback = useCallback(() => {
    if (events.length === 0) return;
    setIsPlaying(true);

    // If at the end, restart
    if (visibleUpTo >= events.length - 1) {
      setVisibleUpTo(-1);
      setSelectedIndex(0);
    }
  }, [events.length, visibleUpTo]);

  useEffect(() => {
    if (!isPlaying || events.length === 0) return;

    const scheduleNext = () => {
      const currentIdx = visibleUpTo + 1;
      if (currentIdx >= events.length) {
        stopPlayback();
        return;
      }

      // Calculate delay based on time between events
      let delayMs = 500; // default half second
      if (currentIdx > 0 && currentIdx < events.length) {
        const diff =
          events[currentIdx].offsetMs - events[currentIdx - 1].offsetMs;
        delayMs = Math.max(100, Math.min(diff / playbackSpeed, 2000));
      }

      playIntervalRef.current = setTimeout(() => {
        advancePlayback();
      }, delayMs);
    };

    scheduleNext();

    return () => {
      if (playIntervalRef.current) {
        clearTimeout(playIntervalRef.current);
      }
    };
  }, [
    isPlaying,
    visibleUpTo,
    events,
    playbackSpeed,
    advancePlayback,
    stopPlayback,
  ]);

  // Scroll selected event into view
  useEffect(() => {
    const el = document.getElementById(`timeline-event-${selectedIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [selectedIndex]);

  const formatMs = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  };

  const formatTimestamp = (iso: string) => {
    if (!iso) return "--";
    return new Date(iso).toLocaleTimeString();
  };

  const progressPct =
    events.length > 0
      ? Math.min(100, ((visibleUpTo + 1) / events.length) * 100)
      : 0;

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "60vh",
          color: "var(--text-muted)",
          fontSize: 14,
        }}
      >
        Loading replay...
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Link
          href="/sessions"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
            marginBottom: 20,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} />
          Back to Sessions
        </Link>
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--error)",
            fontSize: 14,
          }}
        >
          <AlertCircle
            size={24}
            style={{ marginBottom: 8 }}
          />
          <div>{error}</div>
        </div>
      </div>
    );
  }

  const selectedEvent = events[selectedIndex] || null;

  // The Transcript tab hides internal plumbing (model requests, status pings,
  // thinking, tool wiring) and shows only the human-visible conversation.
  const TRANSCRIPT_TYPES = new Set([
    "user.message",
    "agent.message",
    "user.interrupt",
  ]);
  const visibleEvents =
    activeTab === "transcript"
      ? events.filter((e) => TRANSCRIPT_TYPES.has(e.rawType))
      : events;

  // For each agent.message in transcript mode, find the most recent
  // span.model_request_end that preceded it so we can show token counts.
  const tokenLookup = new Map<string, { input: number; output: number }>();
  const tokenSummary = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
  };
  {
    let pending: { input: number; output: number } | null = null;
    for (const ev of events) {
      if (ev.rawType === "span.model_request_end") {
        const usage = (ev.detail as Record<string, unknown>)?.model_usage as
          | Record<string, number>
          | undefined;
        const input = usage?.input_tokens ?? 0;
        const output = usage?.output_tokens ?? 0;
        const cacheRead = usage?.cache_read_input_tokens ?? 0;
        const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
        tokenSummary.input += input;
        tokenSummary.output += output;
        tokenSummary.cacheRead += cacheRead;
        tokenSummary.cacheWrite += cacheWrite;
        pending = { input, output };
      } else if (ev.rawType === "agent.message" && pending) {
        tokenLookup.set(ev.id, pending);
        pending = null;
      }
    }
  }
  const uncachedInput = Math.max(
    0,
    tokenSummary.input - tokenSummary.cacheRead
  );

  return (
    <div>
      {/* Back link */}
      <Link
        href="/sessions"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "var(--text-secondary)",
          marginBottom: 16,
          textDecoration: "none",
        }}
      >
        <ArrowLeft size={16} />
        Back to Sessions
      </Link>

      {/* Session Info Bar */}
      <div
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 24,
          marginBottom: 16,
          padding: "16px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Bot size={18} color="var(--accent)" />
          <span style={{ fontWeight: 600, fontSize: 15 }}>{agentName}</span>
        </div>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            fontWeight: 500,
            color:
              session?.status === "completed"
                ? "var(--success)"
                : session?.status === "failed"
                  ? "var(--error)"
                  : "var(--text-secondary)",
            background:
              session?.status === "completed"
                ? "rgba(34, 197, 94, 0.1)"
                : session?.status === "failed"
                  ? "rgba(239, 68, 68, 0.1)"
                  : "var(--bg-badge)",
            padding: "3px 10px",
            borderRadius: 12,
            textTransform: "capitalize",
          }}
        >
          {session?.status === "completed" ? (
            <CheckCircle size={12} />
          ) : session?.status === "failed" ? (
            <AlertCircle size={12} />
          ) : (
            <Zap size={12} />
          )}
          {session?.status || "unknown"}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
          }}
        >
          <Timer size={14} />
          {session ? formatMs(session.durationMs) : "--"}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "var(--text-secondary)",
            position: "relative",
            cursor: "help",
          }}
          title={`Tokens in / out\nCache read: ${tokenSummary.cacheRead.toLocaleString()}\nCache write: ${tokenSummary.cacheWrite.toLocaleString()}\nUncached in: ${uncachedInput.toLocaleString()}`}
        >
          <Hash size={14} />
          {tokenSummary.input + tokenSummary.output > 0
            ? `${((tokenSummary.input + tokenSummary.output) / 1000).toFixed(1)}k / ${tokenSummary.output}`
            : `~${session?.tokenEstimate || 0} tokens`}
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <code
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              wordBreak: "break-all",
              overflowWrap: "anywhere",
              minWidth: 0,
            }}
          >
            {sessionId.substring(0, 24)}...
          </code>

          {/* Continue this session in Chat — parity with the Task Board */}
          {session?.agent_id && !session?.archived_at && (
            <Link
              href={`/chat?session=${sessionId}&agent=${session.agent_id}`}
              className="btn-secondary"
              style={{
                padding: "6px 12px",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                textDecoration: "none",
              }}
              title="Open this session in the chat UI"
            >
              <MessageSquare size={13} />
              Continue in Chat
            </Link>
          )}

          {/* Actions dropdown */}
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              onBlur={() =>
                setTimeout(() => setActionsOpen(false), 120)
              }
              className="btn-secondary"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 12px",
                fontSize: 13,
              }}
            >
              Actions
              <ChevronDown size={14} />
            </button>
            {actionsOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 200,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                  padding: 4,
                  zIndex: 40,
                }}
              >
                <ActionsMenuItem
                  icon={<OctagonMinus size={14} />}
                  label="Send interrupt"
                  onClick={handleInterrupt}
                />
                <ActionsMenuItem
                  icon={<Send size={14} />}
                  label="Send message"
                  onClick={() => {
                    setActionsOpen(false);
                    setMessageInputOpen(true);
                  }}
                />
                <ActionsMenuItem
                  icon={<MoreHorizontal size={14} />}
                  label="Send raw event..."
                  onClick={() => {
                    setActionsOpen(false);
                    setSendEventOpen(true);
                  }}
                />
                <ActionsMenuItem
                  icon={<Archive size={14} />}
                  label="Archive session"
                  onClick={handleArchive}
                  danger
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tab Switcher */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
          borderBottom: "1px solid var(--border-color)",
          paddingBottom: 0,
        }}
      >
        {([
          { key: "transcript" as const, label: "Transcript", icon: MessageSquare },
          { key: "debug" as const, label: "Debug", icon: Activity },
        ]).map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                background: "transparent",
                border: "none",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                cursor: "pointer",
                transition: "color 0.15s ease, border-color 0.15s ease",
                marginBottom: -1,
              }}
            >
              <TabIcon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Event Timeline — waterfall of all events as colored markers */}
      <EventTimeline
        events={events}
        selectedIndex={selectedIndex}
        onSelect={(i) => {
          setSelectedIndex(i);
          setVisibleUpTo(Math.max(visibleUpTo, i));
        }}
        totalDurationMs={session?.durationMs ?? 0}
      />

      {/* Transcript / Debug area — shared two-pane view */}
      {(
      <div
        style={{
          display: "flex",
          gap: 0,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          height: "calc(100vh - 320px)",
          minHeight: 400,
        }}
      >
        {/* Timeline Panel (Left) */}
        <div
          ref={timelineRef}
          style={{
            width: "35%",
            minWidth: 300,
            maxWidth: 420,
            background: "var(--bg-card)",
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid var(--border-color)",
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>
              {activeTab === "transcript" ? "Transcript" : "Debug"} (
              {visibleEvents.length} event
              {visibleEvents.length !== 1 ? "s" : ""})
            </span>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {events.length} total
            </span>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {visibleEvents.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                {activeTab === "transcript"
                  ? "No messages yet"
                  : "No events recorded"}
              </div>
            ) : (
              visibleEvents.map((event) => {
                const idx = events.indexOf(event);
                const isSelected = idx === selectedIndex;
                const role = transcriptRoleFor(event.rawType);
                const tokens = tokenLookup.get(event.id);

                return (
                  <button
                    key={event.id}
                    onClick={() => {
                      setSelectedIndex(idx);
                      if (idx > visibleUpTo) setVisibleUpTo(idx);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "64px 1fr auto",
                      gap: 10,
                      width: "100%",
                      padding: "8px 14px",
                      textAlign: "left",
                      background: isSelected
                        ? "var(--accent-subtle)"
                        : "transparent",
                      border: "none",
                      borderLeft: isSelected
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      cursor: "pointer",
                      alignItems: "center",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background =
                          "var(--bg-card-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <RoleBadge role={role} />
                    <div
                      style={{
                        fontSize: 13,
                        color: "var(--text-primary)",
                        lineHeight: 1.4,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {activeTab === "transcript" && role === "interrupt"
                        ? "Interrupted"
                        : event.description || event.rawType}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexShrink: 0,
                      }}
                    >
                      {tokens && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            fontFamily: "monospace",
                          }}
                          title={`Input: ${tokens.input.toLocaleString()} · Output: ${tokens.output.toLocaleString()}`}
                        >
                          {(tokens.input / 1000).toFixed(1)}k /{" "}
                          {tokens.output}
                        </span>
                      )}
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          fontFamily: "monospace",
                        }}
                      >
                        {formatOffsetClock(event.offsetMs)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Panel (Right) */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-primary)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Detail content */}
          <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
            {selectedEvent ? (
              <EventDetail event={selectedEvent} />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100%",
                  color: "var(--text-muted)",
                  fontSize: 14,
                }}
              >
                Select an event to view details
              </div>
            )}
          </div>

          {/* Playback Controls */}
          <div
            style={{
              padding: "12px 24px",
              borderTop: "1px solid var(--border-color)",
              background: "var(--bg-card)",
              display: "flex",
              alignItems: "center",
              gap: 16,
            }}
          >
            <button
              onClick={() => {
                if (isPlaying) {
                  stopPlayback();
                } else {
                  startPlayback();
                }
              }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: "var(--accent)",
                border: "none",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
              }}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>

            {/* Speed selector */}
            <div style={{ display: "flex", gap: 4 }}>
              {[1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setPlaybackSpeed(speed)}
                  style={{
                    padding: "4px 10px",
                    fontSize: 12,
                    fontWeight: playbackSpeed === speed ? 600 : 400,
                    color:
                      playbackSpeed === speed
                        ? "var(--accent)"
                        : "var(--text-secondary)",
                    background:
                      playbackSpeed === speed
                        ? "var(--accent-subtle)"
                        : "transparent",
                    border:
                      playbackSpeed === speed
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border-color)",
                    borderRadius: 4,
                    cursor: "pointer",
                  }}
                >
                  {speed}x
                </button>
              ))}
            </div>

            {/* Progress bar */}
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--bg-input)",
                borderRadius: 3,
                overflow: "hidden",
                cursor: "pointer",
                position: "relative",
              }}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const idx = Math.floor(pct * events.length);
                const clamped = Math.max(
                  0,
                  Math.min(events.length - 1, idx)
                );
                setSelectedIndex(clamped);
                setVisibleUpTo(clamped);
              }}
            >
              <div
                style={{
                  width: `${progressPct}%`,
                  height: "100%",
                  background: "var(--accent)",
                  borderRadius: 3,
                  transition: "width 0.3s ease",
                }}
              />
            </div>

            <span
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                whiteSpace: "nowrap",
              }}
            >
              {visibleUpTo + 1} {"/"} {events.length}
            </span>
          </div>
        </div>
      </div>
      )}

      {/* Message input — shown only when user opens it via Actions */}
      {messageInputOpen && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginTop: 16,
            padding: "10px 12px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            position: "sticky",
            bottom: 16,
            boxShadow: "0 6px 18px rgba(0,0,0,0.25)",
          }}
        >
          <input
            autoFocus
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              } else if (e.key === "Escape") {
                setMessageInputOpen(false);
              }
            }}
            placeholder="Send a message to the agent"
            style={{
              flex: 1,
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              color: "var(--text-primary)",
              fontSize: 14,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setMessageInputOpen(false)}
            className="btn-secondary"
            style={{ padding: "7px 10px", fontSize: 13 }}
            aria-label="Close"
          >
            Close
          </button>
          <button
            type="button"
            onClick={handleSendMessage}
            disabled={!messageInput.trim() || sendingMessage}
            className="btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "7px 14px",
              fontSize: 13,
              opacity: !messageInput.trim() || sendingMessage ? 0.5 : 1,
            }}
          >
            <Send size={14} />
            {sendingMessage ? "Sending..." : "Send"}
          </button>
        </div>
      )}

      {/* Send event modal */}
      <Modal
        open={sendEventOpen}
        onClose={() => {
          setSendEventOpen(false);
          setSendEventError(null);
        }}
        title="Send event"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Send a raw event to the session. Provide a single event object or an
            array, or use the{" "}
            <code style={{ fontFamily: "monospace" }}>events</code> wrapper.
          </p>
          <textarea
            value={sendEventDraft}
            onChange={(e) => {
              setSendEventDraft(e.target.value);
              setSendEventError(null);
            }}
            spellCheck={false}
            style={{
              width: "100%",
              minHeight: 220,
              padding: 12,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: 13,
              lineHeight: 1.55,
              background: "var(--bg-input)",
              border: `1px solid ${
                sendEventError ? "var(--error)" : "var(--border-color)"
              }`,
              borderRadius: 8,
              color: "var(--text-primary)",
              outline: "none",
              resize: "vertical",
            }}
          />
          {sendEventError && (
            <p
              style={{
                fontSize: 12,
                color: "var(--error)",
                margin: 0,
                fontFamily: "monospace",
              }}
            >
              {sendEventError}
            </p>
          )}
          <div
            style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
          >
            <button
              className="btn-secondary"
              onClick={() => setSendEventOpen(false)}
              style={{ padding: "7px 14px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSendEvent}
              disabled={sendEventBusy}
              style={{
                padding: "7px 14px",
                fontSize: 13,
                opacity: sendEventBusy ? 0.6 : 1,
              }}
            >
              {sendEventBusy ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ActionsMenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        width: "100%",
        padding: "9px 12px",
        fontSize: 13,
        background: "transparent",
        border: "none",
        borderRadius: 6,
        color: danger ? "var(--error)" : "var(--text-primary)",
        cursor: "pointer",
        textAlign: "left",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "var(--bg-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background =
          "transparent";
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: "var(--text-secondary)",
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Event Detail Sub-component
// ---------------------------------------------------------------------------

function EventDetail({ event }: { event: ReplayEvent }) {
  const config = typeConfig[event.type] || typeConfig.status;
  const Icon = config.icon;

  return (
    <div>
      {/* Event header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
          paddingBottom: 16,
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: config.bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={20} color={config.color} />
        </div>
        <div>
          <div
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            {config.label}{" "}
            <span
              style={{
                fontSize: 12,
                fontWeight: 400,
                color: "var(--text-muted)",
              }}
            >
              #{event.index + 1}
            </span>
          </div>
          <div
            style={{
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 12,
              marginTop: 2,
            }}
          >
            <span>{new Date(event.timestamp).toLocaleString()}</span>
            <span>+{formatMsStatic(event.offsetMs)}</span>
            <span style={{ color: "var(--text-muted)" }}>
              {event.rawType}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      {event.description && (
        <div style={{ marginBottom: 20 }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              marginBottom: 6,
              display: "block",
            }}
          >
            Description
          </label>
          <div
            style={{
              fontSize: 14,
              color: "var(--text-primary)",
              lineHeight: 1.6,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {event.description}
          </div>
        </div>
      )}

      {/* Tool use details */}
      {event.type === "tool_use" && event.detail && (
        <div style={{ marginBottom: 20 }}>
          {!!(event.detail.content_block as Record<string, unknown>)?.name && (
            <div style={{ marginBottom: 12 }}>
              <label
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  marginBottom: 6,
                  display: "block",
                }}
              >
                Tool Name
              </label>
              <code
                style={{
                  fontSize: 14,
                  background: "var(--bg-input)",
                  padding: "6px 10px",
                  borderRadius: 6,
                  color: config.color,
                  display: "inline-block",
                  maxWidth: "100%",
                  wordBreak: "break-all",
                  overflowWrap: "anywhere",
                }}
              >
                {(event.detail.content_block as Record<string, unknown>)
                  ?.name as string}
              </code>
            </div>
          )}
        </div>
      )}

      {/* Raw detail */}
      <div>
        <label
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 6,
            display: "block",
          }}
        >
          Raw Event Data
        </label>
        <pre
          style={{
            fontSize: 12,
            fontFamily: "monospace",
            background: "var(--bg-input)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            padding: 16,
            lineHeight: 1.5,
            color: "var(--text-secondary)",
            maxHeight: 400,
            overflowY: "auto",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify(event.detail, null, 2)}
        </pre>
      </div>
    </div>
  );
}

function formatMsStatic(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Event Timeline — horizontal waterfall showing every event as a marker
// ---------------------------------------------------------------------------

type TranscriptRole = "user" | "agent" | "interrupt" | "other";

function transcriptRoleFor(rawType: string): TranscriptRole {
  if (rawType === "user.message") return "user";
  if (rawType === "agent.message" || rawType === "agent.thinking")
    return "agent";
  if (rawType === "user.interrupt") return "interrupt";
  return "other";
}

function timelineColor(ev: ReplayEvent): string {
  const t = ev.rawType;
  if (t === "user.message") return "#F472B6"; // pink — user input
  if (t === "user.interrupt") return "#FBBF24"; // amber — interrupt
  if (t === "agent.message") return "#60A5FA"; // blue — agent reply
  if (t === "agent.thinking") return "#A78BFA"; // violet — thinking
  if (
    t === "agent.tool_use" ||
    t === "agent.mcp_tool_use" ||
    t === "agent.custom_tool_use"
  )
    return "#F59E0B"; // amber — tool use
  if (t === "agent.tool_result" || t === "agent.mcp_tool_result")
    return "#10B981"; // green — tool result
  if (t === "session.error") return "#EF4444"; // red — error
  if (t?.startsWith("span.")) return "#6B7280"; // gray — model request spans
  if (t?.startsWith("session.status_")) return "#4B5563"; // dimmer gray — status
  return "#374151";
}

function formatOffsetClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function RoleBadge({ role }: { role: TranscriptRole }) {
  const map: Record<
    TranscriptRole,
    { label: string; bg: string; color: string }
  > = {
    user: {
      label: "User",
      bg: "rgba(244, 114, 182, 0.15)",
      color: "#F472B6",
    },
    agent: {
      label: "Agent",
      bg: "rgba(96, 165, 250, 0.15)",
      color: "#60A5FA",
    },
    interrupt: {
      label: "Interrupt",
      bg: "var(--bg-badge)",
      color: "var(--text-secondary)",
    },
    other: {
      label: "Event",
      bg: "var(--bg-badge)",
      color: "var(--text-muted)",
    },
  };
  const cfg = map[role];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        width: "fit-content",
      }}
    >
      {cfg.label}
    </span>
  );
}

function EventTimeline({
  events,
  selectedIndex,
  onSelect,
  totalDurationMs,
}: {
  events: ReplayEvent[];
  selectedIndex: number;
  onSelect: (i: number) => void;
  totalDurationMs: number;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  if (events.length === 0) {
    return (
      <div
        style={{
          height: 28,
          marginBottom: 12,
          background: "var(--bg-input)",
          border: "1px solid var(--border-color)",
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text-muted)",
          fontSize: 12,
        }}
      >
        No events yet
      </div>
    );
  }

  const maxOffset = events[events.length - 1]?.offsetMs ?? totalDurationMs ?? 1;
  const denom = Math.max(1, maxOffset);
  const hoverEv = hoverIdx !== null ? events[hoverIdx] : null;
  const hoverLeftPct =
    hoverEv !== null ? (hoverEv.offsetMs / denom) * 100 : 0;

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: 28,
        marginBottom: 12,
        background: "var(--bg-input)",
        border: "1px solid var(--border-color)",
        borderRadius: 6,
      }}
    >
      {events.map((ev, i) => {
        const left = `${(ev.offsetMs / denom) * 100}%`;
        const isSel = i === selectedIndex;
        const isHover = i === hoverIdx;
        return (
          <button
            key={ev.id}
            type="button"
            onClick={() => onSelect(i)}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() =>
              setHoverIdx((prev) => (prev === i ? null : prev))
            }
            aria-label={`Jump to ${ev.rawType}`}
            style={{
              position: "absolute",
              left,
              top: isSel || isHover ? 0 : 4,
              bottom: isSel || isHover ? 0 : 4,
              width: isSel || isHover ? 5 : 3,
              padding: 0,
              border: "none",
              background: timelineColor(ev),
              opacity: isSel ? 1 : isHover ? 0.95 : 0.75,
              borderRadius: 1,
              cursor: "pointer",
              transform: "translateX(-50%)",
              outline: isSel ? "2px solid var(--accent)" : "none",
              outlineOffset: 1,
              zIndex: isSel || isHover ? 3 : 1,
            }}
          />
        );
      })}

      {/* Hover tooltip */}
      {hoverEv && (
        <div
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            left: `${hoverLeftPct}%`,
            transform: `translateX(${
              hoverLeftPct > 85 ? "-90%" : hoverLeftPct < 15 ? "-10%" : "-50%"
            })`,
            padding: "8px 10px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            fontSize: 12,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            zIndex: 10,
            pointerEvents: "none",
            maxWidth: 360,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 4,
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: 2,
                background: timelineColor(hoverEv),
              }}
            />
            <code
              style={{
                fontFamily: "monospace",
                fontSize: 11,
                color: "var(--text-secondary)",
              }}
            >
              {hoverEv.rawType}
            </code>
          </div>
          {hoverEv.description && (
            <div
              style={{
                fontSize: 12,
                color: "var(--text-primary)",
                maxWidth: 340,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {hoverEv.description}
            </div>
          )}
          <div
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginTop: 4,
              fontFamily: "monospace",
            }}
          >
            +{formatMsStatic(hoverEv.offsetMs)} ·{" "}
            {formatOffsetClock(hoverEv.offsetMs)}
          </div>
        </div>
      )}
    </div>
  );
}
