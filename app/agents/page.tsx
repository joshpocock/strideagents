"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Bot } from "lucide-react";
import type { Agent } from "@/lib/types";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import SearchBar from "@/components/SearchBar";
import ShortcutHint from "@/components/ShortcutHint";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const filteredAgents = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
    );
  }, [agents, search]);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Agent[]) => setAgents(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div style={{ flex: 1, maxWidth: 400 }}>
          <SearchBar
            placeholder="Search agents by name or description..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <Link
          href="/agents/new"
          className="btn-primary"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          Create Agent
          <ShortcutHint keys="N" />
        </Link>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: 16 }}>
            <LoadingSkeleton height={20} width="30%" />
          </div>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: "12px 16px", borderTop: "1px solid var(--border-color)" }}>
              <LoadingSkeleton height={16} width={`${60 + i * 10}%`} />
            </div>
          ))}
        </div>
      ) : filteredAgents.length === 0 && !search ? (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first agent to get started with managed AI agents."
          actionLabel="Create Agent"
          actionHref="/agents/new"
        />
      ) : (
        <div
          className="card"
          style={{ padding: 0, overflow: "hidden" }}
        >
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Model</th>
                <th>Description</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredAgents.length === 0 && search && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: 32,
                    }}
                  >
                    No agents match &quot;{search}&quot;
                  </td>
                </tr>
              )}
              {filteredAgents.map((agent) => (
                <tr
                  key={agent.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    window.location.href = `/agents/${agent.id}`;
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "var(--bg-card-hover)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLTableRowElement).style.background =
                      "transparent";
                  }}
                >
                  <td style={{ fontWeight: 500 }}>{agent.name}</td>
                  <td>
                    <span
                      style={{
                        background: "var(--bg-badge)",
                        padding: "3px 8px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontFamily: "monospace",
                      }}
                    >
                      {agent.model}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-secondary)" }}>
                    {agent.description || "-"}
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {agent.created_at
                      ? new Date(agent.created_at).toLocaleDateString()
                      : "-"}
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
