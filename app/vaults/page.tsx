"use client";

import { useEffect, useState, useMemo } from "react";
import { Shield, ChevronRight } from "lucide-react";
import type { Vault, Credential } from "@/lib/types";
import Modal from "@/components/Modal";
import LoadingSkeleton from "@/components/LoadingSkeleton";
import EmptyState from "@/components/EmptyState";
import SearchBar from "@/components/SearchBar";

interface VaultWithCredentials extends Vault {
  credentials: Credential[];
  expanded: boolean;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<VaultWithCredentials[]>([]);
  const [loading, setLoading] = useState(true);

  const [createVaultOpen, setCreateVaultOpen] = useState(false);
  const [vaultName, setVaultName] = useState("");
  const [creatingVault, setCreatingVault] = useState(false);

  const [credVaultId, setCredVaultId] = useState<string | null>(null);
  const [credName, setCredName] = useState("");
  const [credType, setCredType] = useState("api_key");
  const [credToken, setCredToken] = useState("");
  const [credMcpUrl, setCredMcpUrl] = useState("");
  const [addingCred, setAddingCred] = useState(false);
  const [search, setSearch] = useState("");

  const filteredVaults = useMemo(() => {
    if (!search.trim()) return vaults;
    const q = search.toLowerCase();
    return vaults.filter((v) => v.name.toLowerCase().includes(q));
  }, [vaults, search]);

  const fetchVaults = async () => {
    try {
      const res = await fetch("/api/vaults");
      if (!res.ok) return;
      const data: Vault[] = await res.json();

      const withCreds: VaultWithCredentials[] = await Promise.all(
        data.map(async (v) => {
          let credentials: Credential[] = [];
          try {
            const cRes = await fetch(`/api/vaults/${v.id}/credentials`);
            if (cRes.ok) credentials = await cRes.json();
          } catch { /* ignore */ }
          return { ...v, credentials, expanded: false };
        })
      );

      setVaults((prev) => {
        const expandedMap = new Map(prev.map((v) => [v.id, v.expanded]));
        return withCreds.map((v) => ({
          ...v,
          expanded: expandedMap.get(v.id) || false,
        }));
      });
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVaults();
  }, []);

  const toggleExpand = (id: string) => {
    setVaults((prev) =>
      prev.map((v) => (v.id === id ? { ...v, expanded: !v.expanded } : v))
    );
  };

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

  const addCredential = async () => {
    if (!credVaultId || !credName.trim()) return;
    setAddingCred(true);
    try {
      const auth: Record<string, string> = { type: credType };
      if (credToken.trim()) auth.token = credToken.trim();
      if (credMcpUrl.trim()) auth.mcp_server_url = credMcpUrl.trim();

      const res = await fetch(`/api/vaults/${credVaultId}/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: credName.trim(),
          auth,
        }),
      });
      if (res.ok) {
        setCredVaultId(null);
        setCredName("");
        setCredToken("");
        setCredMcpUrl("");
        fetchVaults();
      } else {
        alert("Failed to add credential");
      }
    } finally {
      setAddingCred(false);
    }
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: 6,
  };

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
            placeholder="Search vaults by name..."
            value={search}
            onChange={setSearch}
          />
        </div>
        <button
          onClick={() => setCreateVaultOpen(true)}
          className="btn-primary"
        >
          Create Vault
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2].map((i) => (
            <div key={i} className="card">
              <LoadingSkeleton height={20} width="40%" />
            </div>
          ))}
        </div>
      ) : filteredVaults.length === 0 && !search ? (
        <EmptyState
          icon={Shield}
          title="No vaults yet"
          description="Create one to securely store credentials for your agents."
          actionLabel="Create Vault"
          actionHref="#"
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filteredVaults.length === 0 && search && (
            <div
              style={{
                textAlign: "center",
                color: "var(--text-muted)",
                padding: 32,
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 12,
              }}
            >
              No vaults match &quot;{search}&quot;
            </div>
          )}
          {filteredVaults.map((vault) => (
            <div
              key={vault.id}
              className="card"
              style={{ padding: 0, overflow: "hidden" }}
            >
              <div
                onClick={() => toggleExpand(vault.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "16px 20px",
                  cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <ChevronRight
                    size={16}
                    color="var(--accent)"
                    style={{
                      transform: vault.expanded ? "rotate(90deg)" : "rotate(0)",
                      transition: "transform 0.15s ease",
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 15 }}>
                    {vault.name}
                  </span>
                  <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                    {vault.credentials.length} credential
                    {vault.credentials.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span style={{ color: "var(--text-muted)", fontSize: 12 }}>
                  {vault.created_at
                    ? new Date(vault.created_at).toLocaleDateString()
                    : ""}
                </span>
              </div>

              {vault.expanded && (
                <div
                  style={{
                    borderTop: "1px solid var(--border-color)",
                    padding: "16px 20px",
                  }}
                >
                  {vault.credentials.length === 0 ? (
                    <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 12 }}>
                      No credentials in this vault.
                    </p>
                  ) : (
                    <div style={{ marginBottom: 12 }}>
                      {vault.credentials.map((cred) => (
                        <div
                          key={cred.id}
                          style={{
                            background: "var(--bg-input)",
                            borderRadius: 8,
                            padding: "12px 16px",
                            marginBottom: 8,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 500, fontSize: 14 }}>
                              {cred.display_name}
                            </div>
                            <div
                              style={{
                                fontSize: 12,
                                color: "var(--text-muted)",
                                marginTop: 2,
                              }}
                            >
                              Type: {cred.auth.type}
                              {cred.auth.mcp_server_url &&
                                ` | MCP: ${cred.auth.mcp_server_url}`}
                            </div>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              color: "var(--text-muted)",
                              fontFamily: "monospace",
                            }}
                          >
                            {cred.id.slice(0, 12)}...
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCredVaultId(vault.id);
                    }}
                    className="btn-secondary"
                    style={{
                      padding: "8px 16px",
                      fontSize: 13,
                      borderStyle: "dashed",
                    }}
                  >
                    + Add Credential
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Vault Modal */}
      <Modal
        open={createVaultOpen}
        onClose={() => setCreateVaultOpen(false)}
        title="Create Vault"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Vault Name</label>
            <input
              style={{ width: "100%" }}
              value={vaultName}
              onChange={(e) => setVaultName(e.target.value)}
              placeholder="e.g. Production Secrets"
            />
          </div>
          <button
            onClick={createVault}
            disabled={!vaultName.trim() || creatingVault}
            className="btn-primary"
            style={{
              alignSelf: "flex-end",
              opacity: !vaultName.trim() || creatingVault ? 0.5 : 1,
            }}
          >
            {creatingVault ? "Creating..." : "Create"}
          </button>
        </div>
      </Modal>

      {/* Add Credential Modal */}
      <Modal
        open={credVaultId !== null}
        onClose={() => setCredVaultId(null)}
        title="Add Credential"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={labelStyle}>Display Name</label>
            <input
              style={{ width: "100%" }}
              value={credName}
              onChange={(e) => setCredName(e.target.value)}
              placeholder="e.g. GitHub Token"
            />
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select
              style={{ width: "100%" }}
              value={credType}
              onChange={(e) => setCredType(e.target.value)}
            >
              <option value="api_key">API Key</option>
              <option value="oauth2">OAuth2</option>
              <option value="bearer_token">Bearer Token</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Token / Secret</label>
            <input
              style={{ width: "100%" }}
              type="password"
              value={credToken}
              onChange={(e) => setCredToken(e.target.value)}
              placeholder="Enter secret value"
            />
          </div>
          <div>
            <label style={labelStyle}>MCP Server URL (optional)</label>
            <input
              style={{ width: "100%" }}
              value={credMcpUrl}
              onChange={(e) => setCredMcpUrl(e.target.value)}
              placeholder="https://mcp-server.example.com"
            />
          </div>
          <button
            onClick={addCredential}
            disabled={!credName.trim() || addingCred}
            className="btn-primary"
            style={{
              alignSelf: "flex-end",
              opacity: !credName.trim() || addingCred ? 0.5 : 1,
            }}
          >
            {addingCred ? "Adding..." : "Add Credential"}
          </button>
        </div>
      </Modal>
    </div>
  );
}
