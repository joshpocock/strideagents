"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Copy } from "lucide-react";
import type { Agent } from "@/lib/types";
import AgentForm, { type AgentFormData } from "@/components/AgentForm";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useToast } from "@/components/Toast";

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [cloning, setCloning] = useState(false);
  const { showToast } = useToast();

  useEffect(() => {
    fetch(`/api/agents/${agentId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Agent | null) => setAgent(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleUpdate = async (data: AgentFormData) => {
    const body = {
      name: data.name,
      description: data.description || undefined,
      model: data.model,
      system: data.system || undefined,
      tools: data.tools.map((t) => ({ type: t })),
      mcp_servers: data.mcp_servers.length > 0 ? data.mcp_servers : undefined,
    };

    const res = await fetch(`/api/agents/${agentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const updated = await res.json();
      setAgent(updated);
      setEditing(false);
    } else {
      const err = await res.text();
      alert(`Failed to update: ${err}`);
    }
  };

  const handleClone = async () => {
    if (!agent) return;
    setCloning(true);
    try {
      const body = {
        name: `${agent.name} (Copy)`,
        model: agent.model,
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
        showToast("Agent cloned successfully", "success");
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
        alert("Failed to delete agent");
      }
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: 720 }}>
        <LoadingSkeleton height={32} width="40%" />
        <div className="card" style={{ marginTop: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--border-color)" }}>
              <LoadingSkeleton height={16} width={`${50 + i * 10}%`} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!agent) {
    return <p style={{ color: "var(--text-secondary)" }}>Agent not found.</p>;
  }

  const infoRowStyle: React.CSSProperties = {
    display: "flex",
    padding: "12px 0",
    borderBottom: "1px solid var(--border-color)",
  };

  const labelStyle: React.CSSProperties = {
    width: 140,
    color: "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    flexShrink: 0,
  };

  if (editing) {
    return (
      <div style={{ maxWidth: 640 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            Edit Agent
          </h1>
          <button
            onClick={() => setEditing(false)}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: 13 }}
          >
            Cancel
          </button>
        </div>
        <div className="card">
          <AgentForm
            initialData={agent}
            onSubmit={handleUpdate}
            submitLabel="Save Changes"
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 24,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          {agent.name}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={handleClone}
            disabled={cloning}
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              opacity: cloning ? 0.6 : 1,
            }}
          >
            <Copy size={14} />
            {cloning ? "Cloning..." : "Clone"}
          </button>
          <button
            onClick={() => setEditing(true)}
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              color: "var(--accent)",
              borderColor: "var(--accent)",
            }}
          >
            Edit
          </button>
          <button
            onClick={() => setDeleteConfirm(true)}
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              color: "var(--error)",
              borderColor: "var(--error)",
            }}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="card">
        <div style={infoRowStyle}>
          <span style={labelStyle}>ID</span>
          <span style={{ fontFamily: "monospace", fontSize: 13 }}>
            {agent.id}
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={labelStyle}>Model</span>
          <span
            style={{
              background: "var(--bg-badge)",
              padding: "2px 8px",
              borderRadius: 6,
              fontSize: 13,
              fontFamily: "monospace",
            }}
          >
            {agent.model}
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={labelStyle}>Description</span>
          <span style={{ color: agent.description ? "var(--text-primary)" : "var(--text-muted)" }}>
            {agent.description || "None"}
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={labelStyle}>System Prompt</span>
          <span
            style={{
              color: agent.system ? "var(--text-primary)" : "var(--text-muted)",
              whiteSpace: "pre-wrap",
              fontSize: 13,
              flex: 1,
            }}
          >
            {agent.system || "None"}
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={labelStyle}>Tools</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {agent.tools && agent.tools.length > 0 ? (
              agent.tools.map((tool, i) => (
                <span
                  key={i}
                  style={{
                    background: "var(--bg-badge)",
                    padding: "2px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontFamily: "monospace",
                  }}
                >
                  {tool.type}
                </span>
              ))
            ) : (
              <span style={{ color: "var(--text-muted)" }}>None</span>
            )}
          </div>
        </div>
        <div style={{ ...infoRowStyle, borderBottom: "none" }}>
          <span style={labelStyle}>MCP Servers</span>
          <div>
            {agent.mcp_servers && agent.mcp_servers.length > 0 ? (
              agent.mcp_servers.map((server, i) => (
                <div
                  key={i}
                  style={{
                    background: "var(--bg-input)",
                    padding: "8px 12px",
                    borderRadius: 8,
                    marginBottom: 6,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: "var(--accent)", fontWeight: 500 }}>
                    {server.name || "Unnamed"}
                  </span>
                  <br />
                  <span
                    style={{
                      fontFamily: "monospace",
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {server.url}
                  </span>
                </div>
              ))
            ) : (
              <span style={{ color: "var(--text-muted)" }}>None</span>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Recent Sessions
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: 14 }}>
          No sessions recorded for this agent yet.
        </p>
      </div>

      <Modal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete Agent"
      >
        <p style={{ color: "var(--text-secondary)", marginBottom: 20, fontSize: 14 }}>
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
