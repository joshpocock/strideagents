"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Shield,
  ChevronRight,
  Plus,
  Archive,
  Trash2,
  MoreHorizontal,
  Info,
} from "lucide-react";
import type { Vault, Credential } from "@/lib/types";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import { useToast } from "@/components/Toast";

type CredFilterTab = "all" | "active";
type CredType = "oauth" | "bearer";

interface VaultDetail extends Vault {
  updated_at?: string;
}

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;
  const { showToast } = useToast();

  const [vault, setVault] = useState<VaultDetail | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  // Add credential modal
  const [addCredOpen, setAddCredOpen] = useState(false);
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState<CredType>("oauth");
  const [credToken, setCredToken] = useState("");
  const [credMcpUrl, setCredMcpUrl] = useState("");
  const [addingCred, setAddingCred] = useState(false);

  // Delete confirm modal
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Credential context menu — positioned with fixed coords so it escapes the
  // credentials card's `overflow: hidden` clipping.
  const [menuCredId, setMenuCredId] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  // Credential delete confirmation
  const [credDeleteConfirm, setCredDeleteConfirm] = useState<Credential | null>(null);
  const [credDeleting, setCredDeleting] = useState(false);

  // Credential details / edit modal
  const [editCred, setEditCred] = useState<Credential | null>(null);
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editMcpUrl, setEditMcpUrl] = useState("");
  const [editToken, setEditToken] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const openEditCred = (cred: Credential) => {
    setEditCred(cred);
    setEditDisplayName(cred.display_name || "");
    setEditMcpUrl(cred.auth?.mcp_server_url || "");
    setEditToken("");
  };

  // Close menu on outside click or Escape
  useEffect(() => {
    if (!menuCredId) return;
    const onClickAway = () => setMenuCredId(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuCredId(null);
    };
    window.addEventListener("click", onClickAway);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onClickAway);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuCredId]);

  // Credential filter
  const [credTab, setCredTab] = useState<CredFilterTab>("all");

  const fetchVault = async () => {
    try {
      const [vaultRes, credRes] = await Promise.all([
        fetch(`/api/vaults/${vaultId}`),
        fetch(`/api/vaults/${vaultId}/credentials`),
      ]);

      if (vaultRes.ok) {
        const vaultData = await vaultRes.json();
        setVault(vaultData);
      }

      if (credRes.ok) {
        const credData = await credRes.json();
        const creds = Array.isArray(credData)
          ? credData
          : credData?.data ?? [];
        setCredentials(creds);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVault();
  }, [vaultId]);

  const filteredCredentials = useMemo(() => {
    // All credentials are "active" for now
    return credentials;
  }, [credentials, credTab]);

  const addCredential = async () => {
    if (!credMcpUrl.trim()) return;
    setAddingCred(true);
    try {
      const auth: Record<string, string> = {
        type: credType === "bearer" ? "static_bearer" : "oauth",
      };
      if (credType === "bearer" && credToken.trim()) {
        auth.token = credToken.trim();
      }
      if (credMcpUrl.trim()) {
        auth.mcp_server_url = credMcpUrl.trim();
      }

      const res = await fetch(`/api/vaults/${vaultId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: credName.trim() || credMcpUrl.trim(),
          auth,
        }),
      });

      if (res.ok) {
        setAddCredOpen(false);
        setCredName("");
        setCredToken("");
        setCredMcpUrl("");
        setCredType("oauth");
        showToast("Credential added successfully", "success");
        fetchVault();
      } else {
        showToast("Failed to add credential", "error");
      }
    } finally {
      setAddingCred(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      // Note: The API may not support vault deletion yet
      const res = await fetch(`/api/vaults/${vaultId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        showToast("Vault deleted", "success");
        router.push("/vaults");
      } else {
        showToast("Failed to delete vault", "error");
      }
    } finally {
      setDeleting(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getCredTypeBadge = (authType: string) => {
    if (
      authType === "static_bearer" ||
      authType === "bearer_token" ||
      authType === "api_key"
    ) {
      return {
        label: "Bearer token",
        color: "var(--accent)",
        bg: "var(--accent-subtle)",
      };
    }
    return {
      label: "OAuth",
      color: "var(--success)",
      bg: "rgba(34, 197, 94, 0.1)",
    };
  };

  const credTabs: { key: CredFilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
  ];

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: 24 }}>
          <LoadingSkeleton height={20} width="30%" />
        </div>
        <div className="card" style={{ marginBottom: 24 }}>
          <LoadingSkeleton height={16} width="50%" />
          <div style={{ marginTop: 12 }}>
            <LoadingSkeleton height={16} width="70%" />
          </div>
        </div>
        <div className="card">
          <LoadingSkeleton height={16} width="40%" />
        </div>
      </div>
    );
  }

  if (!vault) {
    return (
      <p style={{ color: "var(--text-secondary)" }}>Vault not found.</p>
    );
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

  return (
    <div>
      {/* Breadcrumb */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 24,
          fontSize: 14,
        }}
      >
        <button
          onClick={() => router.push("/vaults")}
          style={{
            background: "none",
            border: "none",
            color: "var(--accent)",
            cursor: "pointer",
            fontSize: 14,
            padding: 0,
          }}
        >
          Credential vaults
        </button>
        <ChevronRight size={14} color="var(--text-muted)" />
        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
          {vault.name}
        </span>
      </div>

      {/* Vault Info Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <h1
              style={{
                fontSize: 20,
                fontWeight: 700,
                margin: 0,
              }}
            >
              {vault.name}
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
                background: "rgba(34, 197, 94, 0.1)",
                color: "var(--success)",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "var(--success)",
                }}
              />
              Active
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn-secondary"
              style={{
                padding: "8px 14px",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--text-secondary)",
              }}
            >
              <Archive size={14} />
              Archive
            </button>
            <button
              onClick={() => setDeleteConfirm(true)}
              className="btn-secondary"
              style={{
                padding: "8px 14px",
                fontSize: 13,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                color: "var(--error)",
                borderColor: "var(--error)",
              }}
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>

        <div style={infoRowStyle}>
          <span style={labelStyle}>ID</span>
          <span
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              color: "var(--text-primary)",
            }}
          >
            {vault.id}
          </span>
        </div>
        <div style={infoRowStyle}>
          <span style={labelStyle}>Created</span>
          <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
            {formatDate(vault.created_at)}
          </span>
        </div>
        <div
          style={{
            ...infoRowStyle,
            borderBottom: "none",
          }}
        >
          <span style={labelStyle}>Updated</span>
          <span style={{ fontSize: 14, color: "var(--text-primary)" }}>
            {formatDate(
              (vault as VaultDetail).updated_at || vault.created_at
            )}
          </span>
        </div>
      </div>

      {/* Credentials Section */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>
          Credentials
        </h2>
        <button
          onClick={() => setAddCredOpen(true)}
          className="btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            fontSize: 13,
          }}
        >
          <Plus size={14} />
          Add credential
        </button>
      </div>

      {/* Credential Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
        }}
      >
        {credTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setCredTab(tab.key)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: credTab === tab.key ? 600 : 400,
              color:
                credTab === tab.key
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              background:
                credTab === tab.key ? "var(--accent-subtle)" : "transparent",
              border:
                credTab === tab.key
                  ? "1px solid var(--accent)"
                  : "1px solid transparent",
              borderRadius: 6,
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Credentials Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {filteredCredentials.length === 0 ? (
          <div
            style={{
              padding: "40px 24px",
              textAlign: "center",
            }}
          >
            <Shield
              size={32}
              color="var(--text-muted)"
              style={{ marginBottom: 12, opacity: 0.5 }}
            />
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 14,
                margin: 0,
                marginBottom: 4,
              }}
            >
              No credentials in this vault
            </p>
            <p
              style={{
                color: "var(--text-muted)",
                fontSize: 13,
                margin: 0,
              }}
            >
              Add a credential to get started.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%" }}>
            <thead>
              <tr style={{ background: "var(--bg-secondary)" }}>
                <th
                  style={{
                    padding: "10px 16px",
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
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Type
                </th>
                <th
                  style={{
                    padding: "10px 16px",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  MCP Server URL
                </th>
                <th
                  style={{
                    padding: "10px 16px",
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
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    width: 48,
                  }}
                />
              </tr>
            </thead>
            <tbody>
              {filteredCredentials.map((cred) => {
                const typeBadge = getCredTypeBadge(cred.auth.type);
                return (
                  <tr
                    key={cred.id}
                    style={{
                      transition: "background 0.1s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background =
                        "var(--bg-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    <td
                      style={{
                        padding: "12px 16px",
                        fontFamily: "monospace",
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {cred.id.length > 16
                        ? cred.id.slice(0, 16) + "..."
                        : cred.id}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      {cred.display_name}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 500,
                          background: typeBadge.bg,
                          color: typeBadge.color,
                        }}
                      >
                        {typeBadge.label}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontSize: 13,
                        fontFamily: "monospace",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {cred.auth.mcp_server_url || "-"}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "3px 10px",
                          borderRadius: 12,
                          fontSize: 12,
                          fontWeight: 500,
                          background: "rgba(34, 197, 94, 0.1)",
                          color: "var(--success)",
                        }}
                      >
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "var(--success)",
                          }}
                        />
                        Active
                      </span>
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        position: "relative",
                      }}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menuCredId === cred.id) {
                            setMenuCredId(null);
                            return;
                          }
                          const rect = (
                            e.currentTarget as HTMLElement
                          ).getBoundingClientRect();
                          // Anchor the menu below the button, right-aligned to
                          // the trigger so it doesn't run off-screen.
                          setMenuPos({
                            top: rect.bottom + 4,
                            left: rect.right - 160,
                          });
                          setMenuCredId(cred.id);
                        }}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--text-muted)",
                          padding: 4,
                          borderRadius: 4,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background =
                            "var(--bg-hover)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "none";
                        }}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {menuCredId === cred.id && menuPos && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: "fixed",
                            top: menuPos.top,
                            left: menuPos.left,
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-color)",
                            borderRadius: 8,
                            padding: 4,
                            minWidth: 160,
                            zIndex: 1000,
                            boxShadow:
                              "0 4px 12px rgba(0, 0, 0, 0.3)",
                          }}
                        >
                          <button
                            onClick={() => {
                              setMenuCredId(null);
                              openEditCred(cred);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "8px 12px",
                              fontSize: 13,
                              color: "var(--text-primary)",
                              background: "none",
                              border: "none",
                              textAlign: "left",
                              cursor: "pointer",
                              borderRadius: 4,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "none";
                            }}
                          >
                            View / edit details
                          </button>
                          <button
                            onClick={() => {
                              setMenuCredId(null);
                              setCredDeleteConfirm(cred);
                            }}
                            style={{
                              display: "block",
                              width: "100%",
                              padding: "8px 12px",
                              fontSize: 13,
                              color: "var(--error)",
                              background: "none",
                              border: "none",
                              textAlign: "left",
                              cursor: "pointer",
                              borderRadius: 4,
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-hover)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "none";
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Credential Modal */}
      <Modal
        open={addCredOpen}
        onClose={() => {
          setAddCredOpen(false);
          setCredName("");
          setCredToken("");
          setCredMcpUrl("");
          setCredType("oauth");
        }}
        title="Add credential"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            Authorize an MCP server for delegated user authentication.
          </p>

          {/* Name field */}
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
              Name{" "}
              <span
                style={{
                  fontWeight: 400,
                  color: "var(--text-muted)",
                }}
              >
                (Optional)
              </span>
            </label>
            <input
              style={{ width: "100%" }}
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder="e.g. Slack"
            />
          </div>

          {/* Type toggle */}
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
              Type
            </label>
            <div
              style={{
                display: "flex",
                gap: 0,
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                overflow: "hidden",
              }}
            >
              <button
                onClick={() => setCredType("oauth")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: credType === "oauth" ? 600 : 400,
                  background:
                    credType === "oauth"
                      ? "var(--accent-subtle)"
                      : "var(--bg-input)",
                  color:
                    credType === "oauth"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  border: "none",
                  borderRight: "1px solid var(--border-color)",
                  cursor: "pointer",
                }}
              >
                OAuth
              </button>
              <button
                onClick={() => setCredType("bearer")}
                style={{
                  flex: 1,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: credType === "bearer" ? 600 : 400,
                  background:
                    credType === "bearer"
                      ? "var(--accent-subtle)"
                      : "var(--bg-input)",
                  color:
                    credType === "bearer"
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Bearer token
              </button>
            </div>
            {/* Type tooltip */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginTop: 6,
              }}
            >
              <Info size={12} color="var(--text-muted)" />
              <span
                style={{
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {credType === "oauth"
                  ? "Use OAuth when the MCP server supports it."
                  : "Use a bearer token for servers that accept a long-lived API key or personal access token."}
              </span>
            </div>
          </div>

          {/* Bearer token field */}
          {credType === "bearer" && (
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
                Token
              </label>
              <input
                style={{ width: "100%" }}
                type="password"
                value={credToken}
                onChange={(e) => setCredToken(e.target.value)}
                placeholder="Enter bearer token or API key"
              />
            </div>
          )}

          {/* MCP Server URL */}
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
              MCP Server URL
            </label>
            <input
              style={{ width: "100%" }}
              value={credMcpUrl}
              onChange={(e) => setCredMcpUrl(e.target.value)}
              placeholder="https://mcp.example.com"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "flex-end",
            }}
          >
            <button
              className="btn-secondary"
              onClick={() => {
                setAddCredOpen(false);
                setCredName("");
                setCredToken("");
                setCredMcpUrl("");
                setCredType("oauth");
              }}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              onClick={addCredential}
              disabled={!credMcpUrl.trim() || addingCred}
              className="btn-primary"
              style={{
                padding: "8px 20px",
                fontSize: 13,
                opacity: !credMcpUrl.trim() || addingCred ? 0.5 : 1,
              }}
            >
              {addingCred
                ? "Adding..."
                : credType === "oauth"
                  ? "Connect"
                  : "Add credential"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Vault Modal */}
      <Modal
        open={deleteConfirm}
        onClose={() => setDeleteConfirm(false)}
        title="Delete vault"
      >
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Are you sure you want to delete <strong>{vault.name}</strong>? This
          will remove all credentials stored in this vault. This action cannot be
          undone.
        </p>
        <div
          style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}
        >
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

      {/* Edit Credential Modal */}
      <Modal
        open={editCred !== null}
        onClose={() => setEditCred(null)}
        title="Credential details"
      >
        {editCred && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <label style={credLabelStyle}>Credential ID</label>
              <code
                style={{
                  display: "block",
                  padding: "8px 10px",
                  background: "var(--bg-input)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--text-muted)",
                  wordBreak: "break-all",
                }}
              >
                {editCred.id}
              </code>
            </div>
            <div>
              <label style={credLabelStyle}>Auth type</label>
              <code
                style={{
                  display: "block",
                  padding: "8px 10px",
                  background: "var(--bg-input)",
                  borderRadius: 6,
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {editCred.auth?.type || "unknown"}
              </code>
            </div>
            <div>
              <label style={credLabelStyle}>Display name</label>
              <input
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                placeholder="Human-readable name"
                style={credInputStyle}
              />
            </div>
            <div>
              <label style={credLabelStyle}>MCP server URL</label>
              <input
                value={editMcpUrl}
                onChange={(e) => setEditMcpUrl(e.target.value)}
                placeholder="https://mcp.example.com/mcp"
                style={{ ...credInputStyle, fontFamily: "monospace", fontSize: 12 }}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                Used by the agent editor's "Add from vault" dropdown. Leave
                blank for non-MCP credentials.
              </p>
            </div>
            <div>
              <label style={credLabelStyle}>
                {editCred.auth?.type === "bearer" ? "Rotate bearer token" : "Rotate token"}
              </label>
              <input
                type="password"
                value={editToken}
                onChange={(e) => setEditToken(e.target.value)}
                placeholder="Leave blank to keep current token"
                style={{ ...credInputStyle, fontFamily: "monospace", fontSize: 12 }}
              />
              <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 0" }}>
                Tokens are never sent back to the browser. Only fill this to
                replace the existing token.
              </p>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={() => setEditCred(null)}
                className="btn-secondary"
                style={{ padding: "8px 16px", fontSize: 13 }}
                disabled={editSaving}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editCred) return;
                  setEditSaving(true);
                  try {
                    const body: Record<string, unknown> = {};
                    if (editDisplayName !== editCred.display_name) {
                      body.display_name = editDisplayName.trim();
                    }
                    const currentMcp = editCred.auth?.mcp_server_url || "";
                    const wantsMcpChange = editMcpUrl !== currentMcp;
                    const wantsTokenChange = editToken.trim().length > 0;
                    if (wantsMcpChange || wantsTokenChange) {
                      body.auth = {
                        type: editCred.auth?.type || "bearer",
                        ...(wantsTokenChange && { token: editToken.trim() }),
                        ...(wantsMcpChange && {
                          mcp_server_url: editMcpUrl.trim() || null,
                        }),
                      };
                    }
                    if (Object.keys(body).length === 0) {
                      setEditCred(null);
                      return;
                    }
                    const res = await fetch(
                      `/api/vaults/${vaultId}/credentials/${editCred.id}`,
                      {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                      }
                    );
                    if (res.ok) {
                      const updated = await res.json();
                      setCredentials((prev) =>
                        prev.map((c) => (c.id === editCred.id ? { ...c, ...updated } : c))
                      );
                      showToast("Credential updated", "success");
                      setEditCred(null);
                    } else {
                      const err = await res.json().catch(() => ({}));
                      showToast(err.error || "Update failed", "error");
                    }
                  } catch {
                    showToast("Network error while saving", "error");
                  } finally {
                    setEditSaving(false);
                  }
                }}
                disabled={editSaving}
                className="btn-primary"
                style={{ padding: "8px 16px", fontSize: 13 }}
              >
                {editSaving ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Credential Modal */}
      <Modal
        open={credDeleteConfirm !== null}
        onClose={() => setCredDeleteConfirm(null)}
        title="Delete credential"
      >
        <p
          style={{
            color: "var(--text-secondary)",
            marginBottom: 20,
            fontSize: 14,
          }}
        >
          Delete <strong>{credDeleteConfirm?.display_name}</strong> from{" "}
          <strong>{vault.name}</strong>? Any agent session that was relying on
          this credential will stop authenticating. This action cannot be
          undone.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            onClick={() => setCredDeleteConfirm(null)}
            className="btn-secondary"
            style={{ padding: "8px 16px", fontSize: 13 }}
            disabled={credDeleting}
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!credDeleteConfirm) return;
              setCredDeleting(true);
              try {
                const res = await fetch(
                  `/api/vaults/${vaultId}/credentials/${credDeleteConfirm.id}`,
                  { method: "DELETE" }
                );
                if (res.ok) {
                  setCredentials((prev) =>
                    prev.filter((c) => c.id !== credDeleteConfirm.id)
                  );
                  showToast("Credential deleted", "success");
                  setCredDeleteConfirm(null);
                } else {
                  const err = await res.json().catch(() => ({}));
                  showToast(err.error || "Delete failed", "error");
                }
              } catch {
                showToast("Network error while deleting", "error");
              } finally {
                setCredDeleting(false);
              }
            }}
            disabled={credDeleting}
            style={{
              background: "var(--error)",
              color: "#FFFFFF",
              border: "none",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              opacity: credDeleting ? 0.6 : 1,
              cursor: "pointer",
            }}
          >
            {credDeleting ? "Deleting..." : "Delete credential"}
          </button>
        </div>
      </Modal>
    </div>
  );
}

const credLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

const credInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  background: "var(--bg-input)",
  border: "1px solid var(--border-color)",
  borderRadius: 6,
  color: "var(--text-primary)",
  fontSize: 13,
  outline: "none",
};
