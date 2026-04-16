"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Sparkles,
  GitBranch,
  Package,
  Building2,
  ExternalLink,
  Plus,
  Wrench,
  FileText,
  Globe,
  Database,
  PenTool,
  Link as LinkIcon,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useToast } from "@/components/Toast";

interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  source: "bundled" | "anthropic" | "github";
  category: string;
  content: string;
  anthropic_skill_id?: string;
}

interface Agent {
  id: string;
  name: string;
}

type FilterTab = "all" | "bundled" | "anthropic" | "github";

const sourceConfig: Record<
  string,
  { label: string; color: string; bg: string; icon: typeof Package }
> = {
  bundled: {
    label: "Bundled",
    color: "var(--accent)",
    bg: "var(--accent-subtle)",
    icon: Package,
  },
  anthropic: {
    label: "Anthropic",
    color: "var(--success)",
    bg: "rgba(34, 197, 94, 0.1)",
    icon: Building2,
  },
  github: {
    label: "GitHub",
    color: "var(--text-secondary)",
    bg: "var(--bg-hover)",
    icon: GitBranch,
  },
};

const categoryIcons: Record<string, typeof Wrench> = {
  Research: Globe,
  Development: Wrench,
  Data: Database,
  Content: PenTool,
  Community: GitBranch,
};

export default function SkillsPage() {
  const { showToast } = useToast();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [skillsRes, agentsRes] = await Promise.all([
          fetch("/api/skills"),
          fetch("/api/agents"),
        ]);
        const skillsData = skillsRes.ok ? await skillsRes.json() : [];
        const agentsData = agentsRes.ok ? await agentsRes.json() : [];
        setSkills(Array.isArray(skillsData) ? skillsData : []);
        setAgents(Array.isArray(agentsData) ? agentsData : []);
        if (skillsData.length > 0) {
          setSelectedId(skillsData[0].id);
        }
      } catch {
        // API may not be ready
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      if (activeTab !== "all" && s.source !== activeTab) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [skills, activeTab, searchQuery]);

  const selectedSkill = skills.find((s) => s.id === selectedId) || null;

  const handleInstall = async (skill: Skill) => {
    if (!skill.anthropic_skill_id) return;
    setInstallingId(skill.id);
    try {
      const res = await fetch("/api/skills/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anthropic_skill_id: skill.anthropic_skill_id,
          name: skill.name,
          description: skill.description,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || "Failed to install skill", "error");
        return;
      }
      showToast(`${skill.name} installed successfully`, "success");
    } catch {
      showToast("Network error while installing skill", "error");
    } finally {
      setInstallingId(null);
    }
  };

  const handleImport = async () => {
    if (!importUrl.trim()) return;
    setImporting(true);
    setImportError("");
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ github_url: importUrl.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        setImportError(err.error || "Import failed");
        return;
      }
      const newSkill = await res.json();
      setSkills((prev) => [...prev, newSkill]);
      setSelectedId(newSkill.id);
      setImportUrl("");
      setImportModalOpen(false);
    } catch {
      setImportError("Network error. Please try again.");
    } finally {
      setImporting(false);
    }
  };

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "bundled", label: "Bundled" },
    { key: "anthropic", label: "Anthropic" },
    { key: "github", label: "GitHub" },
  ];

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
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
            <Sparkles size={24} color="var(--accent)" />
            Skills
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            Browse, import, and attach skills to your agents.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setImportModalOpen(true)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <GitBranch size={16} />
          Import from GitHub
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 0,
          border: "1px solid var(--border-color)",
          borderRadius: 12,
          overflow: "hidden",
          height: "calc(100vh - 200px)",
          minHeight: 500,
        }}
      >
        {/* Sidebar List */}
        <div
          style={{
            width: "30%",
            minWidth: 280,
            maxWidth: 380,
            background: "var(--bg-card)",
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Search */}
          <div style={{ padding: "16px 16px 12px" }}>
            <div style={{ position: "relative" }}>
              <Search
                size={16}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--text-muted)",
                  pointerEvents: "none",
                }}
              />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search skills..."
                style={{
                  width: "100%",
                  padding: "8px 10px 8px 34px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 13,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Category Tabs */}
          <div
            style={{
              display: "flex",
              gap: 4,
              padding: "0 16px 12px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: "5px 10px",
                  fontSize: 12,
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  color:
                    activeTab === tab.key
                      ? "var(--accent)"
                      : "var(--text-secondary)",
                  background:
                    activeTab === tab.key
                      ? "var(--accent-subtle)"
                      : "transparent",
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

          {/* Skill List */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {loading ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                Loading skills...
              </div>
            ) : filteredSkills.length === 0 ? (
              <div
                style={{
                  padding: 24,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                {activeTab === "anthropic"
                  ? "Anthropic Skills Library is coming soon. Check back as more official skills are published."
                  : "No skills found"}
              </div>
            ) : (
              filteredSkills.map((skill) => {
                const config = sourceConfig[skill.source] || sourceConfig.bundled;
                const isSelected = selectedId === skill.id;
                return (
                  <button
                    key={skill.id}
                    onClick={() => setSelectedId(skill.id)}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "12px 16px",
                      textAlign: "left",
                      background: isSelected
                        ? "var(--accent-subtle)"
                        : "transparent",
                      border: "none",
                      borderLeft: isSelected
                        ? "3px solid var(--accent)"
                        : "3px solid transparent",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background =
                          "var(--bg-card-hover)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 4,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: isSelected
                            ? "var(--accent)"
                            : "var(--text-primary)",
                        }}
                      >
                        {skill.name}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 500,
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: config.bg,
                          color: config.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        {config.label}
                      </span>
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "var(--text-secondary)",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        margin: 0,
                      }}
                    >
                      {skill.description}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail Panel */}
        <div
          style={{
            flex: 1,
            background: "var(--bg-primary)",
            overflowY: "auto",
            padding: 32,
          }}
        >
          {selectedSkill ? (
            <SkillDetail
              skill={selectedSkill}
              agents={agents}
              onInstall={handleInstall}
              installing={installingId === selectedSkill.id}
            />
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              <Sparkles
                size={40}
                style={{ marginBottom: 16, opacity: 0.3 }}
              />
              Select a skill to view details
            </div>
          )}
        </div>
      </div>

      {/* Import Modal */}
      <Modal
        open={importModalOpen}
        onClose={() => {
          setImportModalOpen(false);
          setImportError("");
          setImportUrl("");
        }}
        title="Import Skill from GitHub"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p
            style={{
              fontSize: 13,
              color: "var(--text-secondary)",
              margin: 0,
            }}
          >
            Provide a GitHub repository URL or user/repo shorthand. The
            repository must contain a SKILL.md file at its root.
          </p>
          <div style={{ position: "relative" }}>
            <LinkIcon
              size={16}
              style={{
                position: "absolute",
                left: 10,
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            />
            <input
              value={importUrl}
              onChange={(e) => {
                setImportUrl(e.target.value);
                setImportError("");
              }}
              placeholder="https://github.com/user/repo or user/repo"
              style={{
                width: "100%",
                padding: "10px 12px 10px 34px",
                background: "var(--bg-input)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-primary)",
                fontSize: 14,
                outline: "none",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleImport();
              }}
            />
          </div>
          {importError && (
            <p style={{ fontSize: 13, color: "var(--error)", margin: 0 }}>
              {importError}
            </p>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              className="btn-secondary"
              onClick={() => {
                setImportModalOpen(false);
                setImportError("");
                setImportUrl("");
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={importing || !importUrl.trim()}
              style={{
                opacity: importing || !importUrl.trim() ? 0.6 : 1,
              }}
            >
              {importing ? "Importing..." : "Import"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill Detail Sub-component
// ---------------------------------------------------------------------------

function SkillDetail({
  skill,
  agents,
  onInstall,
  installing,
}: {
  skill: Skill;
  agents: Agent[];
  onInstall: (skill: Skill) => void;
  installing: boolean;
}) {
  const [attachAgent, setAttachAgent] = useState("");
  const [attached, setAttached] = useState(false);

  const config = sourceConfig[skill.source] || sourceConfig.bundled;
  const SourceIcon = config.icon;
  const CategoryIcon = categoryIcons[skill.category] || FileText;

  const handleAttach = () => {
    if (!attachAgent) return;
    // In a real implementation, this would call an API to attach the skill to the agent
    setAttached(true);
    setTimeout(() => setAttached(false), 3000);
  };

  // Render SKILL.md content with basic markdown formatting
  const renderContent = (content: string) => {
    const lines = content.split("\n");
    const elements: React.ReactNode[] = [];

    lines.forEach((line, i) => {
      if (line.startsWith("# ")) {
        // Skip h1, we show it in the header
      } else if (line.startsWith("## ")) {
        elements.push(
          <h2
            key={i}
            style={{
              fontSize: 18,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 28,
              marginBottom: 12,
              paddingBottom: 8,
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            {line.replace("## ", "")}
          </h2>
        );
      } else if (line.startsWith("### ")) {
        elements.push(
          <h3
            key={i}
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: "var(--text-primary)",
              marginTop: 20,
              marginBottom: 8,
            }}
          >
            {line.replace("### ", "")}
          </h3>
        );
      } else if (line.startsWith("- **")) {
        const match = line.match(/^- \*\*(.+?)\*\*\s*[-:]\s*(.+)/);
        if (match) {
          elements.push(
            <div
              key={i}
              style={{
                padding: "4px 0 4px 16px",
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <strong style={{ color: "var(--text-primary)" }}>
                {match[1]}
              </strong>{" "}
              - {match[2]}
            </div>
          );
        }
      } else if (line.startsWith("- ")) {
        elements.push(
          <div
            key={i}
            style={{
              padding: "3px 0 3px 16px",
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.6,
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 4,
                color: "var(--accent)",
              }}
            >
              -
            </span>
            {line.replace(/^- /, "")}
          </div>
        );
      } else if (/^\d+\.\s/.test(line)) {
        const match = line.match(/^(\d+)\.\s*\*\*(.+?)\*\*\s*[-:]\s*(.+)/);
        if (match) {
          elements.push(
            <div
              key={i}
              style={{
                padding: "4px 0 4px 16px",
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
              }}
            >
              <span style={{ color: "var(--accent)", marginRight: 8 }}>
                {match[1]}.
              </span>
              <strong style={{ color: "var(--text-primary)" }}>
                {match[2]}
              </strong>{" "}
              - {match[3]}
            </div>
          );
        } else {
          elements.push(
            <p
              key={i}
              style={{
                fontSize: 14,
                color: "var(--text-secondary)",
                lineHeight: 1.6,
                paddingLeft: 16,
                margin: "3px 0",
              }}
            >
              {line}
            </p>
          );
        }
      } else if (line.trim() === "") {
        elements.push(<div key={i} style={{ height: 8 }} />);
      } else {
        elements.push(
          <p
            key={i}
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              margin: "4px 0",
            }}
          >
            {line}
          </p>
        );
      }
    });

    return elements;
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 8,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "var(--accent-subtle)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CategoryIcon size={22} color="var(--accent)" />
            </div>
            <div>
              <h2
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  margin: 0,
                }}
              >
                {skill.name}
              </h2>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 12,
                    color: config.color,
                    background: config.bg,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontWeight: 500,
                  }}
                >
                  <SourceIcon size={12} />
                  {config.label}
                </span>
                <span
                  style={{ fontSize: 13, color: "var(--text-secondary)" }}
                >
                  by {skill.author}
                </span>
                <span
                  style={{ fontSize: 12, color: "var(--text-muted)" }}
                >
                  {skill.category}
                </span>
              </div>
            </div>
          </div>
          <p
            style={{
              fontSize: 14,
              color: "var(--text-secondary)",
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {skill.description}
          </p>
        </div>
      </div>

      {/* Attach to Agent */}
      <div
        className="card"
        style={{
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <label
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-secondary)",
            whiteSpace: "nowrap",
          }}
        >
          Attach to Agent:
        </label>
        <select
          value={attachAgent}
          onChange={(e) => setAttachAgent(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 10px",
            background: "var(--bg-input)",
            border: "1px solid var(--border-color)",
            borderRadius: 6,
            color: "var(--text-primary)",
            fontSize: 13,
            outline: "none",
          }}
        >
          <option value="">Select an agent...</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <button
          className="btn-primary"
          onClick={handleAttach}
          disabled={!attachAgent}
          style={{
            padding: "8px 16px",
            fontSize: 13,
            opacity: !attachAgent ? 0.5 : 1,
          }}
        >
          {attached ? "Attached" : "Attach"}
        </button>
        {skill.source === "anthropic" && (
          <button
            className="btn-primary"
            onClick={() => onInstall(skill)}
            disabled={installing}
            style={{
              padding: "8px 16px",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
              opacity: installing ? 0.6 : 1,
            }}
          >
            <Plus size={14} />
            {installing ? "Installing..." : "Install"}
          </button>
        )}
        {skill.source === "github" && (
          <button
            className="btn-secondary"
            style={{
              padding: "8px 16px",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <ExternalLink size={14} />
            Install
          </button>
        )}
      </div>

      {/* SKILL.md Content */}
      <div
        className="card"
        style={{
          padding: 28,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 16,
            paddingBottom: 12,
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <FileText size={16} color="var(--text-secondary)" />
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            SKILL.md
          </span>
        </div>
        <div>{renderContent(skill.content)}</div>
      </div>
    </div>
  );
}
