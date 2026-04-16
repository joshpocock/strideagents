"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Bot,
  Zap,
  Server,
  LayoutDashboard,
  Plus,
  MessageSquare,
  Package,
  Wrench,
  Type,
  AlertCircle,
  Clock,
  Activity,
} from "lucide-react";
import LoadingSkeleton from "@/components/LoadingSkeleton";

interface DashboardCounts {
  agents: number;
  environments: number;
  sessions: number;
}

interface ActivityEvent {
  id: string;
  sessionId: string;
  agentId: string;
  agentName: string;
  type: string;
  description: string;
  timestamp: string;
}

const statCards = [
  { key: "agents", label: "Agents", icon: Bot },
  { key: "sessions", label: "Active Sessions", icon: Zap },
  { key: "environments", label: "Environments", icon: Server },
];

const quickActions = [
  {
    label: "Create Agent",
    href: "/agents/new",
    icon: Plus,
    primary: true,
  },
  {
    label: "Start Chat",
    href: "/chat",
    icon: MessageSquare,
    primary: false,
  },
  {
    label: "New Task",
    href: "/board",
    icon: LayoutDashboard,
    primary: false,
  },
  {
    label: "Browse Templates",
    href: "/templates",
    icon: Package,
    primary: false,
  },
];

const activityTypeConfig: Record<
  string,
  { color: string; bg: string; icon: typeof Wrench }
> = {
  tool_use: { color: "#5B9BD5", bg: "rgba(91, 155, 213, 0.1)", icon: Wrench },
  text: {
    color: "var(--text-primary)",
    bg: "var(--bg-card-hover)",
    icon: Type,
  },
  error: {
    color: "var(--error)",
    bg: "rgba(239, 68, 68, 0.1)",
    icon: AlertCircle,
  },
  status: {
    color: "var(--text-secondary)",
    bg: "var(--bg-badge)",
    icon: Clock,
  },
};

export default function DashboardPage() {
  const [counts, setCounts] = useState<DashboardCounts>({
    agents: 0,
    environments: 0,
    sessions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [activityEvents, setActivityEvents] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (res.ok) {
        const data = await res.json();
        setActivityEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // Activity feed may not be available
    } finally {
      setActivityLoading(false);
    }
  }, []);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const [agentsRes, envsRes] = await Promise.all([
          fetch("/api/agents"),
          fetch("/api/environments"),
        ]);
        const agents = agentsRes.ok ? await agentsRes.json() : [];
        const envs = envsRes.ok ? await envsRes.json() : [];
        setCounts({
          agents: Array.isArray(agents) ? agents.length : 0,
          environments: Array.isArray(envs) ? envs.length : 0,
          sessions: 0,
        });
      } catch {
        // API may not be set up yet
      } finally {
        setLoading(false);
      }
    }
    fetchCounts();
    fetchActivity();
  }, [fetchActivity]);

  // Auto-refresh activity every 5 seconds
  useEffect(() => {
    const interval = setInterval(fetchActivity, 5000);
    return () => clearInterval(interval);
  }, [fetchActivity]);

  return (
    <div>
      {/* Welcome header */}
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 8,
            background: "linear-gradient(135deg, var(--text-primary), var(--accent))",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
          Manage your agents, environments, and tasks from one place.
        </p>
      </div>

      {/* Stats cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
          marginBottom: 40,
        }}
      >
        {statCards.map((stat) => {
          const Icon = stat.icon;
          const value = counts[stat.key as keyof DashboardCounts];
          return (
            <div
              key={stat.key}
              className="card"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: "var(--accent-subtle)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Icon size={22} color="var(--accent)" />
              </div>
              <div>
                {loading ? (
                  <LoadingSkeleton width={60} height={36} />
                ) : (
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      lineHeight: 1.1,
                    }}
                  >
                    {value}
                  </div>
                )}
                <div
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    marginTop: 2,
                  }}
                >
                  {stat.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick Actions */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Quick Actions
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
          marginBottom: 40,
        }}
      >
        {quickActions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              className={action.primary ? "btn-primary" : "btn-secondary"}
              style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 8,
                textDecoration: "none",
                borderRadius: 12,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              <Icon size={20} />
              <span>{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Activity Feed */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Activity size={18} color="var(--accent)" />
          Activity Feed
        </h2>
        <span
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--success)",
              display: "inline-block",
            }}
          />
          Auto-refreshing
        </span>
      </div>

      {activityLoading ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          Loading activity...
        </div>
      ) : activityEvents.length === 0 ? (
        <div
          className="card"
          style={{
            textAlign: "center",
            padding: 40,
            color: "var(--text-secondary)",
            fontSize: 14,
          }}
        >
          No recent activity to show. Create an agent and start a session to see
          activity here.
        </div>
      ) : (
        <div
          className="card"
          style={{
            padding: 0,
            overflow: "hidden",
            maxHeight: 440,
            overflowY: "auto",
          }}
        >
          {activityEvents.map((event) => {
            const config =
              activityTypeConfig[event.type] || activityTypeConfig.status;
            const Icon = config.icon;
            const timeAgo = formatTimeAgo(event.timestamp);

            return (
              <Link
                key={event.id}
                href={`/sessions/${event.sessionId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--border-color)",
                  textDecoration: "none",
                  color: "inherit",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-card-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: config.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <Icon size={15} color={config.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 2,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        color: "var(--text-primary)",
                      }}
                    >
                      {event.agentName}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: config.color,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {event.type}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {event.description}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 11,
                    color: "var(--text-muted)",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                >
                  {timeAgo}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTimeAgo(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
