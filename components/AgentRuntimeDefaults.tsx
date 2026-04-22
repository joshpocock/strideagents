"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Lock, Plus, Save, Trash2 } from "lucide-react";

/**
 * Unified "Runtime defaults" panel for an agent. Combines the two things
 * every session-creation path needs:
 *
 *   1. Default environment_id — the sandbox sessions start in.
 *   2. Default vault attachments — credentials injected at session time.
 *
 * Both are optional; overrides can still be passed per request (chat UI,
 * board task, /api/agents/:id/trigger body, etc.). These are purely the
 * baseline so users don't pick them every time.
 */

interface AttachedVault {
  id: string;
  name?: string;
  error?: string;
}

interface VaultOption {
  id: string;
  name?: string;
  description?: string;
}

interface EnvOption {
  id: string;
  name?: string;
}

interface Props {
  agentId: string;
  mcpServers?: Array<{ name?: string; url?: string }>;
}

export default function AgentRuntimeDefaults({ agentId, mcpServers }: Props) {
  const [envs, setEnvs] = useState<EnvOption[]>([]);
  const [defaultEnv, setDefaultEnv] = useState<string>("");
  const [savingEnv, setSavingEnv] = useState(false);
  const [attached, setAttached] = useState<AttachedVault[]>([]);
  const [available, setAvailable] = useState<VaultOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const loadEnvs = () =>
    fetch("/api/environments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setEnvs(list.map((e: any) => ({ id: e.id, name: e.name })));
      })
      .catch(() => {});

  const loadDefaults = () =>
    fetch(`/api/agents/${agentId}/defaults`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: any) => {
        if (data?.environment_id) setDefaultEnv(data.environment_id);
      })
      .catch(() => {});

  const loadAttached = () =>
    fetch(`/api/agents/${agentId}/vaults`)
      .then((r) => (r.ok ? r.json() : { vaults: [] }))
      .then((data) => {
        if (Array.isArray(data.vaults)) setAttached(data.vaults);
      })
      .catch(() => {});

  const loadAvailable = () =>
    fetch("/api/vaults")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setAvailable(
          list.map((v: any) => ({
            id: v.id,
            name: v.name,
            description: v.description,
          }))
        );
      })
      .catch(() => {});

  useEffect(() => {
    Promise.all([loadEnvs(), loadDefaults(), loadAttached(), loadAvailable()]).finally(
      () => setLoading(false)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const saveEnv = async (envId: string) => {
    setSavingEnv(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/defaults`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment_id: envId || null }),
      });
      if (res.ok) {
        setStatus(envId ? "Default environment saved." : "Default environment cleared.");
      } else {
        setStatus("Failed to save default environment.");
      }
    } finally {
      setSavingEnv(false);
    }
  };

  const attachVault = async (vaultId: string) => {
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/vaults`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vault_id: vaultId }),
      });
      if (res.ok) {
        await loadAttached();
        setStatus("Vault attached.");
      } else {
        setStatus("Attach failed.");
      }
    } finally {
      setBusy(false);
    }
  };

  const detachVault = async (vaultId: string) => {
    setBusy(true);
    setStatus(null);
    try {
      await fetch(`/api/agents/${agentId}/vaults/${vaultId}`, {
        method: "DELETE",
      });
      await loadAttached();
    } finally {
      setBusy(false);
    }
  };

  const attachedIds = new Set(attached.map((v) => v.id));
  const unattached = available.filter((v) => !attachedIds.has(v.id));
  const hasMcp = (mcpServers ?? []).some((s) => s.url?.trim());
  const mcpWithoutVault = hasMcp && attached.length === 0;

  return (
    <div>
      <p
        style={{
          fontSize: 13,
          color: "var(--text-secondary)",
          margin: "0 0 16px",
          lineHeight: 1.5,
        }}
      >
        When this app starts a session for this agent (chat, board, manual{" "}
        <code>Run now</code>, scheduled fire), it uses these defaults. Every
        caller can still override per-request — these are just the baseline.
      </p>

      {/* Environment */}
      <div style={{ marginBottom: 22 }}>
        <label style={labelStyle}>Default environment</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          {envs.length > 0 ? (
            <select
              value={defaultEnv}
              onChange={(e) => {
                setDefaultEnv(e.target.value);
                saveEnv(e.target.value);
              }}
              disabled={savingEnv}
              style={{ ...inputStyle, minWidth: 280 }}
            >
              <option value="">— no default —</option>
              {envs.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.name ? `${env.name} (${env.id})` : env.id}
                </option>
              ))}
            </select>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
              No environments yet.{" "}
              <a href="/environments/new" style={{ color: "var(--accent)" }}>
                Create one
              </a>
              .
            </p>
          )}
          {defaultEnv && (
            <button
              onClick={() => {
                setDefaultEnv("");
                saveEnv("");
              }}
              className="btn-secondary"
              style={{ padding: "6px 10px", fontSize: 12 }}
              title="Clear default"
            >
              Clear
            </button>
          )}
        </div>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "6px 0 0" }}>
          Sessions that don't supply <code>environment_id</code> will use this one.
        </p>
      </div>

      {/* Vaults */}
      <div>
        <label style={labelStyle}>Default vaults (credentials)</label>

        {mcpWithoutVault && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(217, 119, 6, 0.08)",
              border: "1px solid rgba(217, 119, 6, 0.3)",
              marginBottom: 12,
              fontSize: 12,
              color: "var(--text-secondary)",
            }}
          >
            <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              This agent has MCP servers configured, but no vaults are
              attached here. Sessions started from this app won't forward any
              bearer tokens or API keys your MCPs need. (Sessions started from{" "}
              <em>Anthropic Console</em> will still work — those pick vaults
              at session time.)
            </span>
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Loading…</p>
        ) : (
          <>
            {/* Attached */}
            {attached.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                {attached.map((v) => (
                  <div
                    key={v.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 8,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <Lock size={13} color="var(--accent)" />
                      <span style={{ fontWeight: 500 }}>{v.name || v.id}</span>
                      <code
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          background: "var(--bg-badge)",
                          padding: "1px 6px",
                          borderRadius: 4,
                        }}
                      >
                        {v.id}
                      </code>
                      {v.error && (
                        <span style={{ color: "var(--error)", fontSize: 11 }} title={v.error}>
                          unreachable
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => detachVault(v.id)}
                      disabled={busy}
                      className="btn-secondary"
                      style={{
                        padding: "4px 8px",
                        fontSize: 12,
                        color: "var(--error)",
                        borderColor: "var(--error)",
                      }}
                      title="Detach vault"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Available */}
            {unattached.length === 0 ? (
              attached.length === 0 && (
                <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
                  {available.length === 0 ? (
                    <>
                      No vaults exist yet. Create one at{" "}
                      <a href="/vaults" style={{ color: "var(--accent)" }}>
                        /vaults
                      </a>
                      .
                    </>
                  ) : (
                    "All vaults already attached."
                  )}
                </p>
              )
            ) : (
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    color: "var(--text-muted)",
                    marginBottom: 6,
                  }}
                >
                  Available to attach
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {unattached.map((v) => (
                    <div
                      key={v.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 12px",
                        background: "var(--bg-input)",
                        borderRadius: 8,
                        fontSize: 13,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <Lock size={13} color="var(--text-muted)" />
                        <span>{v.name || v.id}</span>
                        <code
                          style={{
                            fontSize: 11,
                            color: "var(--text-muted)",
                            background: "var(--bg-badge)",
                            padding: "1px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {v.id}
                        </code>
                      </div>
                      <button
                        onClick={() => attachVault(v.id)}
                        disabled={busy}
                        className="btn-secondary"
                        style={{
                          padding: "4px 10px",
                          fontSize: 12,
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        <Plus size={12} />
                        Attach
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {status && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            marginTop: 14,
            padding: "8px 12px",
            background: "var(--bg-input)",
            borderRadius: 6,
          }}
        >
          {status}
        </p>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  padding: "10px 12px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};
