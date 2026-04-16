"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Rocket,
  Search,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Globe,
  Key,
  Send,
  ArrowRight,
  Server,
  Bot,
  Play,
  Code,
  ExternalLink,
  Loader2,
  SkipForward,
} from "lucide-react";
import type { AgentTemplate } from "@/lib/templates";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface WizardState {
  step: number;
  agent: Record<string, unknown> | null;
  agentId: string;
  environment: Record<string, unknown> | null;
  environmentId: string;
  sessionId: string;
  vaultId: string;
  selectedTemplate: AgentTemplate | null;
  config: Record<string, unknown>;
  networking: "limited" | "unrestricted" | null;
  curlCommands: string[];
  credentialInputs: Record<string, { token: string; vaultId: string; skipped: boolean }>;
}

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  { number: 1, label: "Create agent" },
  { number: 2, label: "Configure environment" },
  { number: 3, label: "Start session" },
  { number: 4, label: "Integrate" },
];

// ---------------------------------------------------------------------------
// Helper: Syntax-highlighted config viewer
// ---------------------------------------------------------------------------

function highlightYaml(text: string): string {
  return text
    .replace(
      /^(\s*)([\w_-]+)(:)/gm,
      '$1<span style="color: var(--accent)">$2</span>$3'
    )
    .replace(
      /:\s*"([^"]*)"/g,
      ': <span style="color: #6ec96e">"$1"</span>'
    )
    .replace(
      /:\s*'([^']*)'/g,
      ": <span style=\"color: #6ec96e\">'$1'</span>"
    )
    .replace(
      /:\s*(true|false|null)/g,
      ': <span style="color: #d19a66">$1</span>'
    )
    .replace(
      /:\s*(\d+)/g,
      ': <span style="color: #d19a66">$1</span>'
    )
    .replace(
      /(#.*$)/gm,
      '<span style="color: var(--text-muted)">$1</span>'
    );
}

function highlightJson(text: string): string {
  return text
    .replace(
      /"([\w_-]+)"\s*:/g,
      '<span style="color: var(--accent)">"$1"</span>:'
    )
    .replace(
      /:\s*"([^"]*)"/g,
      ': <span style="color: #6ec96e">"$1"</span>'
    )
    .replace(
      /:\s*(true|false|null)/g,
      ': <span style="color: #d19a66">$1</span>'
    )
    .replace(
      /:\s*(\d+)/g,
      ': <span style="color: #d19a66">$1</span>'
    );
}

function toYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  let result = "";
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string") {
      if (value.includes("\n") || value.length > 80) {
        result += `${pad}${key}: |\n`;
        for (const line of value.split("\n")) {
          result += `${pad}  ${line}\n`;
        }
      } else {
        result += `${pad}${key}: "${value}"\n`;
      }
    } else if (typeof value === "number" || typeof value === "boolean") {
      result += `${pad}${key}: ${value}\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        result += `${pad}${key}: []\n`;
      } else {
        result += `${pad}${key}:\n`;
        for (const item of value) {
          if (typeof item === "object" && item !== null) {
            const entries = Object.entries(item);
            result += `${pad}  - ${entries[0][0]}: "${entries[0][1]}"\n`;
            for (let i = 1; i < entries.length; i++) {
              result += `${pad}    ${entries[i][0]}: "${entries[i][1]}"\n`;
            }
          } else {
            result += `${pad}  - "${item}"\n`;
          }
        }
      }
    } else if (typeof value === "object") {
      result += `${pad}${key}:\n`;
      result += toYaml(value as Record<string, unknown>, indent + 1);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function QuickstartPage() {
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [configFormat, setConfigFormat] = useState<"yaml" | "json">("yaml");
  const [copied, setCopied] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      role: "system",
      content:
        "Welcome to the Quickstart Wizard. Pick a template below or describe your agent to get started.",
    },
  ]);
  const [testMessage, setTestMessage] = useState("");
  const [descriptionInput, setDescriptionInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [state, setState] = useState<WizardState>({
    step: 1,
    agent: null,
    agentId: "",
    environment: null,
    environmentId: "",
    sessionId: "",
    vaultId: "",
    selectedTemplate: null,
    config: {},
    networking: null,
    curlCommands: [],
    credentialInputs: {},
  });

  // Load templates on mount
  useEffect(() => {
    import("@/lib/templates").then((mod) => {
      setTemplates(mod.TEMPLATES);
    });
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const addChat = useCallback(
    (role: ChatMessage["role"], content: string) => {
      setChatMessages((prev) => [...prev, { role, content }]);
    },
    []
  );

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }, []);

  // ------- Step 1: Select template -------

  const filteredTemplates = templates.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectTemplate = useCallback(
    (template: AgentTemplate) => {
      const config: Record<string, unknown> = {
        name: template.name,
        model: template.model,
        ...(template.system && { system: template.system }),
        tools: template.tools,
        ...(template.mcp_servers.length > 0 && {
          mcp_servers: template.mcp_servers,
        }),
      };

      setState((prev) => ({
        ...prev,
        selectedTemplate: template,
        config,
      }));

      addChat(
        "system",
        `Agent selected: ${template.name}. Click "Create Agent" to proceed.`
      );
    },
    [addChat]
  );

  const createAgent = useCallback(async () => {
    setLoading(true);
    try {
      const payload = state.selectedTemplate
        ? { template_id: state.selectedTemplate.id }
        : { description: descriptionInput };

      const res = await fetch("/api/quickstart/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create agent");

      const newConfig = data.config || state.config;

      setState((prev) => ({
        ...prev,
        step: 2,
        agent: data.agent,
        agentId: data.agent.id,
        config: { ...newConfig, agent_id: data.agent.id },
        curlCommands: [...prev.curlCommands, data.curl_command],
      }));

      addChat("system", `Agent created with ID: ${data.agent.id}`);
      addChat(
        "system",
        "Next, configure the sandbox environment. Choose a networking mode:"
      );
    } catch (err) {
      addChat(
        "system",
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [state.selectedTemplate, state.config, descriptionInput, addChat]);

  const createAgentFromDescription = useCallback(async () => {
    if (!descriptionInput.trim()) return;
    addChat("user", descriptionInput);
    setLoading(true);
    try {
      const res = await fetch("/api/quickstart/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionInput }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create agent");

      setState((prev) => ({
        ...prev,
        step: 2,
        agent: data.agent,
        agentId: data.agent.id,
        config: { ...data.config, agent_id: data.agent.id },
        curlCommands: [...prev.curlCommands, data.curl_command],
      }));

      addChat("system", `Agent created with ID: ${data.agent.id}`);
      addChat(
        "system",
        "Next, configure the sandbox environment. Choose a networking mode:"
      );
    } catch (err) {
      addChat(
        "system",
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [descriptionInput, addChat]);

  // ------- Step 2: Environment -------

  const createEnvironment = useCallback(
    async (networking: "limited" | "unrestricted") => {
      setLoading(true);
      setState((prev) => ({ ...prev, networking }));
      addChat("user", `Networking: ${networking}`);

      try {
        const res = await fetch("/api/quickstart/environment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ networking }),
        });

        const data = await res.json();
        if (!res.ok)
          throw new Error(data.error || "Failed to create environment");

        setState((prev) => ({
          ...prev,
          step: 3,
          environment: data.environment,
          environmentId: data.environment.id,
          config: {
            ...prev.config,
            environment_id: data.environment.id,
            network_access: networking === "unrestricted",
          },
          curlCommands: [...prev.curlCommands, data.curl_command],
        }));

        addChat(
          "system",
          `Environment created with ID: ${data.environment.id}`
        );

        // Check if MCP servers need credentials
        const template = state.selectedTemplate;
        if (template && template.mcp_servers.length > 0) {
          addChat(
            "system",
            `This agent uses ${template.mcp_servers.length} MCP server(s). Configure credentials below, or skip to start without them.`
          );
          const inputs: Record<string, { token: string; vaultId: string; skipped: boolean }> = {};
          for (const mcp of template.mcp_servers) {
            inputs[mcp.name] = { token: "", vaultId: "", skipped: false };
          }
          setState((prev) => ({ ...prev, credentialInputs: inputs }));
        } else {
          addChat(
            "system",
            'No MCP credentials needed. Click "Start Session" to continue.'
          );
        }
      } catch (err) {
        addChat(
          "system",
          `Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      } finally {
        setLoading(false);
      }
    },
    [addChat, state.selectedTemplate]
  );

  // ------- Step 3: Session -------

  const startSession = useCallback(async () => {
    setLoading(true);
    addChat("system", "Creating session...");

    try {
      const res = await fetch("/api/quickstart/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: state.agentId,
          environment_id: state.environmentId,
          ...(state.vaultId && { vault_id: state.vaultId }),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create session");

      setState((prev) => ({
        ...prev,
        sessionId: data.session.id,
        config: { ...prev.config, session_id: data.session.id },
      }));

      addChat("system", `Session started with ID: ${data.session.id}`);
      addChat(
        "system",
        "Send a test message below to verify your agent is working."
      );
    } catch (err) {
      addChat(
        "system",
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [addChat, state.agentId, state.environmentId, state.vaultId]);

  const sendTestMessage = useCallback(async () => {
    if (!testMessage.trim() || !state.sessionId) return;
    const msg = testMessage.trim();
    setTestMessage("");
    addChat("user", msg);
    setLoading(true);

    try {
      const res = await fetch("/api/quickstart/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: state.sessionId,
          message: msg,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat request failed");

      addChat("assistant", data.response_text || "No response received.");
    } catch (err) {
      addChat(
        "system",
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    } finally {
      setLoading(false);
    }
  }, [testMessage, state.sessionId, addChat]);

  const goToStep4 = useCallback(() => {
    setState((prev) => ({ ...prev, step: 4 }));
    addChat(
      "system",
      "Your agent is ready. Use the integration snippets on the right to connect from your app."
    );
  }, [addChat]);

  // ------- Config display -------

  const configText =
    configFormat === "yaml"
      ? toYaml(state.config)
      : JSON.stringify(state.config, null, 2);

  const highlightedConfig =
    configFormat === "yaml"
      ? highlightYaml(configText)
      : highlightJson(configText);

  // ------- Integration code snippets -------

  const integrationSnippets = {
    python: `import anthropic

client = anthropic.Anthropic()

# Send a message to your agent
response = client.beta.sessions.turn(
    session_id="${state.sessionId || "<session_id>"}",
    messages=[{"role": "user", "content": "Hello, agent!"}],
)

for event in response:
    if hasattr(event, "message"):
        for block in event.message.content:
            if block.type == "text":
                print(block.text)`,
    typescript: `import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.sessions.turn(
  "${state.sessionId || "<session_id>"}",
  {
    messages: [{ role: "user", content: "Hello, agent!" }],
  }
);

console.log(response);`,
    curl: `curl -X POST https://api.anthropic.com/v1/sessions/${state.sessionId || "<session_id>"}/turn \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "content-type: application/json" \\
  -H "anthropic-beta: managed-agents-2026-04-01" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Hello, agent!"}
    ]
  }'`,
  };

  const [integrationTab, setIntegrationTab] = useState<
    "python" | "typescript" | "curl"
  >("python");

  // ------- Credential input handler -------

  const updateCredentialInput = useCallback(
    (name: string, field: "token" | "vaultId", value: string) => {
      setState((prev) => ({
        ...prev,
        credentialInputs: {
          ...prev.credentialInputs,
          [name]: { ...prev.credentialInputs[name], [field]: value },
        },
      }));
    },
    []
  );

  const skipCredential = useCallback((name: string) => {
    setState((prev) => ({
      ...prev,
      credentialInputs: {
        ...prev.credentialInputs,
        [name]: { ...prev.credentialInputs[name], skipped: true },
      },
    }));
  }, []);

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Rocket size={22} style={{ color: "var(--accent)" }} />
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--text-primary)",
            fontFamily: "'Poppins', sans-serif",
            margin: 0,
          }}
        >
          Quickstart Wizard
        </h1>
      </div>

      {/* Progress bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 0,
          padding: "16px 24px",
          background: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          borderRadius: 10,
        }}
      >
        {STEPS.map((s, i) => {
          const isCompleted = state.step > s.number;
          const isActive = state.step === s.number;
          const isFuture = state.step < s.number;

          return (
            <div
              key={s.number}
              style={{
                display: "flex",
                alignItems: "center",
                flex: i < STEPS.length - 1 ? 1 : undefined,
              }}
            >
              {/* Step circle + label */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  whiteSpace: "nowrap",
                }}
              >
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 600,
                    background: isCompleted
                      ? "var(--accent)"
                      : isActive
                        ? "var(--accent)"
                        : "var(--bg-primary)",
                    color: isCompleted || isActive ? "#fff" : "var(--text-muted)",
                    border: isFuture
                      ? "2px solid var(--border-color)"
                      : "2px solid var(--accent)",
                    transition: "all 0.3s ease",
                  }}
                >
                  {isCompleted ? (
                    <Check size={14} />
                  ) : (
                    s.number
                  )}
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    color: isActive || isCompleted
                      ? "var(--text-primary)"
                      : "var(--text-muted)",
                  }}
                >
                  {s.label}
                </span>
              </div>

              {/* Connector line */}
              {i < STEPS.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: 2,
                    margin: "0 12px",
                    background: isCompleted
                      ? "var(--accent)"
                      : "var(--border-color)",
                    transition: "background 0.3s ease",
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Split layout: Chat (left) + Config viewer (right) */}
      <div
        style={{
          display: "flex",
          gap: 20,
          minHeight: 600,
          alignItems: "stretch",
        }}
      >
        {/* ============ LEFT PANEL: Chat + Step content ============ */}
        <div
          style={{
            flex: "0 0 40%",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Chat messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {chatMessages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent:
                    msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    borderRadius: 8,
                    fontSize: 13,
                    lineHeight: 1.5,
                    background:
                      msg.role === "user"
                        ? "var(--accent)"
                        : msg.role === "assistant"
                          ? "var(--bg-primary)"
                          : "var(--bg-hover)",
                    color:
                      msg.role === "user" ? "#fff" : "var(--text-primary)",
                    border:
                      msg.role === "user"
                        ? "none"
                        : "1px solid var(--border-color)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Step-specific content area */}
          <div
            style={{
              borderTop: "1px solid var(--border-color)",
              padding: 16,
            }}
          >
            {/* STEP 1: Template grid + description input */}
            {state.step === 1 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Search */}
                <div style={{ position: "relative" }}>
                  <Search
                    size={14}
                    style={{
                      position: "absolute",
                      left: 10,
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-muted)",
                    }}
                  />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search templates..."
                    style={{
                      width: "100%",
                      padding: "8px 10px 8px 30px",
                      background: "var(--bg-input)",
                      border: "1px solid var(--border-color)",
                      borderRadius: 6,
                      color: "var(--text-primary)",
                      fontSize: 13,
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>

                {/* Template grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 8,
                    maxHeight: 280,
                    overflowY: "auto",
                  }}
                >
                  {filteredTemplates.map((t) => {
                    const isSelected = state.selectedTemplate?.id === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(t)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          padding: 10,
                          background: isSelected
                            ? "var(--accent-subtle)"
                            : "var(--bg-primary)",
                          border: isSelected
                            ? "2px solid var(--accent)"
                            : "1px solid var(--border-color)",
                          borderRadius: 8,
                          cursor: "pointer",
                          textAlign: "left",
                          transition: "all 0.15s ease",
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected)
                            (e.currentTarget as HTMLButtonElement).style.borderColor =
                              "var(--accent)";
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected)
                            (e.currentTarget as HTMLButtonElement).style.borderColor =
                              "var(--border-color)";
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "var(--text-primary)",
                          }}
                        >
                          {t.name}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: "var(--text-secondary)",
                            lineHeight: 1.3,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {t.description}
                        </span>
                        {t.mcp_servers.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 4,
                              marginTop: 2,
                            }}
                          >
                            {t.mcp_servers.map((mcp) => (
                              <span
                                key={mcp.name}
                                style={{
                                  fontSize: 10,
                                  padding: "1px 6px",
                                  background: "var(--bg-hover)",
                                  border: "1px solid var(--border-color)",
                                  borderRadius: 4,
                                  color: "var(--text-muted)",
                                }}
                              >
                                {mcp.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>

                {/* Free-form description */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    borderTop: "1px solid var(--border-color)",
                    paddingTop: 12,
                  }}
                >
                  <input
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Describe your agent..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && descriptionInput.trim()) {
                        createAgentFromDescription();
                      }
                    }}
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
                  />
                  <button
                    onClick={createAgentFromDescription}
                    disabled={!descriptionInput.trim() || loading}
                    style={{
                      padding: "8px 12px",
                      background:
                        descriptionInput.trim() && !loading
                          ? "var(--accent)"
                          : "var(--bg-hover)",
                      color:
                        descriptionInput.trim() && !loading
                          ? "#fff"
                          : "var(--text-muted)",
                      border: "none",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor:
                        descriptionInput.trim() && !loading
                          ? "pointer"
                          : "not-allowed",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    {loading ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>

                {/* Create Agent button (for template selection) */}
                {state.selectedTemplate && (
                  <button
                    onClick={createAgent}
                    disabled={loading}
                    style={{
                      padding: "10px 16px",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    {loading ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Bot size={16} />
                    )}
                    Create Agent
                  </button>
                )}
              </div>
            )}

            {/* STEP 2: Environment config */}
            {state.step === 2 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <button
                    onClick={() => createEnvironment("limited")}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      background: "var(--bg-primary)",
                      border: "2px solid var(--border-color)",
                      borderRadius: 8,
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      transition: "border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border-color)";
                    }}
                  >
                    <Shield
                      size={20}
                      style={{ color: "var(--accent)" }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      Limited
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        textAlign: "center",
                      }}
                    >
                      Recommended. Sandbox with restricted network access.
                    </span>
                  </button>

                  <button
                    onClick={() => createEnvironment("unrestricted")}
                    disabled={loading}
                    style={{
                      flex: 1,
                      padding: "12px 14px",
                      background: "var(--bg-primary)",
                      border: "2px solid var(--border-color)",
                      borderRadius: 8,
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      transition: "border-color 0.15s ease",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--accent)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border-color)";
                    }}
                  >
                    <Globe
                      size={20}
                      style={{ color: "var(--text-secondary)" }}
                    />
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                      }}
                    >
                      Unrestricted
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: "var(--text-secondary)",
                        textAlign: "center",
                      }}
                    >
                      Full network access. Use for MCP integrations.
                    </span>
                  </button>
                </div>
                {loading && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      padding: 8,
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    <Loader2 size={14} className="spin" />
                    Creating environment...
                  </div>
                )}
              </div>
            )}

            {/* STEP 3: Credentials + Session */}
            {state.step === 3 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* MCP credential cards */}
                {state.selectedTemplate &&
                  state.selectedTemplate.mcp_servers.length > 0 && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {state.selectedTemplate.mcp_servers.map((mcp) => {
                        const cred = state.credentialInputs[mcp.name];
                        if (!cred || cred.skipped) return (
                          <div
                            key={mcp.name}
                            style={{
                              padding: "8px 12px",
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 6,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              opacity: 0.5,
                            }}
                          >
                            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                              {mcp.name} - skipped
                            </span>
                          </div>
                        );
                        return (
                          <div
                            key={mcp.name}
                            style={{
                              padding: 12,
                              background: "var(--bg-primary)",
                              border: "1px solid var(--border-color)",
                              borderRadius: 8,
                              display: "flex",
                              flexDirection: "column",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <Key
                                  size={14}
                                  style={{ color: "var(--accent)" }}
                                />
                                <span
                                  style={{
                                    fontSize: 13,
                                    fontWeight: 600,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {mcp.name}
                                </span>
                              </div>
                              <button
                                onClick={() => skipCredential(mcp.name)}
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "var(--text-muted)",
                                  fontSize: 11,
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 4,
                                }}
                              >
                                <SkipForward size={12} />
                                Skip
                              </button>
                            </div>
                            <input
                              value={cred.token}
                              onChange={(e) =>
                                updateCredentialInput(
                                  mcp.name,
                                  "token",
                                  e.target.value
                                )
                              }
                              placeholder="Paste API token..."
                              type="password"
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-color)",
                                borderRadius: 6,
                                color: "var(--text-primary)",
                                fontSize: 12,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                            <input
                              value={cred.vaultId}
                              onChange={(e) =>
                                updateCredentialInput(
                                  mcp.name,
                                  "vaultId",
                                  e.target.value
                                )
                              }
                              placeholder="Or use existing vault ID..."
                              style={{
                                width: "100%",
                                padding: "6px 10px",
                                background: "var(--bg-input)",
                                border: "1px solid var(--border-color)",
                                borderRadius: 6,
                                color: "var(--text-primary)",
                                fontSize: 12,
                                outline: "none",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                {/* Start Session button */}
                {!state.sessionId && (
                  <button
                    onClick={startSession}
                    disabled={loading}
                    style={{
                      padding: "10px 16px",
                      background: "var(--accent)",
                      color: "#fff",
                      border: "none",
                      borderRadius: 8,
                      fontSize: 14,
                      fontWeight: 600,
                      cursor: loading ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                      opacity: loading ? 0.7 : 1,
                    }}
                  >
                    {loading ? (
                      <Loader2 size={16} className="spin" />
                    ) : (
                      <Play size={16} />
                    )}
                    Start Session
                  </button>
                )}

                {/* Test message input */}
                {state.sessionId && (
                  <>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        value={testMessage}
                        onChange={(e) => setTestMessage(e.target.value)}
                        placeholder="Send a test message..."
                        onKeyDown={(e) => {
                          if (e.key === "Enter") sendTestMessage();
                        }}
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
                      />
                      <button
                        onClick={sendTestMessage}
                        disabled={!testMessage.trim() || loading}
                        style={{
                          padding: "8px 12px",
                          background:
                            testMessage.trim() && !loading
                              ? "var(--accent)"
                              : "var(--bg-hover)",
                          color:
                            testMessage.trim() && !loading
                              ? "#fff"
                              : "var(--text-muted)",
                          border: "none",
                          borderRadius: 6,
                          cursor:
                            testMessage.trim() && !loading
                              ? "pointer"
                              : "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        {loading ? (
                          <Loader2 size={14} className="spin" />
                        ) : (
                          <Send size={14} />
                        )}
                      </button>
                    </div>

                    <button
                      onClick={goToStep4}
                      style={{
                        padding: "8px 14px",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--accent)",
                        borderRadius: 8,
                        color: "var(--accent)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                      }}
                    >
                      <ArrowRight size={14} />
                      Continue to Integration
                    </button>
                  </>
                )}
              </div>
            )}

            {/* STEP 4: Integration */}
            {state.step === 4 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* IDs summary */}
                <div
                  style={{
                    padding: 12,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {[
                    { label: "Agent ID", value: state.agentId },
                    { label: "Environment ID", value: state.environmentId },
                    { label: "Session ID", value: state.sessionId },
                  ].map(({ label, value }) => (
                    <div
                      key={label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: "var(--text-secondary)",
                        }}
                      >
                        {label}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <code
                          style={{
                            fontSize: 11,
                            fontFamily: "monospace",
                            color: "var(--text-primary)",
                            background: "var(--bg-hover)",
                            padding: "2px 6px",
                            borderRadius: 4,
                          }}
                        >
                          {value || "N/A"}
                        </code>
                        {value && (
                          <button
                            onClick={() => copyToClipboard(value, label)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "var(--text-muted)",
                              padding: 0,
                              display: "flex",
                            }}
                          >
                            {copied === label ? (
                              <Check size={12} style={{ color: "var(--accent)" }} />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Go to Dashboard */}
                <a
                  href="/"
                  style={{
                    padding: "10px 16px",
                    background: "var(--accent)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    textDecoration: "none",
                  }}
                >
                  <ExternalLink size={16} />
                  Go to Dashboard
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ============ RIGHT PANEL: Config viewer ============ */}
        <div
          style={{
            flex: "0 0 60%",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {/* Tab bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid var(--border-color)",
              padding: "0 12px",
            }}
          >
            <div style={{ display: "flex", gap: 0 }}>
              {state.step < 4
                ? (["yaml", "json"] as const).map((fmt) => (
                    <button
                      key={fmt}
                      onClick={() => setConfigFormat(fmt)}
                      style={{
                        padding: "10px 16px",
                        background: "transparent",
                        border: "none",
                        borderBottom:
                          configFormat === fmt
                            ? "2px solid var(--accent)"
                            : "2px solid transparent",
                        color:
                          configFormat === fmt
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        fontSize: 13,
                        fontWeight: configFormat === fmt ? 600 : 400,
                        cursor: "pointer",
                        textTransform: "uppercase",
                      }}
                    >
                      {fmt}
                    </button>
                  ))
                : (["python", "typescript", "curl"] as const).map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setIntegrationTab(lang)}
                      style={{
                        padding: "10px 16px",
                        background: "transparent",
                        border: "none",
                        borderBottom:
                          integrationTab === lang
                            ? "2px solid var(--accent)"
                            : "2px solid transparent",
                        color:
                          integrationTab === lang
                            ? "var(--accent)"
                            : "var(--text-muted)",
                        fontSize: 13,
                        fontWeight: integrationTab === lang ? 600 : 400,
                        cursor: "pointer",
                      }}
                    >
                      {lang === "typescript"
                        ? "TypeScript"
                        : lang === "python"
                          ? "Python"
                          : "cURL"}
                    </button>
                  ))}
            </div>

            {/* Copy button */}
            <button
              onClick={() =>
                copyToClipboard(
                  state.step < 4
                    ? configText
                    : integrationSnippets[integrationTab],
                  "config"
                )
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 10px",
                background: "var(--bg-primary)",
                border: "1px solid var(--border-color)",
                borderRadius: 6,
                color: "var(--text-secondary)",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {copied === "config" ? (
                <Check size={12} style={{ color: "var(--accent)" }} />
              ) : (
                <Copy size={12} />
              )}
              {copied === "config" ? "Copied" : "Copy"}
            </button>
          </div>

          {/* Code area */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 16,
            }}
          >
            {state.step < 4 ? (
              Object.keys(state.config).length > 0 ? (
                <pre
                  style={{
                    margin: 0,
                    fontFamily:
                      "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                    fontSize: 12.5,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightedConfig }}
                />
              ) : (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    gap: 12,
                    color: "var(--text-muted)",
                  }}
                >
                  <Server size={32} />
                  <span style={{ fontSize: 13 }}>
                    Select a template to preview the configuration
                  </span>
                </div>
              )
            ) : (
              <pre
                style={{
                  margin: 0,
                  fontFamily:
                    "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: "var(--text-primary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {integrationSnippets[integrationTab]}
              </pre>
            )}
          </div>

          {/* Curl command display (for steps 1-3) */}
          {state.curlCommands.length > 0 && state.step < 4 && (
            <div
              style={{
                borderTop: "1px solid var(--border-color)",
                padding: 12,
                maxHeight: 180,
                overflowY: "auto",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  API Calls Made
                </span>
                <button
                  onClick={() =>
                    copyToClipboard(
                      state.curlCommands.join("\n\n"),
                      "curl"
                    )
                  }
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    background: "none",
                    border: "none",
                    color: "var(--text-muted)",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {copied === "curl" ? (
                    <Check size={10} style={{ color: "var(--accent)" }} />
                  ) : (
                    <Copy size={10} />
                  )}
                  Copy all
                </button>
              </div>
              {state.curlCommands.map((cmd, i) => (
                <pre
                  key={i}
                  style={{
                    margin: 0,
                    marginBottom: 8,
                    padding: 10,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border-color)",
                    borderRadius: 6,
                    fontFamily: "monospace",
                    fontSize: 11,
                    lineHeight: 1.5,
                    color: "var(--text-secondary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    overflowX: "auto",
                  }}
                >
                  {cmd}
                </pre>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Spinner keyframe animation */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
