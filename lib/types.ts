// ---------------------------------------------------------------------------
// Anthropic API response types (Managed Agents beta)
// These mirror the shapes returned by the SDK beta methods.
// ---------------------------------------------------------------------------

export type AgentModel =
  | string
  | { id: string; speed?: "standard" | "fast" | null };

export interface Agent {
  id: string;
  name: string;
  description?: string;
  model: AgentModel;
  system?: string;
  tools?: AgentTool[];
  mcp_servers?: McpServer[];
  created_at?: string;
  updated_at?: string;
}

/**
 * The Managed Agents API returns `model` as an object `{ id, speed }`, but
 * older code and form state treat it as a plain string id. This helper
 * normalizes either form to a string id for rendering and API writes.
 */
export function getModelId(model: AgentModel | undefined): string {
  if (!model) return "";
  return typeof model === "string" ? model : model.id;
}

export interface AgentTool {
  type: string;
  name?: string;
  [key: string]: unknown;
}

export interface McpServer {
  url: string;
  name?: string;
  [key: string]: unknown;
}

export type PackageManager = "apt" | "cargo" | "gem" | "go" | "npm" | "pip";

export interface EnvironmentPackages {
  apt?: string[];
  cargo?: string[];
  gem?: string[];
  go?: string[];
  npm?: string[];
  pip?: string[];
}

export interface EnvironmentNetworking {
  type: "unrestricted" | "limited";
  allow_mcp_servers?: boolean;
  allow_package_managers?: boolean;
  allowed_hosts?: string[];
}

export interface EnvironmentConfig {
  type: "cloud";
  networking?: EnvironmentNetworking;
  packages?: EnvironmentPackages;
}

export interface Environment {
  id: string;
  name: string;
  description?: string;
  config?: EnvironmentConfig;
  metadata?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
}

export interface Session {
  id: string;
  agent_id: string;
  environment_id?: string;
  status?: string;
  created_at?: string;
}

export interface Vault {
  id: string;
  name: string;
  metadata?: Record<string, string>;
  created_at?: string;
}

export interface Credential {
  id: string;
  vault_id: string;
  display_name: string;
  auth: CredentialAuth;
  metadata?: Record<string, string>;
  created_at?: string;
}

export interface CredentialAuth {
  type: string;
  token?: string;
  mcp_server_url?: string;
}

// ---------------------------------------------------------------------------
// Local state types (SQLite)
// ---------------------------------------------------------------------------

export interface BoardTask {
  id: number;
  title: string;
  description: string;
  status: "todo" | "in_progress" | "done" | "failed";
  agent_id: string | null;
  environment_id: string | null;
  session_id: string | null;
  result: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatSession {
  chat_id: string;
  agent_id: string;
  environment_id: string;
  session_id: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Chat types
// ---------------------------------------------------------------------------

export interface ToolCallEvent {
  id: string;
  name: string;
  input?: unknown;
  result?: unknown;
  is_error?: boolean;
  /** True for MCP tool calls (agent.mcp_tool_use) vs built-in tools. */
  is_mcp?: boolean;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: string;
  /** Tool calls the agent made while producing this assistant message. */
  tool_calls?: ToolCallEvent[];
}

// ---------------------------------------------------------------------------
// SSE event types (streamed from the Anthropic sessions API)
// ---------------------------------------------------------------------------

export interface SSEEvent {
  event: string;
  data: unknown;
}

export interface SessionEvent {
  type: string;
  message?: {
    role: string;
    content: Array<{ type: string; text?: string }>;
  };
  [key: string]: unknown;
}
