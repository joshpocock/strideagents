"use client";

import { useEffect, useState } from "react";
import {
  Zap,
  Plus,
  Trash2,
  ExternalLink,
  Clock,
  Info,
  Send,
  Loader2,
} from "lucide-react";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";

interface Routine {
  id: number;
  name: string;
  routine_id: string;
  token: string;
  description: string | null;
  trigger_type: string;
  last_fired_at: string | null;
  last_session_url: string | null;
  created_at: string;
}

const triggerColors: Record<string, { bg: string; color: string }> = {
  api: { bg: "var(--accent-subtle)", color: "var(--accent)" },
  scheduled: { bg: "rgba(34, 197, 94, 0.1)", color: "var(--success)" },
  github: { bg: "var(--bg-hover)", color: "var(--text-secondary)" },
};

export default function RoutinesPage() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    routine_id: "",
    token: "",
    description: "",
    trigger_type: "api",
  });
  const [saving, setSaving] = useState(false);
  const [firingId, setFiringId] = useState<number | null>(null);
  const [contextTexts, setContextTexts] = useState<Record<number, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadRoutines = () => {
    fetch("/api/routines")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Routine[]) => setRoutines(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRoutines();
  }, []);

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
        setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api" });
        loadRoutines();
      }
    } catch {
      // silently handle
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
                  last_session_url: data.last_session_url || data.claude_code_session_url,
                }
              : r
          )
        );
      }
    } catch {
      // silently handle
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
      }
    } catch {
      // silently handle
    } finally {
      setDeletingId(null);
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
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Manage and fire Claude Code routines from your dashboard.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setModalOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Plus size={16} />
          Add Routine
        </button>
      </div>

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
          . Add your routine ID and token here to fire them from this dashboard.
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
          actionHref="#"
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
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
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

                  <button
                    onClick={() => handleDelete(routine.id)}
                    disabled={isDeleting}
                    className="btn-secondary"
                    style={{
                      padding: "6px 10px",
                      color: "var(--error)",
                      borderColor: "var(--error)",
                      opacity: isDeleting ? 0.5 : 1,
                      flexShrink: 0,
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
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
                {(routine.last_fired_at || routine.last_session_url) && (
                  <div
                    style={{
                      borderTop: "1px solid var(--border-color)",
                      padding: "10px 20px",
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      fontSize: 12,
                      color: "var(--text-secondary)",
                    }}
                  >
                    {routine.last_fired_at && (
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <Clock size={12} />
                        Last fired: {new Date(routine.last_fired_at).toLocaleString()}
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Routine Modal */}
      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api" });
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
              placeholder="trig_..."
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

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
            <button
              className="btn-secondary"
              onClick={() => {
                setModalOpen(false);
                setFormData({ name: "", routine_id: "", token: "", description: "", trigger_type: "api" });
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
