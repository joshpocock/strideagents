"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Activity,
  Coins,
  Cpu,
  Zap,
  Info,
  ExternalLink,
} from "lucide-react";
import LoadingSkeleton from "@/components/LoadingSkeleton";

interface AnalyticsData {
  stats: {
    total_sessions: number;
    active_sessions: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
  };
  daily_usage: Array<{
    date: string;
    input_tokens: number;
    output_tokens: number;
    sessions: number;
  }>;
  model_breakdown: Array<{
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    count: number;
  }>;
  activity_grid: Array<{
    date: string;
    count: number;
  }>;
  recent_sessions: Array<{
    id: string;
    agent_id: string;
    status: string;
    model: string;
    created_at: string;
    input_tokens: number;
    output_tokens: number;
    cost: number;
    duration_minutes: number;
  }>;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const statusColors: Record<string, { bg: string; color: string }> = {
  completed: { bg: "rgba(34, 197, 94, 0.1)", color: "var(--success)" },
  ended: { bg: "rgba(34, 197, 94, 0.1)", color: "var(--success)" },
  running: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  active: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  awaiting_input: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  failed: { bg: "rgba(239, 68, 68, 0.1)", color: "var(--error)" },
};

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then(async (r) => {
        if (!r.ok) {
          const err = await r.json();
          throw new Error(err.error || "Failed to load analytics");
        }
        return r.json();
      })
      .then((d: AnalyticsData) => setData(d))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, display: "flex", alignItems: "center", gap: 10 }}>
            <BarChart3 size={24} color="var(--accent)" />
            Analytics
          </h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="card">
              <LoadingSkeleton height={14} width="50%" />
              <div style={{ marginTop: 8 }}>
                <LoadingSkeleton height={28} width="60%" />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <LoadingSkeleton height={200} />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart3 size={24} color="var(--accent)" />
          Analytics
        </h1>
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <p style={{ color: "var(--text-secondary)" }}>{error || "No data available"}</p>
        </div>
      </div>
    );
  }

  const totalTokens = data.stats.total_input_tokens + data.stats.total_output_tokens;

  // Calculate max for bar chart
  const maxDailyTokens = Math.max(
    1,
    ...data.daily_usage.map((d) => d.input_tokens + d.output_tokens)
  );

  // Calculate max cost for model breakdown
  const maxModelCost = Math.max(1, ...data.model_breakdown.map((m) => m.cost));

  // Calculate max for activity grid
  const maxActivityCount = Math.max(1, ...data.activity_grid.map((a) => a.count));

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4, display: "flex", alignItems: "center", gap: 10 }}>
          <BarChart3 size={24} color="var(--accent)" />
          Analytics
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Usage and cost data from your managed agent sessions.
        </p>
      </div>

      {/* Admin API callout */}
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
          For organization-wide analytics, use the Anthropic Admin API with an admin key (sk-ant-admin...).
          This dashboard shows data from session-level access.
        </p>
      </div>

      {/* Stats Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          icon={Activity}
          label="Total Sessions"
          value={data.stats.total_sessions.toString()}
        />
        <StatCard
          icon={Zap}
          label="Active Sessions"
          value={data.stats.active_sessions.toString()}
          valueColor={data.stats.active_sessions > 0 ? "var(--success)" : undefined}
        />
        <StatCard
          icon={Cpu}
          label="Total Tokens"
          value={formatTokens(totalTokens)}
        />
        <StatCard
          icon={Coins}
          label="Estimated Cost"
          value={`$${data.stats.total_cost.toFixed(4)}`}
          valueColor="var(--accent)"
        />
      </div>

      {/* Charts Row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {/* Token Usage Over Time */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
            Token Usage (Last 7 Days)
          </h3>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: 8,
              height: 180,
              paddingTop: 8,
            }}
          >
            {data.daily_usage.map((day) => {
              const total = day.input_tokens + day.output_tokens;
              const heightPct = maxDailyTokens > 0 ? (total / maxDailyTokens) * 100 : 0;
              return (
                <div
                  key={day.date}
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  {/* Token count label */}
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      fontFamily: "monospace",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {total > 0 ? formatTokens(total) : ""}
                  </span>
                  {/* Bar */}
                  <div
                    style={{
                      width: "100%",
                      maxWidth: 48,
                      height: `${Math.max(heightPct, 2)}%`,
                      background: total > 0
                        ? "linear-gradient(to top, var(--accent-muted), var(--accent))"
                        : "var(--bg-badge)",
                      borderRadius: "4px 4px 0 0",
                      transition: "height 0.3s ease",
                      minHeight: 4,
                    }}
                  />
                  {/* Date label */}
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatDate(day.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Cost Breakdown by Model */}
        <div className="card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
            Cost by Model
          </h3>
          {data.model_breakdown.length === 0 ? (
            <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No model data available</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {data.model_breakdown.map((m) => {
                const widthPct = maxModelCost > 0 ? (m.cost / maxModelCost) * 100 : 0;
                return (
                  <div key={m.model}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--text-primary)" }}>
                        {m.model}
                      </span>
                      <span style={{ fontSize: 12, fontFamily: "monospace", color: "var(--accent)" }}>
                        ${m.cost.toFixed(4)}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 8,
                        background: "var(--bg-badge)",
                        borderRadius: 4,
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${Math.max(widthPct, 2)}%`,
                          height: "100%",
                          background: "var(--accent)",
                          borderRadius: 4,
                          transition: "width 0.3s ease",
                        }}
                      />
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {m.count} session{m.count !== 1 ? "s" : ""} / {formatTokens(m.input_tokens + m.output_tokens)} tokens
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Activity Grid */}
      <div className="card" style={{ padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, color: "var(--text-secondary)" }}>
          Session Activity (Last 30 Days)
        </h3>
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
          {data.activity_grid.map((day) => {
            const intensity = maxActivityCount > 0 ? day.count / maxActivityCount : 0;
            let bg = "var(--bg-badge)";
            if (day.count > 0) {
              if (intensity > 0.75) bg = "var(--accent)";
              else if (intensity > 0.5) bg = "var(--accent-hover)";
              else if (intensity > 0.25) bg = "var(--accent-muted)";
              else bg = "var(--accent-subtle)";
            }
            return (
              <div
                key={day.date}
                title={`${day.date}: ${day.count} session${day.count !== 1 ? "s" : ""}`}
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 3,
                  background: bg,
                  border: day.count > 0 ? "none" : "1px solid var(--border-color)",
                  cursor: "default",
                  transition: "background 0.2s ease",
                }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>
          <span>Less</span>
          {[
            "var(--bg-badge)",
            "var(--accent-subtle)",
            "var(--accent-muted)",
            "var(--accent-hover)",
            "var(--accent)",
          ].map((color, i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                background: color,
                border: i === 0 ? "1px solid var(--border-color)" : "none",
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border-color)" }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)", margin: 0 }}>
            Recent Sessions
          </h3>
        </div>
        {data.recent_sessions.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            No sessions found
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Status</th>
                <th>Model</th>
                <th>Duration</th>
                <th>Tokens</th>
                <th>Cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.recent_sessions.map((session) => {
                const statusStyle = statusColors[session.status] || statusColors.completed;
                return (
                  <tr
                    key={session.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => { window.location.href = `/sessions/${session.id}`; }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--bg-card-hover)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "transparent"; }}
                  >
                    <td>
                      <code style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {session.id.substring(0, 16)}...
                      </code>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: 10,
                          background: statusStyle.bg,
                          color: statusStyle.color,
                          textTransform: "uppercase",
                        }}
                      >
                        {session.status}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: 12, fontFamily: "monospace", background: "var(--bg-badge)", padding: "2px 6px", borderRadius: 4 }}>
                        {session.model}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                      {session.duration_minutes}m
                    </td>
                    <td style={{ fontSize: 13, fontFamily: "monospace" }}>
                      {formatTokens(session.input_tokens + session.output_tokens)}
                    </td>
                    <td style={{ fontSize: 13, fontFamily: "monospace", color: "var(--accent)" }}>
                      ${session.cost.toFixed(4)}
                    </td>
                    <td>
                      <Link
                        href={`/sessions/${session.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 12,
                          color: "var(--accent)",
                          textDecoration: "none",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={12} />
                        Trace
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat Card component
// ---------------------------------------------------------------------------

function StatCard({
  icon: Icon,
  label,
  value,
  valueColor,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={16} color="var(--accent)" />
        </div>
        <span style={{ fontSize: 12, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {label}
        </span>
      </div>
      <div
        style={{
          fontSize: 24,
          fontWeight: 700,
          fontFamily: "monospace",
          color: valueColor || "var(--text-primary)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
