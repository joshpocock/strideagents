"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import {
  History,
  Search,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  Loader,
  Bot,
  ChevronRight,
} from "lucide-react";
import EmptyState from "@/components/EmptyState";

interface SessionRow {
  id: string;
  agent_id: string;
  agentName: string;
  status: string;
  created_at: string;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [agents, setAgents] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    async function load() {
      try {
        const [sessionsRes, agentsRes] = await Promise.all([
          fetch("/api/sessions"),
          fetch("/api/agents"),
        ]);

        // Build agent name map
        const agentsData = agentsRes.ok ? await agentsRes.json() : [];
        const agentList = Array.isArray(agentsData)
          ? agentsData
          : agentsData.data || [];
        const agentMap: Record<string, string> = {};
        for (const a of agentList) {
          agentMap[a.id] = a.name || "Unnamed";
        }
        setAgents(agentMap);

        // Process sessions
        const sessionsData = sessionsRes.ok ? await sessionsRes.json() : [];
        const sessionList = Array.isArray(sessionsData)
          ? sessionsData
          : sessionsData.data || [];

        const rows: SessionRow[] = sessionList.map(
          (s: Record<string, unknown>) => ({
            id: s.id as string,
            agent_id: s.agent_id as string,
            agentName: agentMap[(s.agent_id as string)] || "Unknown Agent",
            status: (s.status as string) || "unknown",
            created_at: (s.created_at as string) || "",
          })
        );

        setSessions(rows);
      } catch {
        // API may not be ready
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.id.toLowerCase().includes(q) ||
          s.agentName.toLowerCase().includes(q) ||
          s.status.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sessions, statusFilter, searchQuery]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: sessions.length };
    for (const s of sessions) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    return counts;
  }, [sessions]);

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle size={14} color="var(--success)" />;
      case "failed":
        return <AlertCircle size={14} color="var(--error)" />;
      case "running":
      case "active":
        return <Loader size={14} color="var(--accent)" />;
      default:
        return <Clock size={14} color="var(--text-muted)" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "var(--success)";
      case "failed":
        return "var(--error)";
      case "running":
      case "active":
        return "var(--accent)";
      default:
        return "var(--text-secondary)";
    }
  };

  const formatDate = (iso: string) => {
    if (!iso) return "--";
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statusFilters = [
    "all",
    "completed",
    "running",
    "active",
    "failed",
    "unknown",
  ].filter((s) => s === "all" || (statusCounts[s] || 0) > 0);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
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
          <History size={24} color="var(--accent)" />
          Sessions
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          View and replay all agent sessions.
        </p>
      </div>

      {/* Filters */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div style={{ position: "relative", flex: 1, maxWidth: 320 }}>
          <Search
            size={16}
            style={{
              position: "absolute",
              left: 10,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-muted)",
              pointerEvents: "none",
            }}
          />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by session ID, agent name..."
            style={{
              width: "100%",
              padding: "8px 10px 8px 34px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              color: "var(--text-primary)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {statusFilters.map((sf) => (
            <button
              key={sf}
              onClick={() => setStatusFilter(sf)}
              style={{
                padding: "5px 10px",
                fontSize: 12,
                fontWeight: statusFilter === sf ? 600 : 400,
                color:
                  statusFilter === sf
                    ? "var(--accent)"
                    : "var(--text-secondary)",
                background:
                  statusFilter === sf
                    ? "var(--accent-subtle)"
                    : "transparent",
                border:
                  statusFilter === sf
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
                borderRadius: 6,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {sf}
              {statusCounts[sf] !== undefined && (
                <span
                  style={{
                    marginLeft: 4,
                    opacity: 0.6,
                  }}
                >
                  ({statusCounts[sf]})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          Loading sessions...
        </div>
      ) : filteredSessions.length === 0 ? (
        <EmptyState
          icon={History}
          title="No sessions found"
          description="Sessions will appear here when agents are run. Start a chat or create a task to begin."
          actionLabel="Start Chat"
          actionHref="/chat"
        />
      ) : (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
        >
          <table>
            <thead>
              <tr
                style={{
                  background: "var(--bg-input)",
                }}
              >
                <th>Session ID</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Created</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => (
                <tr
                  key={session.id}
                  style={{
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--bg-card-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                  onClick={() => {
                    window.location.href = `/sessions/${session.id}`;
                  }}
                >
                  <td>
                    <code
                      style={{
                        fontSize: 12,
                        background: "var(--bg-input)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        color: "var(--text-primary)",
                      }}
                    >
                      {session.id.substring(0, 20)}...
                    </code>
                  </td>
                  <td>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      <Bot size={14} color="var(--text-secondary)" />
                      <span style={{ fontSize: 13 }}>
                        {session.agentName}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        color: statusColor(session.status),
                        background:
                          session.status === "completed"
                            ? "rgba(34, 197, 94, 0.1)"
                            : session.status === "failed"
                              ? "rgba(239, 68, 68, 0.1)"
                              : "var(--bg-badge)",
                        padding: "3px 10px",
                        borderRadius: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {statusIcon(session.status)}
                      {session.status}
                    </div>
                  </td>
                  <td
                    style={{
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {formatDate(session.created_at)}
                  </td>
                  <td>
                    <ChevronRight
                      size={16}
                      color="var(--text-muted)"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
