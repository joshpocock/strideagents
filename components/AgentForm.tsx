"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Sparkles } from "lucide-react";
import type { Agent, McpServer } from "@/lib/types";

interface SkillOption {
  id: string;
  name: string;
  description: string;
  source: string;
}

interface AgentFormProps {
  initialData?: Partial<Agent>;
  onSubmit: (data: AgentFormData) => Promise<void>;
  submitLabel?: string;
}

export interface AgentFormData {
  name: string;
  description: string;
  model: string;
  system: string;
  tools: string[];
  mcp_servers: McpServer[];
}

// Fallback models in case the API fetch fails
const fallbackModels = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

const toolsets = [
  { value: "agent_toolset_20260401", label: "Agent Toolset (2026-04-01)" },
];

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

export default function AgentForm({
  initialData,
  onSubmit,
  submitLabel = "Create Agent",
}: AgentFormProps) {
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(
    initialData?.description || ""
  );
  const [model, setModel] = useState(initialData?.model || "claude-sonnet-4-6");
  const [system, setSystem] = useState(initialData?.system || "");
  const [selectedTools, setSelectedTools] = useState<string[]>(
    initialData?.tools?.map((t) => t.type) || ["agent_toolset_20260401"]
  );
  const [models, setModels] = useState(fallbackModels);

  // Fetch available models from the API
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setModels(
            data.map((m: { id: string; display_name: string }) => ({
              value: m.id,
              label: m.display_name,
            }))
          );
        }
      })
      .catch(() => {
        // Keep fallback models
      });
  }, []);
  const [mcpServers, setMcpServers] = useState<McpServer[]>(
    initialData?.mcp_servers || []
  );
  const [submitting, setSubmitting] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillOption[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  useEffect(() => {
    async function fetchSkills() {
      try {
        const res = await fetch("/api/skills");
        if (res.ok) {
          const data = await res.json();
          setAvailableSkills(
            Array.isArray(data)
              ? data.map((s: SkillOption) => ({
                  id: s.id,
                  name: s.name,
                  description: s.description,
                  source: s.source,
                }))
              : []
          );
        }
      } catch {
        // Skills API may not be available
      }
    }
    fetchSkills();
  }, []);

  const handleSkillToggle = (skillId: string) => {
    setSelectedSkills((prev) =>
      prev.includes(skillId)
        ? prev.filter((id) => id !== skillId)
        : [...prev, skillId]
    );
  };

  const handleToolToggle = (tool: string) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const addMcpServer = () => {
    setMcpServers((prev) => [...prev, { name: "", url: "" }]);
  };

  const updateMcpServer = (
    index: number,
    field: "name" | "url",
    value: string
  ) => {
    setMcpServers((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const removeMcpServer = (index: number) => {
    setMcpServers((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !model) return;
    setSubmitting(true);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
        model,
        system: system.trim(),
        tools: selectedTools,
        mcp_servers: mcpServers.filter((s) => s.url.trim()),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <label style={labelStyle}>
          Name <span style={{ color: "var(--accent)" }}>*</span>
        </label>
        <input
          style={{ width: "100%" }}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Code Reviewer"
          required
        />
      </div>

      <div>
        <label style={labelStyle}>Description</label>
        <input
          style={{ width: "100%" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What does this agent do?"
        />
      </div>

      <div>
        <label style={labelStyle}>
          Model <span style={{ color: "var(--accent)" }}>*</span>
        </label>
        <select
          style={{ width: "100%" }}
          value={model}
          onChange={(e) => setModel(e.target.value)}
          required
        >
          {models.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea
          style={{ width: "100%", minHeight: 120, resize: "vertical" }}
          value={system}
          onChange={(e) => setSystem(e.target.value)}
          placeholder="Instructions for the agent..."
        />
      </div>

      <div>
        <label style={labelStyle}>Tools</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {toolsets.map((tool) => (
            <label
              key={tool.value}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 14,
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={selectedTools.includes(tool.value)}
                onChange={() => handleToolToggle(tool.value)}
                style={{ accentColor: "var(--accent)" }}
              />
              {tool.label}
            </label>
          ))}
        </div>
      </div>

      {/* Skills Section */}
      <div>
        <label style={labelStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} color="var(--accent)" />
            Skills
          </span>
        </label>
        {availableSkills.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              margin: 0,
            }}
          >
            No skills available. Import skills from the Skills page.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 200,
              overflowY: "auto",
              padding: "8px 0",
            }}
          >
            {availableSkills.map((skill) => (
              <label
                key={skill.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  fontSize: 13,
                  cursor: "pointer",
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: selectedSkills.includes(skill.id)
                    ? "var(--accent-subtle)"
                    : "transparent",
                  border: selectedSkills.includes(skill.id)
                    ? "1px solid var(--accent)"
                    : "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedSkills.includes(skill.id)}
                  onChange={() => handleSkillToggle(skill.id)}
                  style={{
                    accentColor: "var(--accent)",
                    marginTop: 2,
                  }}
                />
                <div>
                  <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                    {skill.name}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: "var(--text-muted)",
                        marginLeft: 6,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      {skill.source}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text-secondary)",
                      lineHeight: 1.4,
                      marginTop: 2,
                    }}
                  >
                    {skill.description.length > 80
                      ? skill.description.substring(0, 80) + "..."
                      : skill.description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>

      <div>
        <label style={labelStyle}>MCP Servers (optional)</label>
        {mcpServers.map((server, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              gap: 8,
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <input
              style={{ flex: 1 }}
              value={server.name || ""}
              onChange={(e) => updateMcpServer(i, "name", e.target.value)}
              placeholder="Server name"
            />
            <input
              style={{ flex: 2 }}
              value={server.url}
              onChange={(e) => updateMcpServer(i, "url", e.target.value)}
              placeholder="https://mcp-server-url.example.com"
            />
            <button
              type="button"
              onClick={() => removeMcpServer(i)}
              className="btn-secondary"
              style={{
                padding: "8px 10px",
                color: "var(--error)",
                borderColor: "var(--error)",
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addMcpServer}
          className="btn-secondary"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            borderStyle: "dashed",
            gap: 6,
          }}
        >
          <Plus size={14} />
          Add MCP Server
        </button>
      </div>

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="btn-primary"
        style={{
          alignSelf: "flex-start",
          opacity: submitting || !name.trim() ? 0.6 : 1,
        }}
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
