"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Plus,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { Vault } from "@/lib/types";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";

type FilterTab = "all" | "active";

const ITEMS_PER_PAGE = 10;

export default function VaultsPage() {
  const router = useRouter();
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);

  // Create vault modal
  const [createVaultOpen, setCreateVaultOpen] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [creatingVault, setCreatingVault] = useState(false);

  // Filters and pagination
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [currentPage, setCurrentPage] = useState(1);

  const fetchVaults = async () => {
    try {
      const res = await fetch("/api/vaults");
      if (!res.ok) return;
      const data: Vault[] = await res.json();
      setVaults(Array.isArray(data) ? data : []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaults();
  }, []);

  const filteredVaults = useMemo(() => {
    // For now all vaults are "active" since the API doesn't have archived status
    // When activeTab is "active", we still show all (they're all active)
    return vaults;
  }, [vaults, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filteredVaults.length / ITEMS_PER_PAGE));
  const paginatedVaults = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredVaults.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredVaults, currentPage]);

  const createVault = async () => {
    if (!vaultName.trim()) return;
    setCreatingVault(true);
    try {
      const res = await fetch("/api/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: vaultName.trim() }),
      });
      if (res.ok) {
        setVaultName("");
        setCreateVaultOpen(false);
        fetchVaults();
      } else {
        alert("Failed to create vault");
      }
    } finally {
      setCreatingVault(false);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
  ];

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
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
            <Shield size={24} color="var(--accent)" />
            Credential Vaults
          </h1>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: 14,
              margin: 0,
            }}
          >
            Manage credential vaults that provide your agents with access to MCP
            servers and other tools.
          </p>
        </div>
        <button
          onClick={() => setCreateVaultOpen(true)}
          className="btn-primary"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}
        >
          <Plus size={16} />
          New vault
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          marginBottom: 16,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveTab(tab.key);
              setCurrentPage(1);
            }}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: activeTab === tab.key ? 600 : 400,
              color:
                activeTab === tab.key
                  ? "var(--accent)"
                  : "var(--text-secondary)",
              background:
                activeTab === tab.key ? "var(--accent-subtle)" : "transparent",
              border:
                activeTab === tab.key
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

      {/* Content */}
      {loading ? (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table style={{ width: "100%" }}>
            <thead>
              <tr
                style={{
                  background: "var(--bg-secondary)",
                  borderBottom: "1px solid var(--border-color)",
                }}
              >
                <th>ID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3].map((i) => (
                <tr key={i}>
                  <td>
                    <LoadingSkeleton height={16} width="80%" />
                  </td>
                  <td>
                    <LoadingSkeleton height={16} width="60%" />
                  </td>
                  <td>
                    <LoadingSkeleton height={16} width="50px" />
                  </td>
                  <td>
                    <LoadingSkeleton height={16} width="70%" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : filteredVaults.length === 0 ? (
        <EmptyState
          icon={Shield}
          title="No vaults yet"
          description="Create a credential vault to securely store credentials for your agents."
          actionLabel="New vault"
          actionHref="#"
        />
      ) : (
        <>
          {/* Vaults Table */}
          <div
            className="card"
            style={{ padding: 0, overflow: "hidden" }}
          >
            <table style={{ width: "100%" }}>
              <thead>
                <tr
                  style={{
                    background: "var(--bg-secondary)",
                  }}
                >
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
                    }}
                  >
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedVaults.map((vault) => (
                  <tr
                    key={vault.id}
                    onClick={() => router.push(`/vaults/${vault.id}`)}
                    style={{
                      cursor: "pointer",
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
                      {vault.id.length > 20
                        ? vault.id.slice(0, 20) + "..."
                        : vault.id}
                    </td>
                    <td
                      style={{
                        padding: "12px 16px",
                        fontWeight: 500,
                        fontSize: 14,
                      }}
                    >
                      {vault.name}
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
                        fontSize: 13,
                        color: "var(--text-secondary)",
                      }}
                    >
                      {formatDate(vault.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginTop: 16,
                padding: "0 4px",
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  color: "var(--text-secondary)",
                }}
              >
                Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{" "}
                {Math.min(
                  currentPage * ITEMS_PER_PAGE,
                  filteredVaults.length
                )}{" "}
                of {filteredVaults.length} vaults
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }
                  disabled={currentPage === 1}
                  className="btn-secondary"
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    opacity: currentPage === 1 ? 0.4 : 1,
                  }}
                >
                  <ChevronLeft size={16} />
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                  (page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      style={{
                        padding: "6px 12px",
                        fontSize: 13,
                        fontWeight: currentPage === page ? 600 : 400,
                        background:
                          currentPage === page
                            ? "var(--accent)"
                            : "transparent",
                        color:
                          currentPage === page
                            ? "#FFFFFF"
                            : "var(--text-secondary)",
                        border:
                          currentPage === page
                            ? "none"
                            : "1px solid var(--border-color)",
                        borderRadius: 6,
                        cursor: "pointer",
                      }}
                    >
                      {page}
                    </button>
                  )
                )}
                <button
                  onClick={() =>
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="btn-secondary"
                  style={{
                    padding: "6px 10px",
                    fontSize: 13,
                    opacity: currentPage === totalPages ? 0.4 : 1,
                  }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Vault Modal */}
      <Modal
        open={createVaultOpen}
        onClose={() => {
          setCreateVaultOpen(false);
          setVaultName("");
        }}
        title="Create vault"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Warning callout */}
          <div
            style={{
              display: "flex",
              gap: 12,
              padding: "12px 16px",
              borderRadius: 8,
              border: "1px solid var(--accent)",
              background: "var(--accent-bg)",
            }}
          >
            <AlertTriangle
              size={18}
              color="var(--accent)"
              style={{ flexShrink: 0, marginTop: 1 }}
            />
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                margin: 0,
                lineHeight: 1.5,
              }}
            >
              Vaults are shared across this workspace. Credentials added to this
              vault will be usable by anyone with API key access.
            </p>
          </div>

          <div>
            <label style={labelStyle}>Name</label>
            <input
              style={{ width: "100%" }}
              value={vaultName}
              onChange={(e) => {
                if (e.target.value.length <= 50) {
                  setVaultName(e.target.value);
                }
              }}
              placeholder="e.g. Production Secrets"
            />
            <span
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-muted)",
                marginTop: 4,
              }}
            >
              50 characters or fewer
            </span>
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
                setCreateVaultOpen(false);
                setVaultName("");
              }}
              style={{ padding: "8px 16px", fontSize: 13 }}
            >
              Cancel
            </button>
            <button
              onClick={createVault}
              disabled={!vaultName.trim() || creatingVault}
              className="btn-primary"
              style={{
                padding: "8px 20px",
                fontSize: 13,
                opacity: !vaultName.trim() || creatingVault ? 0.5 : 1,
              }}
            >
              {creatingVault ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
