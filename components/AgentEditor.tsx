"use client";

import { useEffect, useMemo, useState } from "react";
import yaml from "js-yaml";
import { Plus, Trash2, Sparkles, Copy } from "lucide-react";
import type { Agent, McpServer } from "@/lib/types";
import { getModelId } from "@/lib/types";

/**
 * AgentEditor — a bidirectional Form ⇄ YAML ⇄ JSON editor for agent config.
 *
 * A single `AgentConfig` object is the source of truth. The Form tab renders
 * named fields for it; the YAML and JSON tabs render the serialized form.
 * Edits in any tab flow back into the same object, so switching tabs always
 * shows the current state.
 */

type PermissionPolicyType = "always_allow" | "always_ask";
type ModelSpeed = "standard" | "fast";

export interface ToolPermissionPolicy {
  type: PermissionPolicyType;
}

export interface ToolSubConfig {
  name: string;
  enabled?: boolean;
  permission_policy?: ToolPermissionPolicy;
}

export interface ToolConfig {
  type: string;
  default_config?: {
    enabled?: boolean;
    permission_policy?: ToolPermissionPolicy;
  };
  configs?: ToolSubConfig[];
}

// Matches the shape Anthropic's Agents API expects.
export interface SkillRef {
  type: "anthropic" | "custom";
  skill_id: string;
  version?: string;
}

/**
 * Normalize whatever shape comes back from the API or legacy storage into
 * SkillRef. Handles three cases:
 *   - Already-correct { type: "anthropic"|"custom", skill_id }
 *   - Legacy broken shape { id, type: "skill" } — infer type from the id
 *   - YAML/JSON hand-written shapes missing the `type` field
 */
function normalizeSkillRef(raw: unknown): SkillRef | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = (r.skill_id as string) ?? (r.id as string);
  if (!id || typeof id !== "string") return null;

  let type: "anthropic" | "custom";
  if (r.type === "anthropic" || r.type === "custom") {
    type = r.type;
  } else {
    // Legacy / unknown — guess from the id prefix so at least something saves.
    type = id.startsWith("anthropic-") ? "anthropic" : "custom";
  }

  const out: SkillRef = { type, skill_id: id };
  if (typeof r.version === "string") out.version = r.version;
  return out;
}

export interface AgentConfig {
  name: string;
  description?: string;
  model: { id: string; speed?: ModelSpeed };
  system?: string;
  tools?: ToolConfig[];
  mcp_servers?: McpServer[];
  skills?: SkillRef[];
  metadata?: Record<string, string>;
}

interface AgentEditorProps {
  initialData?: Partial<Agent>;
  onSubmit: (config: AgentConfig) => Promise<void>;
  submitLabel?: string;
  /**
   * When editing an existing agent, pass its id so the "Add from vault"
   * dropdown can auto-attach the vault on click. Omit for new-agent flows.
   */
  agentId?: string;
}

interface SkillOption {
  id: string;
  name: string;
  description: string;
  source: string;
}

const fallbackModels = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
];

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

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 500,
  color: "var(--text-secondary)",
  marginBottom: 6,
};

function agentToConfig(agent?: Partial<Agent>): AgentConfig {
  const modelId = getModelId(agent?.model) || "claude-sonnet-4-6";
  const speed =
    agent?.model && typeof agent.model === "object"
      ? agent.model.speed ?? undefined
      : undefined;
  const tools = (agent?.tools ?? []).map((t) => {
    const anyT = t as unknown as ToolConfig;
    return {
      type: (t.type as string) || "agent_toolset_20260401",
      default_config: anyT.default_config ?? {
        enabled: true,
        permission_policy: { type: "always_allow" },
      },
      configs: anyT.configs ?? [],
    };
  });
  if (tools.length === 0) {
    tools.push({
      type: "agent_toolset_20260401",
      default_config: {
        enabled: true,
        permission_policy: { type: "always_allow" },
      },
      configs: [],
    });
  }
  const rawSkills = (agent as { skills?: unknown[] })?.skills ?? [];
  const skills = rawSkills
    .map(normalizeSkillRef)
    .filter((s): s is SkillRef => s !== null);

  // Surface each mcp_toolset's default_config.permission_policy on the
  // matching mcp_server so the UI can show a per-MCP permission dropdown.
  // This is UI-local state — pruneConfig writes it back onto the toolset
  // when serializing.
  const mcpToolsetPolicy: Record<string, string> = {};
  for (const t of (agent?.tools ?? []) as any[]) {
    if (t?.type === "mcp_toolset" && t?.mcp_server_name) {
      const p = t?.default_config?.permission_policy?.type;
      if (p) mcpToolsetPolicy[t.mcp_server_name] = p;
    }
  }
  const mcpServers = (agent?.mcp_servers ?? []).map((s: any) => {
    const policy = s?.name ? mcpToolsetPolicy[s.name] : undefined;
    return policy
      ? { ...s, permission_policy: { type: policy } }
      : s;
  });

  return {
    name: agent?.name || "",
    description: agent?.description,
    model: { id: modelId, speed: speed ?? "standard" },
    system: agent?.system,
    tools,
    mcp_servers: mcpServers,
    skills,
    metadata: {},
  };
}

function pruneConfig(config: AgentConfig): AgentConfig {
  // Drop empty optional fields so YAML/JSON output stays tidy.
  const out: AgentConfig = {
    name: config.name,
    model: { id: config.model.id, speed: config.model.speed ?? "standard" },
  };
  if (config.description?.trim()) out.description = config.description.trim();
  if (config.system?.trim()) out.system = config.system;

  // Collect valid MCP server names
  const validServers = (config.mcp_servers ?? []).filter((s) => s.url?.trim());
  const validServerNames = new Set(validServers.map((s) => s.name).filter(Boolean));

  if (validServers.length > 0) {
    // Strip UI-only fields (permission_policy is carried here for the form UI
    // but Anthropic only accepts it on mcp_toolset entries). Default `type`
    // to "url" because the API requires it and templates sometimes omit it.
    out.mcp_servers = validServers.map((s) => {
      const { permission_policy: _drop, ...rest } = s as any;
      return { type: "url", ...rest };
    });
  }

  // Sync tools: remove mcp_toolset entries for removed servers,
  // add mcp_toolset entries for new servers that don't have one
  if (config.tools && config.tools.length > 0) {
    const tools = config.tools.filter((t: any) => {
      if (t.type === "mcp_toolset") {
        // Keep only if the referenced server still exists
        return validServerNames.has(t.mcp_server_name);
      }
      return true;
    });

    // Add mcp_toolset for any server that doesn't have one. Default new
    // toolsets to always_allow so MCP tool calls don't stall waiting for
    // human confirmation — users can tighten this per-MCP via the dropdown
    // on each MCP row (see the UI section below).
    const existingToolsetNames = new Set(
      tools.filter((t: any) => t.type === "mcp_toolset").map((t: any) => t.mcp_server_name)
    );
    for (const server of validServers) {
      if (server.name && !existingToolsetNames.has(server.name)) {
        tools.push({
          type: "mcp_toolset",
          mcp_server_name: server.name,
          default_config: {
            enabled: true,
            permission_policy: {
              type: (server as any).permission_policy?.type ?? "always_allow",
            },
          },
        } as any);
      }
    }

    // For existing mcp_toolset entries whose matching server has a
    // permission_policy set in the UI, sync the toolset to match.
    const updatedTools = tools.map((t: any) => {
      if (t.type !== "mcp_toolset") return t;
      const server = validServers.find((s: any) => s.name === t.mcp_server_name) as any;
      const policy = server?.permission_policy?.type;
      if (!policy) return t;
      return {
        ...t,
        default_config: {
          ...(t.default_config ?? { enabled: true }),
          permission_policy: { type: policy },
        },
      };
    });

    if (updatedTools.length > 0) out.tools = updatedTools;
  } else if (validServers.length > 0) {
    // No tools yet but we have servers — create toolset entries defaulting
    // to always_allow. Users can tighten per-MCP in the form UI.
    out.tools = validServers
      .filter((s) => s.name)
      .map((s) => ({
        type: "mcp_toolset",
        mcp_server_name: s.name,
        default_config: {
          enabled: true,
          permission_policy: {
            type: (s as any).permission_policy?.type ?? "always_allow",
          },
        },
      } as any));
  }

  if (config.skills && config.skills.length > 0) out.skills = config.skills;
  if (config.metadata && Object.keys(config.metadata).length > 0) {
    out.metadata = config.metadata;
  }
  return out;
}

function serializeYaml(config: AgentConfig): string {
  return yaml.dump(pruneConfig(config), {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function serializeJson(config: AgentConfig): string {
  return JSON.stringify(pruneConfig(config), null, 2);
}

function normalizeParsed(raw: unknown): AgentConfig {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const rawModel = obj.model;
  const model: AgentConfig["model"] =
    typeof rawModel === "string"
      ? { id: rawModel, speed: "standard" }
      : {
          id: String((rawModel as Record<string, unknown>)?.id ?? ""),
          speed:
            ((rawModel as Record<string, unknown>)?.speed as ModelSpeed) ??
            "standard",
        };
  return {
    name: String(obj.name ?? ""),
    description: obj.description as string | undefined,
    model,
    system: obj.system as string | undefined,
    tools: (obj.tools as ToolConfig[] | undefined) ?? [],
    mcp_servers: (obj.mcp_servers as McpServer[] | undefined) ?? [],
    skills: ((obj.skills as unknown[] | undefined) ?? [])
      .map(normalizeSkillRef)
      .filter((s): s is SkillRef => s !== null),
    metadata: (obj.metadata as Record<string, string> | undefined) ?? {},
  };
}

type Tab = "form" | "yaml" | "json";

export default function AgentEditor({
  initialData,
  onSubmit,
  submitLabel = "Save",
  agentId,
}: AgentEditorProps) {
  const [config, setConfig] = useState<AgentConfig>(() =>
    agentToConfig(initialData)
  );
  const [tab, setTab] = useState<Tab>("form");
  const [submitting, setSubmitting] = useState(false);

  // Draft text state for YAML/JSON tabs. Kept separately so invalid drafts
  // don't blow away the config while the user is typing.
  const [yamlDraft, setYamlDraft] = useState(() => serializeYaml(config));
  const [jsonDraft, setJsonDraft] = useState(() => serializeJson(config));
  const [yamlError, setYamlError] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // When the Form tab edits the config, reflect those changes into the
  // YAML/JSON drafts — but only when those tabs aren't the active editor.
  useEffect(() => {
    if (tab !== "yaml") {
      setYamlDraft(serializeYaml(config));
      setYamlError(null);
    }
    if (tab !== "json") {
      setJsonDraft(serializeJson(config));
      setJsonError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  // Resync draft when switching INTO a code tab
  useEffect(() => {
    if (tab === "yaml") {
      setYamlDraft(serializeYaml(config));
      setYamlError(null);
    } else if (tab === "json") {
      setJsonDraft(serializeJson(config));
      setJsonError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleYamlChange = (text: string) => {
    setYamlDraft(text);
    try {
      const parsed = yaml.load(text);
      setConfig(normalizeParsed(parsed));
      setYamlError(null);
    } catch (err) {
      setYamlError(err instanceof Error ? err.message : "Invalid YAML");
    }
  };

  const handleJsonChange = (text: string) => {
    setJsonDraft(text);
    try {
      const parsed = JSON.parse(text);
      setConfig(normalizeParsed(parsed));
      setJsonError(null);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
    }
  };

  const handleSubmit = async () => {
    if (!config.name.trim() || !config.model.id) return;
    setSubmitting(true);
    try {
      await onSubmit(pruneConfig(config));
    } finally {
      setSubmitting(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: 4,
          background: "var(--bg-input)",
          borderRadius: 8,
          alignSelf: "flex-start",
        }}
      >
        {(
          [
            { key: "form", label: "Form" },
            { key: "yaml", label: "YAML" },
            { key: "json", label: "JSON" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: tab === t.key ? 600 : 500,
              color: tab === t.key ? "var(--text-primary)" : "var(--text-secondary)",
              background: tab === t.key ? "var(--bg-card)" : "transparent",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "form" && (
        <FormView config={config} onChange={setConfig} agentId={agentId} />
      )}

      {tab === "yaml" && (
        <CodeView
          value={yamlDraft}
          onChange={handleYamlChange}
          language="YAML"
          error={yamlError}
          onCopy={() => copy(yamlDraft)}
        />
      )}

      {tab === "json" && (
        <CodeView
          value={jsonDraft}
          onChange={handleJsonChange}
          language="JSON"
          error={jsonError}
          onCopy={() => copy(jsonDraft)}
        />
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={
          submitting ||
          !config.name.trim() ||
          !config.model.id ||
          Boolean(yamlError) ||
          Boolean(jsonError)
        }
        className="btn-primary"
        style={{
          alignSelf: "flex-start",
          opacity:
            submitting || !config.name.trim() || yamlError || jsonError
              ? 0.6
              : 1,
        }}
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Code view — shared by YAML and JSON tabs
// ---------------------------------------------------------------------------

function CodeView({
  value,
  onChange,
  language,
  error,
  onCopy,
}: {
  value: string;
  onChange: (next: string) => void;
  language: string;
  error: string | null;
  onCopy: () => void;
}) {
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <span style={labelStyle}>{language}</span>
        <button
          type="button"
          onClick={onCopy}
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
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        style={{
          width: "100%",
          minHeight: 340,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.55,
          resize: "vertical",
          padding: 12,
          background: "var(--bg-input)",
          border: `1px solid ${
            error ? "var(--error)" : "var(--border-color)"
          }`,
          borderRadius: 8,
          color: "var(--text-primary)",
          outline: "none",
        }}
      />
      {error && (
        <p
          style={{
            fontSize: 12,
            color: "var(--error)",
            margin: "6px 0 0",
            fontFamily: "monospace",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Form view
// ---------------------------------------------------------------------------

function FormView({
  config,
  onChange,
  agentId,
}: {
  config: AgentConfig;
  onChange: (next: AgentConfig) => void;
  agentId?: string;
}) {
  const [models, setModels] = useState(fallbackModels);
  const [availableSkills, setAvailableSkills] = useState<SkillOption[]>([]);
  const [mcpCreds, setMcpCreds] = useState<
    Array<{
      vault_id: string;
      vault_name: string | null;
      credential_id: string;
      display_name: string;
      mcp_url: string;
    }>
  >([]);
  const [mcpHint, setMcpHint] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/models")
      .then((res) => (res.ok ? res.json() : []))
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
      .catch(() => {});

    fetch("/api/vaults/mcp-credentials")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (Array.isArray(data)) setMcpCreds(data);
      })
      .catch(() => {});

    fetch("/api/skills")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (Array.isArray(data)) {
          // Only skills with source "anthropic" (Anthropic's registry) or
          // "custom" (uploaded to the Skills API) can actually be attached to
          // an agent. Bundled/github-fetched skills have to be uploaded first
          // from the Skills page — showing them here would only produce 400s.
          setAvailableSkills(
            data
              .filter(
                (s: SkillOption) =>
                  s.source === "anthropic" || s.source === "custom"
              )
              .map((s: SkillOption) => ({
                id: s.id,
                name: s.name,
                description: s.description,
                source: s.source,
              }))
          );
        }
      })
      .catch(() => {});
  }, []);

  const patch = (partial: Partial<AgentConfig>) =>
    onChange({ ...config, ...partial });

  const tool = config.tools?.[0];
  const toolsetEnabled = Boolean(tool);
  const defaultEnabled = tool?.default_config?.enabled ?? true;
  const defaultPolicy =
    tool?.default_config?.permission_policy?.type ?? "always_allow";

  const updateTool = (mutator: (t: ToolConfig) => ToolConfig) => {
    const current = config.tools?.[0] ?? {
      type: "agent_toolset_20260401",
      default_config: {
        enabled: true,
        permission_policy: { type: "always_allow" as PermissionPolicyType },
      },
      configs: [],
    };
    const next = mutator(current);
    patch({ tools: [next] });
  };

  const setToolsetEnabled = (on: boolean) => {
    if (on) {
      patch({
        tools: [
          {
            type: "agent_toolset_20260401",
            default_config: {
              enabled: true,
              permission_policy: { type: "always_allow" },
            },
            configs: [],
          },
        ],
      });
    } else {
      patch({ tools: [] });
    }
  };

  // MCP server helpers
  const mcps = config.mcp_servers ?? [];
  const addMcp = () =>
    patch({ mcp_servers: [...mcps, { name: "", url: "" }] });
  const removeMcp = (i: number) =>
    patch({ mcp_servers: mcps.filter((_, idx) => idx !== i) });
  const updateMcp = (i: number, field: "name" | "url", value: string) =>
    patch({
      mcp_servers: mcps.map((s, idx) =>
        idx === i ? { ...s, [field]: value } : s
      ),
    });

  // Metadata helpers
  const metaEntries = Object.entries(config.metadata ?? {});
  const addMeta = () =>
    patch({ metadata: { ...(config.metadata ?? {}), "": "" } });
  const updateMetaKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of metaEntries) {
      next[k === oldKey ? newKey : k] = v;
    }
    patch({ metadata: next });
  };
  const updateMetaValue = (key: string, value: string) => {
    patch({ metadata: { ...(config.metadata ?? {}), [key]: value } });
  };
  const removeMeta = (key: string) => {
    const next = { ...(config.metadata ?? {}) };
    delete next[key];
    patch({ metadata: next });
  };

  // Skills helpers
  const selectedSkillIds = useMemo(
    () => new Set((config.skills ?? []).map((s) => s.skill_id)),
    [config.skills]
  );
  const toggleSkill = (id: string) => {
    const existing = config.skills ?? [];
    if (selectedSkillIds.has(id)) {
      patch({ skills: existing.filter((s) => s.skill_id !== id) });
      return;
    }
    const option = availableSkills.find((s) => s.id === id);
    // Only "anthropic" (registered) and "custom" (uploaded) are valid Anthropic
    // API skill types. Bundled or github-fetched skills must be uploaded first
    // — filtered out of availableSkills below, so this branch shouldn't hit in
    // normal use, but guard anyway.
    if (!option || (option.source !== "anthropic" && option.source !== "custom")) {
      return;
    }
    patch({
      skills: [
        ...existing,
        { type: option.source as "anthropic" | "custom", skill_id: id },
      ],
    });
  };

  // Per-tool overrides (advanced)
  const perToolConfigs = tool?.configs ?? [];
  const upsertToolConfig = (name: string, patchObj: Partial<ToolSubConfig>) => {
    updateTool((t) => {
      const existing = t.configs ?? [];
      const idx = existing.findIndex((c) => c.name === name);
      let next: ToolSubConfig[];
      if (idx === -1) {
        next = [...existing, { name, ...patchObj }];
      } else {
        next = existing.map((c, i) =>
          i === idx ? { ...c, ...patchObj } : c
        );
      }
      return { ...t, configs: next };
    });
  };
  const getToolConfig = (name: string) =>
    perToolConfigs.find((c) => c.name === name);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Name */}
      <div>
        <label style={labelStyle}>
          Name <span style={{ color: "var(--accent)" }}>*</span>
        </label>
        <input
          style={{ width: "100%" }}
          value={config.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="e.g. Code Reviewer"
          required
        />
      </div>

      {/* Description */}
      <div>
        <label style={labelStyle}>Description</label>
        <input
          style={{ width: "100%" }}
          value={config.description ?? ""}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="What does this agent do?"
        />
      </div>

      {/* Model + Speed */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 180px", gap: 12 }}>
        <div>
          <label style={labelStyle}>
            Model <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <select
            style={{ width: "100%" }}
            value={config.model.id}
            onChange={(e) =>
              patch({ model: { ...config.model, id: e.target.value } })
            }
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
          <label style={labelStyle}>Speed</label>
          <select
            style={{ width: "100%" }}
            value={config.model.speed ?? "standard"}
            onChange={(e) =>
              patch({
                model: { ...config.model, speed: e.target.value as ModelSpeed },
              })
            }
          >
            <option value="standard">Standard</option>
            <option value="fast">Fast</option>
          </select>
        </div>
      </div>

      {/* System prompt */}
      <div>
        <label style={labelStyle}>System Prompt</label>
        <textarea
          style={{ width: "100%", minHeight: 120, resize: "vertical" }}
          value={config.system ?? ""}
          onChange={(e) => patch({ system: e.target.value })}
          placeholder="Instructions for the agent..."
        />
      </div>

      {/* Toolset */}
      <div
        style={{
          border: "1px solid var(--border-color)",
          borderRadius: 10,
          padding: 16,
          background: "var(--bg-card)",
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 14,
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          <input
            type="checkbox"
            checked={toolsetEnabled}
            onChange={(e) => setToolsetEnabled(e.target.checked)}
            style={{ accentColor: "var(--accent)" }}
          />
          <span style={{ fontWeight: 600 }}>Built-in tools</span>
          <span
            style={{
              fontSize: 12,
              fontFamily: "monospace",
              color: "var(--text-muted)",
            }}
          >
            agent_toolset_20260401
          </span>
        </label>

        {toolsetEnabled && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
                marginBottom: 12,
              }}
            >
              <div>
                <label style={labelStyle}>Default enabled</label>
                <select
                  style={{ width: "100%" }}
                  value={defaultEnabled ? "true" : "false"}
                  onChange={(e) =>
                    updateTool((t) => ({
                      ...t,
                      default_config: {
                        ...(t.default_config ?? {}),
                        enabled: e.target.value === "true",
                      },
                    }))
                  }
                >
                  <option value="true">On — include all tools by default</option>
                  <option value="false">Off — opt-in via configs</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Default permission</label>
                <select
                  style={{ width: "100%" }}
                  value={defaultPolicy}
                  onChange={(e) =>
                    updateTool((t) => ({
                      ...t,
                      default_config: {
                        ...(t.default_config ?? {}),
                        permission_policy: {
                          type: e.target.value as PermissionPolicyType,
                        },
                      },
                    }))
                  }
                >
                  <option value="always_allow">Always allow</option>
                  <option value="always_ask">Require confirmation</option>
                </select>
              </div>
            </div>

            {/* Per-tool overrides */}
            <details>
              <summary
                style={{
                  cursor: "pointer",
                  fontSize: 13,
                  color: "var(--text-secondary)",
                  marginBottom: 8,
                }}
              >
                Per-tool overrides ({perToolConfigs.length})
              </summary>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                {BUILT_IN_TOOL_NAMES.map((name) => {
                  const cfg = getToolConfig(name);
                  return (
                    <div
                      key={name}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "120px 1fr 1fr",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <span
                        style={{
                          fontFamily: "monospace",
                          fontSize: 13,
                          color: "var(--text-primary)",
                        }}
                      >
                        {name}
                      </span>
                      <select
                        value={
                          cfg?.enabled === undefined
                            ? "inherit"
                            : cfg.enabled
                              ? "true"
                              : "false"
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          upsertToolConfig(name, {
                            enabled:
                              v === "inherit" ? undefined : v === "true",
                          });
                        }}
                        style={{ width: "100%" }}
                      >
                        <option value="inherit">Inherit default</option>
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </select>
                      <select
                        value={cfg?.permission_policy?.type ?? "inherit"}
                        onChange={(e) => {
                          const v = e.target.value;
                          upsertToolConfig(name, {
                            permission_policy:
                              v === "inherit"
                                ? undefined
                                : { type: v as PermissionPolicyType },
                          });
                        }}
                        style={{ width: "100%" }}
                      >
                        <option value="inherit">Inherit permission</option>
                        <option value="always_allow">Always allow</option>
                        <option value="always_ask">
                          Require confirmation
                        </option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </details>
          </>
        )}
      </div>

      {/* Skills */}
      <div>
        <label style={labelStyle}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Sparkles size={14} color="var(--accent)" />
            Skills
          </span>
        </label>
        {availableSkills.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            No skills available. Import from the Skills page.
          </p>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              maxHeight: 200,
              overflowY: "auto",
              padding: "4px 0",
            }}
          >
            {availableSkills.map((skill) => {
              const sel = selectedSkillIds.has(skill.id);
              return (
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
                    background: sel ? "var(--accent-subtle)" : "transparent",
                    border: sel
                      ? "1px solid var(--accent)"
                      : "1px solid transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={sel}
                    onChange={() => toggleSkill(skill.id)}
                    style={{ accentColor: "var(--accent)", marginTop: 2 }}
                  />
                  <div>
                    <div
                      style={{
                        fontWeight: 500,
                        color: "var(--text-primary)",
                      }}
                    >
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
              );
            })}
          </div>
        )}
      </div>

      {/* MCP Servers */}
      <div>
        <label style={labelStyle}>MCP Servers</label>
        {mcps.map((server, i) => (
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
              onChange={(e) => updateMcp(i, "name", e.target.value)}
              placeholder="Server name"
            />
            <input
              style={{ flex: 2 }}
              value={server.url}
              onChange={(e) => updateMcp(i, "url", e.target.value)}
              placeholder="https://mcp-server-url.example.com"
            />
            <select
              value={(server as any).permission_policy?.type ?? "always_allow"}
              onChange={(e) => {
                const policy = e.target.value as PermissionPolicyType;
                onChange({
                  ...config,
                  mcp_servers: (config.mcp_servers ?? []).map((s, idx) =>
                    idx === i
                      ? ({ ...s, permission_policy: { type: policy } } as any)
                      : s
                  ),
                });
              }}
              title="Per-tool permission policy for this MCP. always_allow fires tools without waiting for human approval."
              style={{ width: 180 }}
            >
              <option value="always_allow">Always allow tools</option>
              <option value="always_ask">Require confirmation</option>
            </select>
            <button
              type="button"
              onClick={() => removeMcp(i)}
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={addMcp}
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
          {mcpCreds.length > 0 && (
            <>
              <span style={{ color: "var(--text-muted)", fontSize: 12 }}>or</span>
              <select
                value=""
                onChange={async (e) => {
                  const credId = e.target.value;
                  if (!credId) return;
                  const cred = mcpCreds.find((c) => c.credential_id === credId);
                  if (!cred) return;

                  // Fill the MCP row on the agent config.
                  const already = (config.mcp_servers ?? []).some(
                    (s) => s.url === cred.mcp_url
                  );
                  if (!already) {
                    onChange({
                      ...config,
                      mcp_servers: [
                        ...(config.mcp_servers ?? []),
                        { name: cred.display_name, url: cred.mcp_url },
                      ],
                    });
                  }

                  // If we're editing an existing agent, attach the vault too
                  // so its credentials flow into future sessions.
                  if (agentId) {
                    try {
                      await fetch(`/api/agents/${agentId}/vaults`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ vault_id: cred.vault_id }),
                      });
                      setMcpHint(
                        `Added "${cred.display_name}" and attached vault ${cred.vault_name ?? cred.vault_id}.`
                      );
                    } catch {
                      setMcpHint(
                        `Added "${cred.display_name}". Vault attachment failed — attach it manually in Runtime defaults.`
                      );
                    }
                  } else {
                    setMcpHint(
                      `Added "${cred.display_name}". Attach the vault in Runtime defaults after saving.`
                    );
                  }
                  e.target.value = "";
                }}
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 6,
                  color: "var(--text-primary)",
                  fontSize: 13,
                }}
              >
                <option value="">Add from vault…</option>
                {mcpCreds.map((c) => (
                  <option key={c.credential_id} value={c.credential_id}>
                    {c.display_name}
                    {c.vault_name ? ` · ${c.vault_name}` : ""}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {mcpHint && (
          <p
            style={{
              fontSize: 12,
              color: "var(--text-muted)",
              marginTop: 8,
              padding: "6px 10px",
              background: "var(--bg-card)",
              borderRadius: 6,
            }}
          >
            {mcpHint}
          </p>
        )}
      </div>

      {/* Metadata */}
      <div>
        <label style={labelStyle}>Metadata</label>
        {metaEntries.length === 0 ? (
          <p
            style={{
              fontSize: 13,
              color: "var(--text-muted)",
              margin: "0 0 8px",
            }}
          >
            No metadata. Add key-value tags to organize this agent.
          </p>
        ) : (
          metaEntries.map(([key, value]) => (
            <div
              key={key}
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 8,
                alignItems: "center",
              }}
            >
              <input
                style={{ flex: 1, fontFamily: "monospace", fontSize: 13 }}
                value={key}
                onChange={(e) =>
                  updateMetaKey(key, e.target.value.toLowerCase())
                }
                placeholder="key"
              />
              <input
                style={{ flex: 2 }}
                value={value}
                onChange={(e) => updateMetaValue(key, e.target.value)}
                placeholder="value"
              />
              <button
                type="button"
                onClick={() => removeMeta(key)}
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
          ))
        )}
        <button
          type="button"
          onClick={addMeta}
          className="btn-secondary"
          style={{
            padding: "8px 16px",
            fontSize: 13,
            borderStyle: "dashed",
            gap: 6,
          }}
        >
          <Plus size={14} />
          Add metadata
        </button>
      </div>
    </div>
  );
}
