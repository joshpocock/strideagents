"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Copy,
  MoreHorizontal,
  Pencil,
  Copy as CopyIcon,
  Trash2,
  Archive,
  ChevronDown,
  Sparkles,
  Wrench,
  Check,
  Shield,
  ShieldQuestion,
  Cpu,
  FileText,
  LayoutDashboard,
} from "lucide-react";
import type { Agent } from "@/lib/types";
import { getModelId } from "@/lib/types";
import AgentEditor, { type AgentConfig } from "@/components/AgentEditor";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import TunnelBanner from "@/components/TunnelBanner";
import AgentScheduleSection from "@/components/AgentScheduleSection";
import AgentRuntimeDefaults from "@/components/AgentRuntimeDefaults";
import { useToast } from "@/components/Toast";

interface AgentVersion extends Agent {
  version?: number;
}

interface SessionRow {
  id: string;
  status?: string;
  created_at?: string;
  archived_at?: string | null;
  agent?: { id?: string; version?: number };
  metadata?: Record<string, string>;
  [key: string]: unknown;
}

const BUILT_IN_TOOL_COUNT = 8;
const BUILT_IN_TOOL_NAMES = [
  "bash",
  "read",
  "write",
  "edit",
  "glob",
  "grep",
  "web_fetch",
  "web_search",
];

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;
  const { showToast } = useToast();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [tab, setTab] = useState<"agent" | "sessions">("agent");
  const [menuOpen, setMenuOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);

  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);

  // Load agent + versions
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [agentRes, versionsRes] = await Promise.all([
          fetch(`/api/agents/${agentId}`),
          fetch(`/api/agents/${agentId}/versions`),
        ]);
        if (cancelled) return;

        if (agentRes.ok) {
          const data = await agentRes.json();
          setAgent(data);
        }
        if (versionsRes.ok) {
          const data = await versionsRes.json();
          const list = Array.isArray(data) ? (data as AgentVersion[]) : [];
          setVersions(list);
          if (list.length > 0 && selectedVersion === null) {
            setSelectedVersion(list[0].version ?? 1);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId]);

  const displayed = useMemo(() => {
    if (!agent) return null;
    if (selectedVersion !== null) {
      const match = versions.find((v) => v.version === selectedVersion);
      if (match) return match;
    }
    return agent;
  }, [agent, versions, selectedVersion]);

  const handleUpdate = async (config: AgentConfig) => {
    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (res.ok) {
      const updated = await res.json();
      setAgent(updated);
      setEditing(false);
      // Refresh versions too
      fetch(`/api/agents/${agentId}/versions`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => {
          if (Array.isArray(data)) {
            setVersions(data);
            if (data[0]?.version) setSelectedVersion(data[0].version);
          }
        })
        .catch(() => {});
      showToast("Agent updated", "success");
    } else {
      const err = await res.text();
      showToast(`Failed to update: ${err}`, "error");
    }
  };

  const handleClone = async () => {
    if (!agent) return;
    setMenuOpen(false);
    setCloning(true);
    try {
      const body = {
        name: `${agent.name} (Copy)`,
        model: getModelId(agent.model),
        ...(agent.description && { description: agent.description }),
        ...(agent.system && { system: agent.system }),
        ...(agent.tools && { tools: agent.tools }),
        ...(agent.mcp_servers && { mcp_servers: agent.mcp_servers }),
      };
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const newAgent = await res.json();
        showToast("Agent cloned", "success");
        router.push(`/agents/${newAgent.id}`);
      } else {
        const err = await res.text();
        showToast(`Failed to clone: ${err}`, "error");
      }
    } catch {
      showToast("Failed to clone agent", "error");
    } finally {
      setCloning(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/agents");
      } else {
        showToast("Failed to delete agent", "error");
      }
    } finally {
      setDeleting(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
    showToast("Copied", "success");
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 960 }}>
        <LoadingSkeleton height={32} width="40%" />
        <div className="card" style={{ marginTop: 24, padding: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                padding: "12px 0",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <LoadingSkeleton height={16} width={`${50 + i * 10}%`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!agent || !displayed) {
    return <p style={{ color: "var(--text-secondary)" }}>Agent not found.</p>;
  }

  const archived = Boolean((agent as { archived_at?: string }).archived_at);

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Breadcrumb */}
      <div
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          marginBottom: 14,
        }}
      >
        <Link
          href="/agents"
          style={{ color: "var(--text-muted)", textDecoration: "none" }}
        >
          Agents
        </Link>
        <span style={{ margin: "0 6px" }}>/</span>
        <span style={{ color: "var(--text-primary)" }}>{agent.name}</span>
      </div>

      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 6,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 6,
            }}
          >
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>
              {agent.name}
            </h1>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 10px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 500,
                color: archived ? "var(--text-muted)" : "var(--success)",
                background: archived
                  ? "var(--bg-badge)"
                  : "rgba(34, 197, 94, 0.1)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: archived
                    ? "var(--text-muted)"
                    : "var(--success)",
                }}
              />
              {archived ? "Archived" : "Active"}
            </span>
          </div>

          <div
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <code
              style={{
                fontFamily: "monospace",
                color: "var(--text-secondary)",
              }}
            >
              {agent.id}
            </code>
            <button
              type="button"
              onClick={() => copy(agent.id)}
              aria-label="Copy ID"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 22,
                height: 22,
                background: "transparent",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                borderRadius: 4,
              }}
              title="Copy ID"
            >
              <Copy size={12} />
            </button>
            {agent.updated_at && (
              <span>
                · Last updated {formatRelative(agent.updated_at)}
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link
            href={`/board?add=1&agent=${agentId}`}
            className="btn-secondary"
            style={{
              padding: "8px 14px",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
            }}
          >
            <LayoutDashboard size={14} />
            New task
          </Link>
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary"
            style={{
              padding: "8px 14px",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Pencil size={14} />
            Edit
          </button>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              onBlur={() => setTimeout(() => setMenuOpen(false), 120)}
              aria-label="More actions"
              className="btn-secondary"
              style={{
                width: 36,
                height: 36,
                padding: 0,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <MoreHorizontal size={16} />
            </button>
            {menuOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  minWidth: 180,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
                  padding: 4,
                  zIndex: 40,
                }}
              >
                <MenuItem
                  icon={<CopyIcon size={14} />}
                  label={cloning ? "Cloning..." : "Clone"}
                  onClick={handleClone}
                />
                <MenuItem
                  icon={<Trash2 size={14} />}
                  label="Delete"
                  danger
                  onClick={() => {
                    setMenuOpen(false);
                    setDeleteConfirm(true);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginTop: 24,
          marginBottom: 20,
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        {(
          [
            { key: "agent" as const, label: "Agent" },
            { key: "sessions" as const, label: "Sessions" },
          ]
        ).map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: "10px 16px",
                fontSize: 14,
                fontWeight: active ? 600 : 400,
                color: active ? "var(--text-primary)" : "var(--text-secondary)",
                background: "transparent",
                border: "none",
                borderBottom: active
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "agent" && (
        <AgentTab
          displayed={displayed}
          versions={versions}
          selectedVersion={selectedVersion}
          onSelectVersion={setSelectedVersion}
          versionOpen={versionOpen}
          onVersionOpenChange={setVersionOpen}
          onCopy={copy}
          agentId={agentId}
        />
      )}

      {tab === "sessions" && (
        <SessionsTab
          agentId={agentId}
          versions={versions}
          selectedVersion={selectedVersion}
        />
      )}

      {/* Edit modal */}
      <Modal
        open={editing}
        onClose={() => setEditing(false)}
        title="Edit agent"
        maxWidth={1100}
      >
        <AgentEditor
          initialData={displayed}
          onSubmit={handleUpdate}
          submitLabel="Save new version"
          agentId={agentId}
        />
      </Modal>

      {/* Delete modal */}
      <Modal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete agent"
      >
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Are you sure you want to delete <strong>{agent.name}</strong>? This
          action cannot be undone.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setDeleteConfirm(false)}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              background: "var(--error)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              opacity: deleting ? 0.6 : 1,
              cursor: "pointer",
            }}
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Agent tab
// ---------------------------------------------------------------------------

function AgentTab({
  displayed,
  versions,
  selectedVersion,
  onSelectVersion,
  versionOpen,
  onVersionOpenChange,
  onCopy,
  agentId,
}: {
  displayed: Agent;
  versions: AgentVersion[];
  selectedVersion: number | null;
  onSelectVersion: (v: number) => void;
  versionOpen: boolean;
  onVersionOpenChange: (open: boolean) => void;
  onCopy: (text: string) => void;
  agentId: string;
}) {
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Array<{ type: string; skill_id: string; version?: string; display_title?: string }>>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [environments, setEnvironments] = useState<Array<{ id: string; name?: string }>>([]);

  // Routines state
  const [connectedRoutines, setConnectedRoutines] = useState<Array<{
    id: number; routine_id: number; tool_name: string; routine_name: string;
    routine_description: string | null; routine_api_id: string;
  }>>([]);
  const [allRoutines, setAllRoutines] = useState<Array<{ id: number; name: string; description: string | null }>>([]);
  const [routinesLoading, setRoutinesLoading] = useState(true);
  const [selectedRoutineId, setSelectedRoutineId] = useState("");
  const [connectingRoutine, setConnectingRoutine] = useState(false);

  useEffect(() => {
    // Fetch skills
    fetch(`/api/skills/attach?agent_id=${agentId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setSkills(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setSkillsLoading(false));

    // Environments — used by the Schedule section's dropdown.
    fetch("/api/environments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.data ?? [];
        setEnvironments(
          list.map((e: any) => ({ id: e.id, name: e.name }))
        );
      })
      .catch(() => {});

    // Fetch connected routines + all routines
    Promise.all([
      fetch(`/api/agents/${agentId}/routines`).then((r) => (r.ok ? r.json() : [])),
      fetch("/api/routines").then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([connected, all]) => {
        setConnectedRoutines(Array.isArray(connected) ? connected : []);
        const routinesList = Array.isArray(all) ? all : all?.routines ?? [];
        setAllRoutines(routinesList);
      })
      .catch(() => {})
      .finally(() => setRoutinesLoading(false));
  }, [agentId]);

  const handleDetachSkill = async (skillId: string) => {
    try {
      const res = await fetch("/api/skills/attach", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentId, skill_id: skillId }),
      });
      if (res.ok) {
        setSkills((prev) => prev.filter((s) => s.skill_id !== skillId));
        showToast("Skill detached", "success");
      } else {
        showToast("Failed to detach skill", "error");
      }
    } catch {
      showToast("Failed to detach skill", "error");
    }
  };

  const handleConnectRoutine = async () => {
    if (!selectedRoutineId) return;
    setConnectingRoutine(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/routines`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine_id: Number(selectedRoutineId) }),
      });
      if (res.ok) {
        // Refresh connected routines
        const refreshRes = await fetch(`/api/agents/${agentId}/routines`);
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          setConnectedRoutines(Array.isArray(data) ? data : []);
        }
        setSelectedRoutineId("");
        showToast("Routine connected", "success");
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to connect routine", "error");
      }
    } catch {
      showToast("Failed to connect routine", "error");
    } finally {
      setConnectingRoutine(false);
    }
  };

  const handleDisconnectRoutine = async (routineId: number) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/routines`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routine_id: routineId }),
      });
      if (res.ok) {
        setConnectedRoutines((prev) =>
          prev.filter((r) => r.routine_id !== routineId)
        );
        showToast("Routine disconnected", "success");
      } else {
        showToast("Failed to disconnect routine", "error");
      }
    } catch {
      showToast("Failed to disconnect routine", "error");
    }
  };

  const connectedRoutineIds = new Set(connectedRoutines.map((r) => r.routine_id));
  const availableRoutines = allRoutines.filter((r) => !connectedRoutineIds.has(r.id));

  const tool = displayed.tools?.[0] as unknown as
    | {
        type?: string;
        default_config?: {
          enabled?: boolean;
          permission_policy?: { type?: string };
        };
        configs?: Array<{
          name: string;
          enabled?: boolean;
          permission_policy?: { type?: string };
        }>;
      }
    | undefined;

  const toolsetType = tool?.type ?? "—";
  const defaultEnabled = tool?.default_config?.enabled ?? true;
  const defaultPolicy = tool?.default_config?.permission_policy?.type ?? "always_allow";

  // Build a resolved view of all 8 built-in tools
  const resolvedTools = BUILT_IN_TOOL_NAMES.map((name) => {
    const override = tool?.configs?.find((c) => c.name === name);
    return {
      name,
      enabled: override?.enabled ?? defaultEnabled,
      policy: override?.permission_policy?.type ?? defaultPolicy,
    };
  });

  const enabledToolCount = resolvedTools.filter((t) => t.enabled).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Version selector */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => onVersionOpenChange(!versionOpen)}
          onBlur={() => setTimeout(() => onVersionOpenChange(false), 120)}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            color: "var(--text-primary)",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          <span>
            <span style={{ color: "var(--text-secondary)" }}>Version:</span>{" "}
            <strong>v{selectedVersion ?? "?"}</strong>
          </span>
          <ChevronDown size={16} color="var(--text-secondary)" />
        </button>
        {versionOpen && versions.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              maxHeight: 240,
              overflowY: "auto",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
              padding: 4,
              zIndex: 40,
            }}
          >
            <div
              style={{
                padding: "8px 12px",
                fontSize: 11,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              {versions[0]?.version === selectedVersion
                ? "Current version"
                : "Versions"}
            </div>
            {versions.map((v) => {
              const version = v.version ?? 1;
              const active = version === selectedVersion;
              return (
                <button
                  key={version}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelectVersion(version);
                    onVersionOpenChange(false);
                  }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "9px 12px",
                    background: active ? "var(--accent-subtle)" : "transparent",
                    border: "none",
                    borderRadius: 6,
                    color: "var(--text-primary)",
                    fontSize: 13,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span>
                    <strong>v{version}</strong>
                    {v.created_at && (
                      <span
                        style={{
                          marginLeft: 10,
                          fontSize: 12,
                          color: "var(--text-muted)",
                        }}
                      >
                        Created {formatDate(v.created_at)}
                      </span>
                    )}
                  </span>
                  {active && <Check size={14} color="var(--accent)" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Model */}
      <Section title="Model">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Cpu size={14} color="var(--text-secondary)" />
          <code style={{ fontFamily: "monospace", fontSize: 14 }}>
            {getModelId(displayed.model)}
          </code>
          {typeof displayed.model === "object" &&
            (displayed.model as { speed?: string })?.speed && (
              <span
                style={{
                  fontSize: 11,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "var(--bg-badge)",
                  color: "var(--text-secondary)",
                  textTransform: "capitalize",
                }}
              >
                {(displayed.model as { speed?: string }).speed}
              </span>
            )}
        </div>
      </Section>

      {/* System prompt */}
      <Section
        title="System prompt"
        actions={
          displayed.system ? (
            <button
              type="button"
              onClick={() => onCopy(displayed.system || "")}
              className="btn-secondary"
              style={{
                padding: "4px 10px",
                fontSize: 12,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Copy size={12} />
              Copy
            </button>
          ) : null
        }
      >
        {displayed.system ? (
          <pre
            style={{
              margin: 0,
              padding: 16,
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: 8,
              color: "var(--text-primary)",
              fontFamily: "monospace",
              fontSize: 13,
              lineHeight: 1.55,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {displayed.system}
          </pre>
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            None
          </p>
        )}
      </Section>

      {/* MCPs and tools */}
      <Section title="MCPs and tools">
        {displayed.tools && displayed.tools.length > 0 ? (
          <div
            style={{
              border: "1px solid var(--border-color)",
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
                background: "var(--bg-card)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "var(--bg-input)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Wrench size={16} color="var(--text-secondary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    Built-in tools
                  </div>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {toolsetType}
                  </code>
                </div>
              </div>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  color: "var(--text-secondary)",
                }}
              >
                {defaultPolicy === "always_allow" ? (
                  <Check size={13} color="var(--success)" />
                ) : (
                  <ShieldQuestion size={13} color="var(--warning)" />
                )}
                {defaultPolicy === "always_allow"
                  ? "Always allow"
                  : "Require confirmation"}
              </span>
            </div>
            <details style={{ borderTop: "1px solid var(--border-color)" }}>
              <summary
                style={{
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span>Tool permissions</span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 22,
                    height: 20,
                    padding: "0 6px",
                    background: "var(--bg-badge)",
                    borderRadius: 10,
                    fontSize: 11,
                    color: "var(--text-primary)",
                  }}
                >
                  {enabledToolCount}/{BUILT_IN_TOOL_COUNT}
                </span>
              </summary>
              <div style={{ padding: "6px 8px 10px" }}>
                {resolvedTools.map((t) => (
                  <div
                    key={t.name}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto",
                      gap: 12,
                      alignItems: "center",
                      padding: "8px 12px",
                      borderRadius: 6,
                      fontSize: 13,
                    }}
                  >
                    <code
                      style={{
                        fontFamily: "monospace",
                        color: "var(--text-primary)",
                      }}
                    >
                      {t.name}
                    </code>
                    <span
                      style={{
                        fontSize: 12,
                        color: t.enabled
                          ? "var(--success)"
                          : "var(--text-muted)",
                      }}
                    >
                      {t.enabled ? "Enabled" : "Disabled"}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 4,
                        fontSize: 12,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {t.policy === "always_allow" ? (
                        <Shield size={12} color="var(--success)" />
                      ) : (
                        <ShieldQuestion size={12} color="var(--warning)" />
                      )}
                      {t.policy === "always_allow"
                        ? "Always allow"
                        : "Confirm"}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        ) : (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            No tools configured.
          </p>
        )}

        {displayed.mcp_servers && displayed.mcp_servers.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <TunnelBanner
              mcpServers={displayed.mcp_servers as Array<{ name?: string; url?: string }>}
            />
            {displayed.mcp_servers.map((server, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 16px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  marginBottom: 8,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: "var(--bg-input)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FileText size={15} color="var(--text-secondary)" />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>
                    {server.name || "Unnamed MCP server"}
                  </div>
                  <code
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--text-muted)",
                    }}
                  >
                    {server.url}
                  </code>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Skills */}
      <Section title="Skills">
        {skillsLoading ? (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            Loading skills...
          </p>
        ) : skills.length === 0 ? (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            No skills attached.{" "}
            <a href="/skills" style={{ color: "var(--accent)" }}>
              Browse skills
            </a>
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {skills.map((s) => (
              <div
                key={s.skill_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Sparkles
                    size={14}
                    color={s.type === "anthropic" ? "var(--success)" : "var(--accent)"}
                  />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {s.display_title || s.skill_id}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {s.type} · v{s.version || "latest"}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDetachSkill(s.skill_id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: 4,
                    borderRadius: 4,
                    display: "inline-flex",
                  }}
                  title="Detach skill"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = "var(--error)";
                    e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = "var(--text-muted)";
                    e.currentTarget.style.background = "none";
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Runtime defaults (env + vaults) */}
      <Section title="Runtime defaults (env + vaults)">
        <AgentRuntimeDefaults
          agentId={agentId}
          mcpServers={displayed.mcp_servers as Array<{ name?: string; url?: string }> | undefined}
        />
      </Section>

      {/* Scheduling + API trigger */}
      <Section title="Schedule & API trigger">
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: "0 0 14px",
            lineHeight: 1.5,
          }}
        >
          Fire this agent on a cron, via the Run now button, or by POSTing to the
          trigger endpoint from any external system. Each fire starts a new
          session. Metered at standard Managed Agents pricing (~$0.08/session-hour
          + tokens) — there is no daily cap, but runs do cost money.
        </p>
        <AgentScheduleSection
          agentId={agentId}
          availableEnvironments={environments}
        />
      </Section>

      {/* Routines */}
      <Section title="Routines">
        {routinesLoading ? (
          <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
            Loading routines...
          </p>
        ) : (
          <>
            {connectedRoutines.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {connectedRoutines.map((r) => (
                  <div
                    key={r.routine_id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 8,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <LayoutDashboard size={14} color="var(--accent)" />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>
                          {r.routine_name}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                          tool: <code style={{ fontFamily: "monospace" }}>{r.tool_name}</code>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDisconnectRoutine(r.routine_id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        padding: 4,
                        borderRadius: 4,
                        display: "inline-flex",
                      }}
                      title="Disconnect routine"
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--error)";
                        e.currentTarget.style.background = "rgba(239,68,68,0.1)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--text-muted)";
                        e.currentTarget.style.background = "none";
                      }}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {availableRoutines.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "10px 14px",
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 8,
                }}
              >
                <select
                  value={selectedRoutineId}
                  onChange={(e) => setSelectedRoutineId(e.target.value)}
                  style={{ flex: 1, padding: "6px 8px", fontSize: 12 }}
                >
                  <option value="">Connect a routine...</option>
                  {availableRoutines.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <button
                  className="btn-primary"
                  onClick={handleConnectRoutine}
                  disabled={!selectedRoutineId || connectingRoutine}
                  style={{
                    padding: "6px 12px",
                    fontSize: 12,
                    opacity: !selectedRoutineId || connectingRoutine ? 0.5 : 1,
                  }}
                >
                  {connectingRoutine ? "..." : "Connect"}
                </button>
              </div>
            ) : connectedRoutines.length === 0 ? (
              <p style={{ color: "var(--text-muted)", margin: 0, fontSize: 14 }}>
                No routines available.{" "}
                <a href="/routines" style={{ color: "var(--accent)" }}>
                  Add routines
                </a>{" "}
                first.
              </p>
            ) : null}
          </>
        )}
      </Section>

      {/* MCP Logs */}
      <McpLogsPanel agentId={agentId} />
    </div>
  );
}

function McpLogsPanel({ agentId }: { agentId: string }) {
  const [logs, setLogs] = useState<Array<{
    id: number; method: string; tool_name: string | null;
    request: string | null; response: string | null;
    duration_ms: number | null; created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/mcp/logs?agent_id=${agentId}&limit=20`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setLogs(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) return null;
  if (logs.length === 0) return null;

  return (
    <Section title="MCP Logs">
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 8,
          overflow: "hidden",
          maxHeight: 300,
          overflowY: "auto",
        }}
      >
        {logs.map((log) => {
          const isCall = log.method === "tools/call";
          const isExpanded = expanded === log.id;
          return (
            <div
              key={log.id}
              style={{
                borderBottom: "1px solid var(--border-color)",
                fontSize: 12,
              }}
            >
              <div
                onClick={() => setExpanded(isExpanded ? null : log.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  background: isCall ? "rgba(34,197,94,0.05)" : "transparent",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-card-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = isCall
                    ? "rgba(34,197,94,0.05)"
                    : "transparent";
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: isCall ? "var(--success)" : "var(--text-muted)",
                    flexShrink: 0,
                  }}
                />
                <code style={{ fontFamily: "monospace", color: "var(--text-primary)" }}>
                  {log.method}
                </code>
                {log.tool_name && (
                  <span style={{ color: "var(--accent)", fontFamily: "monospace" }}>
                    {log.tool_name}
                  </span>
                )}
                {log.duration_ms != null && (
                  <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>
                    {log.duration_ms}ms
                  </span>
                )}
                <span style={{ color: "var(--text-muted)", fontSize: 11 }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
              </div>
              {isExpanded && (log.request || log.response) && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "var(--bg-input)",
                    borderTop: "1px solid var(--border-color)",
                  }}
                >
                  {log.request && (
                    <div style={{ marginBottom: 6 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
                        REQUEST
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "var(--text-secondary)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {log.request}
                      </pre>
                    </div>
                  )}
                  {log.response && (
                    <div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>
                        RESPONSE
                      </div>
                      <pre
                        style={{
                          margin: 0,
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "var(--text-secondary)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-all",
                        }}
                      >
                        {log.response}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Sessions tab
// ---------------------------------------------------------------------------

function SessionsTab({
  agentId,
  versions,
  selectedVersion,
}: {
  agentId: string;
  versions: AgentVersion[];
  selectedVersion: number | null;
}) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionFilter, setVersionFilter] = useState<"all" | number>("all");
  const [showArchived, setShowArchived] = useState(true);
  const [createdFilter, setCreatedFilter] = useState<
    "all" | "24h" | "7d" | "30d"
  >("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  // Initial filter = currently selected version, so clicking from Agent tab
  // narrows sessions to the same version by default
  useEffect(() => {
    if (selectedVersion !== null && versionFilter === "all") {
      // keep current if already set, otherwise scope to current version
      // (user can pick "All" manually)
    }
  }, [selectedVersion, versionFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ agent_id: agentId });
      if (versionFilter !== "all") {
        params.set("agent_version", String(versionFilter));
      }
      if (showArchived) params.set("include_archived", "true");
      if (createdFilter !== "all") {
        const now = Date.now();
        const deltas = { "24h": 86_400_000, "7d": 604_800_000, "30d": 2_592_000_000 };
        const after = new Date(now - deltas[createdFilter]).toISOString();
        params.set("created_after", after);
      }
      const res = await fetch(`/api/sessions?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : []);
      }
    } finally {
      setLoading(false);
    }
  }, [agentId, versionFilter, showArchived, createdFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [versionFilter, showArchived, createdFilter]);

  const pageCount = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
  const paginated = sessions.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  return (
    <div>
      {/* Filter toolbar */}
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 14,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <select
          value={createdFilter}
          onChange={(e) =>
            setCreatedFilter(e.target.value as typeof createdFilter)
          }
          style={{ padding: "8px 12px", fontSize: 13 }}
          aria-label="Created"
        >
          <option value="all">Created · All time</option>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>

        <select
          value={String(versionFilter)}
          onChange={(e) => {
            const v = e.target.value;
            setVersionFilter(v === "all" ? "all" : Number(v));
          }}
          style={{ padding: "8px 12px", fontSize: 13 }}
          aria-label="Version"
        >
          <option value="all">Version · All</option>
          {versions.map((v) => (
            <option key={v.version ?? 1} value={v.version ?? 1}>
              v{v.version ?? 1}
            </option>
          ))}
        </select>

        <label
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            cursor: "pointer",
            padding: "6px 10px",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            background: "var(--bg-card)",
          }}
        >
          Show archived
          <Toggle checked={showArchived} onChange={setShowArchived} />
        </label>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table style={{ width: "100%" }}>
          <thead>
            <tr
              style={{
                background: "var(--bg-secondary)",
                borderBottom: "1px solid var(--border-color)",
              }}
            >
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                ID
              </th>
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Name
              </th>
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Status
              </th>
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Version
              </th>
              <th
                style={{
                  padding: "10px 16px",
                  textAlign: "left",
                  fontSize: 12,
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 32,
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 13,
                  }}
                >
                  Loading sessions...
                </td>
              </tr>
            ) : paginated.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  style={{
                    padding: 40,
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 14,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    No sessions yet
                  </div>
                  <div style={{ fontSize: 13 }}>
                    Run this agent to create a session.
                  </div>
                </td>
              </tr>
            ) : (
              paginated.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => (window.location.href = `/sessions/${s.id}`)}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      "var(--bg-card-hover)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLTableRowElement).style.background =
                      "transparent")
                  }
                >
                  <td
                    style={{
                      padding: "12px 16px",
                      fontFamily: "monospace",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.id.length > 24 ? `${s.id.slice(0, 24)}...` : s.id}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {s.metadata?.name || "—"}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <StatusPill status={s.status} />
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "var(--text-secondary)",
                    }}
                  >
                    v{s.agent?.version ?? "?"}
                  </td>
                  <td
                    style={{
                      padding: "12px 16px",
                      fontSize: 13,
                      color: "var(--text-muted)",
                    }}
                  >
                    {s.created_at ? formatRelative(s.created_at) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sessions.length > PAGE_SIZE && (
        <div
          style={{
            display: "flex",
            gap: 6,
            marginTop: 16,
          }}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn-secondary"
            style={{
              padding: "6px 10px",
              fontSize: 13,
              opacity: page === 1 ? 0.4 : 1,
            }}
          >
            ←
          </button>
          <span
            style={{
              padding: "6px 12px",
              fontSize: 13,
              color: "var(--text-secondary)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            {page} of {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            disabled={page === pageCount}
            className="btn-secondary"
            style={{
              padding: "6px 10px",
              fontSize: 13,
              opacity: page === pageCount ? 0.4 : 1,
            }}
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny reusable bits
// ---------------------------------------------------------------------------

function Section({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <h3
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-secondary)",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: "0.4px",
          }}
        >
          {title}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MenuItem({
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
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          color: danger ? "var(--error)" : "var(--text-secondary)",
        }}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 34,
        height: 20,
        borderRadius: 10,
        background: checked ? "var(--accent)" : "var(--border-color)",
        border: "none",
        position: "relative",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          background: "#FFFFFF",
          position: "absolute",
          top: 3,
          left: checked ? 17 : 3,
          transition: "left 0.2s ease",
        }}
      />
    </button>
  );
}

function StatusPill({ status }: { status?: string }) {
  const s = (status ?? "idle").toLowerCase();
  const map: Record<string, { color: string; bg: string; label: string }> = {
    idle: {
      color: "var(--text-primary)",
      bg: "var(--bg-badge)",
      label: "Idle",
    },
    running: {
      color: "var(--accent)",
      bg: "var(--accent-subtle)",
      label: "Running",
    },
    terminated: {
      color: "var(--text-muted)",
      bg: "var(--bg-badge)",
      label: "Terminated",
    },
    error: {
      color: "var(--error)",
      bg: "rgba(239, 68, 68, 0.1)",
      label: "Error",
    },
  };
  const cfg = map[s] ?? map.idle;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      {cfg.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const diffSec = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minute${diffSec < 120 ? "" : "s"} ago`;
    if (diffSec < 86400) {
      const h = Math.floor(diffSec / 3600);
      return `${h} hour${h === 1 ? "" : "s"} ago`;
    }
    const d = Math.floor(diffSec / 86400);
    if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}
