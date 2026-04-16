"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Server } from "lucide-react";
import type { Environment } from "@/lib/types";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";

export default function EnvironmentsPage() {
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/environments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Environment[]) => setEnvironments(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <Link
          href="/environments/new"
          className="btn-primary"
          style={{ textDecoration: "none" }}
        >
          Create Environment
        </Link>
      </div>

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
      ) : environments.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No environments yet"
          description="Create one to provide sandboxed execution for your agents."
          actionLabel="Create Environment"
          actionHref="/environments/new"
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
                <th>Setup Commands</th>
                <th>Network</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {environments.map((env) => (
                <tr key={env.id}>
                  <td style={{ fontWeight: 500 }}>{env.name}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: 13 }}>
                    {env.setup_commands && env.setup_commands.length > 0
                      ? `${env.setup_commands.length} command${env.setup_commands.length > 1 ? "s" : ""}`
                      : "-"}
                  </td>
                  <td>
                    <span
                      style={{
                        color: env.network_access ? "var(--success)" : "var(--text-muted)",
                        fontSize: 13,
                      }}
                    >
                      {env.network_access ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {env.created_at
                      ? new Date(env.created_at).toLocaleDateString()
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
