"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Send,
  RotateCcw,
  PanelLeftOpen,
  PanelLeftClose,
  MessageSquare,
  Bot,
  Trash2,
  ExternalLink,
  Copy,
  Check,
} from "lucide-react";
import type { Agent, ChatMessage, Environment, ToolCallEvent } from "@/lib/types";
import { useToast } from "@/components/Toast";
import Markdown from "@/components/Markdown";
import ToolCallCard from "@/components/ToolCallCard";

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

interface ChatHistoryItem {
  chat_id: string;
  agent_id: string;
  agent_name: string;
  environment_id: string;
  session_id: string;
  created_at: string;
}

export default function ChatPage() {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [environmentId, setEnvironmentId] = useState("");
  const [chatId, setChatId] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<ChatHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/history");
      if (res.ok) {
        const data = await res.json();
        setHistory(Array.isArray(data) ? data : []);
      }
    } catch {
      /* ignore */
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Agent[]) => {
        const list = Array.isArray(data) ? data : [];
        setAgents(list);
        if (list.length > 0) setAgentId(list[0].id);
      })
      .catch(() => {});

    fetch("/api/environments")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list: Environment[] = Array.isArray(data)
          ? data
          : (data?.data ?? []);
        setEnvironments(list);
        const firstActive = list.find((e) => !e.archived_at) ?? list[0];
        if (firstActive?.id) setEnvironmentId(firstActive.id);
      })
      .catch(() => {});

    fetchHistory();

    const resumeSession = searchParams.get("session");
    const resumeAgent = searchParams.get("agent");

    if (resumeSession) {
      const cid = `resume-${resumeSession}`;
      setChatId(cid);
      setSessionId(resumeSession);
      if (resumeAgent) setAgentId(resumeAgent);
      localStorage.setItem("managed_agents_chat_id", cid);

      fetch("/api/chat/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: cid,
          session_id: resumeSession,
          agent_id: resumeAgent || "",
          environment_id: "",
        }),
      }).catch(() => {});

      setLoadingHistory(true);
      fetch(`/api/sessions/${resumeSession}/replay`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data?.events) return;
          const hist: ChatMessage[] = [];
          // Tool calls attach to the next agent.message that follows them.
          let pendingToolCalls: ToolCallEvent[] = [];
          const pendingToolUses = new Map<string, ToolCallEvent>();
          for (const ev of data.events as Array<{
            rawType: string;
            description?: string;
            timestamp?: string;
            detail?: Record<string, unknown>;
          }>) {
            const rt = ev.rawType;
            const detail = ev.detail ?? {};
            if (rt === "user.message") {
              hist.push({
                role: "user",
                content: ev.description || "",
                timestamp: ev.timestamp,
              });
              pendingToolCalls = [];
              pendingToolUses.clear();
            } else if (rt === "agent.message") {
              hist.push({
                role: "assistant",
                content: ev.description || "",
                timestamp: ev.timestamp,
                tool_calls: pendingToolCalls.length ? pendingToolCalls : undefined,
              });
              pendingToolCalls = [];
              pendingToolUses.clear();
            } else if (rt === "agent.tool_use" || rt === "agent.mcp_tool_use") {
              const id =
                (detail.id as string) ||
                (detail.tool_use_id as string) ||
                `tu-${pendingToolCalls.length}`;
              const call: ToolCallEvent = {
                id,
                name:
                  (detail.name as string) ||
                  (detail.tool_name as string) ||
                  "unknown",
                input: (detail.input as unknown) ?? (detail.tool_input as unknown) ?? null,
                is_mcp: rt === "agent.mcp_tool_use",
              };
              pendingToolCalls.push(call);
              pendingToolUses.set(id, call);
            } else if (rt === "agent.tool_result" || rt === "agent.mcp_tool_result") {
              const tuId =
                (detail.tool_use_id as string) ||
                (detail.mcp_tool_use_id as string) ||
                (detail.id as string);
              const existing = tuId ? pendingToolUses.get(tuId) : undefined;
              const resultPayload =
                (detail.content as unknown) ?? (detail.result as unknown) ?? null;
              if (existing) {
                existing.result = resultPayload;
                existing.is_error = Boolean(detail.is_error);
              }
            }
          }
          setMessages(hist);
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false));

      window.history.replaceState({}, "", "/chat");
    } else {
      const stored = localStorage.getItem("managed_agents_chat_id");
      if (stored) {
        setChatId(stored);
      } else {
        const id = generateId();
        localStorage.setItem("managed_agents_chat_id", id);
        setChatId(id);
      }
    }
  }, [searchParams, fetchHistory]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadChat = async (item: ChatHistoryItem) => {
    setChatId(item.chat_id);
    setSessionId(item.session_id);
    if (item.agent_id) setAgentId(item.agent_id);
    localStorage.setItem("managed_agents_chat_id", item.chat_id);

    // Load message history from the session replay
    setMessages([]);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/sessions/${item.session_id}/replay`);
      if (res.ok) {
        const data = await res.json();
        if (data?.events) {
          const hist: ChatMessage[] = [];
          for (const ev of data.events as Array<{
            rawType: string;
            description?: string;
            timestamp?: string;
          }>) {
            if (ev.rawType === "user.message") {
              hist.push({
                role: "user",
                content: ev.description || "",
                timestamp: ev.timestamp,
              });
            } else if (ev.rawType === "agent.message") {
              hist.push({
                role: "assistant",
                content: ev.description || "",
                timestamp: ev.timestamp,
              });
            }
          }
          setMessages(hist);
        }
      }
    } catch {
      showToast("Failed to load conversation", "error");
    } finally {
      setLoadingHistory(false);
    }
  };

  const deleteChat = async (chatIdToDelete: string) => {
    try {
      const res = await fetch("/api/chat/history", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatIdToDelete }),
      });
      if (res.ok) {
        setHistory((prev) => prev.filter((h) => h.chat_id !== chatIdToDelete));
        if (chatId === chatIdToDelete) {
          startNewChat();
        }
        showToast("Chat deleted", "success");
      }
    } catch {
      showToast("Failed to delete chat", "error");
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || !agentId || sending) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message: text,
          agent_id: agentId,
          ...(environmentId && { environment_id: environmentId }),
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `Error: ${err}` },
        ]);
        return;
      }

      const data = await res.json();
      if (data.session_id) setSessionId(data.session_id);
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response || data.text || JSON.stringify(data),
        timestamp: new Date().toISOString(),
        tool_calls: Array.isArray(data.tool_calls)
          ? (data.tool_calls as ToolCallEvent[])
          : undefined,
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Refresh history after first message creates a session
      fetchHistory();
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Network error: ${err instanceof Error ? err.message : "Unknown"}`,
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewChat = () => {
    const id = generateId();
    localStorage.setItem("managed_agents_chat_id", id);
    setChatId(id);
    setSessionId(null);
    setMessages([]);
  };

  // Group history by date
  const groupedHistory = groupByDate(history);

  return (
    <div
      style={{
        display: "flex",
        height: "calc(100vh - 56px - 48px)",
        gap: 0,
      }}
    >
      {/* History sidebar */}
      {sidebarOpen && (
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            background: "var(--bg-secondary)",
            marginLeft: -24,
            marginTop: -24,
            marginBottom: -24,
            paddingTop: 16,
          }}
        >
          {/* Sidebar header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px 12px",
              borderBottom: "1px solid var(--border-color)",
            }}
          >
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                letterSpacing: "0.4px",
              }}
            >
              Chat History
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              style={{
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                cursor: "pointer",
                padding: 4,
                display: "flex",
                borderRadius: 4,
              }}
              title="Close sidebar"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>

          {/* New chat button */}
          <div style={{ padding: "12px 12px 8px" }}>
            <button
              onClick={startNewChat}
              className="btn-primary"
              style={{
                width: "100%",
                padding: "8px 12px",
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              <RotateCcw size={14} />
              New Chat
            </button>
          </div>

          {/* History list */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "4px 8px",
            }}
          >
            {historyLoading ? (
              <div
                style={{
                  padding: 16,
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                Loading...
              </div>
            ) : history.length === 0 ? (
              <div
                style={{
                  padding: "24px 12px",
                  textAlign: "center",
                  color: "var(--text-muted)",
                  fontSize: 13,
                }}
              >
                <MessageSquare
                  size={24}
                  style={{ margin: "0 auto 8px", display: "block", opacity: 0.4 }}
                />
                No conversations yet.
                <br />
                Send a message to get started.
              </div>
            ) : (
              Object.entries(groupedHistory).map(([dateLabel, items]) => (
                <div key={dateLabel} style={{ marginBottom: 8 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                      padding: "8px 8px 4px",
                    }}
                  >
                    {dateLabel}
                  </div>
                  {items.map((item) => {
                    const isActive = chatId === item.chat_id;
                    return (
                      <div
                        key={item.chat_id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                          marginBottom: 2,
                        }}
                      >
                        <button
                          onClick={() => loadChat(item)}
                          style={{
                            flex: 1,
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                            padding: "10px 10px",
                            borderRadius: 8,
                            border: "none",
                            background: isActive
                              ? "var(--accent-subtle)"
                              : "transparent",
                            cursor: "pointer",
                            textAlign: "left",
                            transition: "background 0.1s",
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive)
                              e.currentTarget.style.background =
                                "var(--bg-card-hover)";
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive)
                              e.currentTarget.style.background = "transparent";
                          }}
                        >
                          <Bot
                            size={16}
                            style={{
                              flexShrink: 0,
                              color: isActive
                                ? "var(--accent)"
                                : "var(--text-muted)",
                            }}
                          />
                          <div
                            style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                fontSize: 13,
                                fontWeight: isActive ? 600 : 400,
                                color: isActive
                                  ? "var(--text-primary)"
                                  : "var(--text-secondary)",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.agent_name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "var(--text-muted)",
                                marginTop: 1,
                              }}
                            >
                              {formatTime(item.created_at)}
                            </div>
                          </div>
                        </button>
                        {/* Session link + delete */}
                        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                          <Link
                            href={`/sessions/${item.session_id}`}
                            onClick={(e) => e.stopPropagation()}
                            title="View session details"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 26,
                              height: 26,
                              borderRadius: 4,
                              color: "var(--text-muted)",
                              textDecoration: "none",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-card-hover)";
                              e.currentTarget.style.color =
                                "var(--text-secondary)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--text-muted)";
                            }}
                          >
                            <ExternalLink size={12} />
                          </Link>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteChat(item.chat_id);
                            }}
                            title="Delete chat"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              width: 26,
                              height: 26,
                              borderRadius: 4,
                              border: "none",
                              background: "transparent",
                              color: "var(--text-muted)",
                              cursor: "pointer",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background =
                                "var(--bg-card-hover)";
                              e.currentTarget.style.color = "var(--error)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "transparent";
                              e.currentTarget.style.color = "var(--text-muted)";
                            }}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
          paddingLeft: sidebarOpen ? 20 : 0,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="btn-secondary"
              style={{
                padding: "8px 10px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              title="Show chat history"
            >
              <PanelLeftOpen size={16} />
            </button>
          )}
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 14 }}
          >
            {agents.length === 0 && (
              <option value="">No agents available</option>
            )}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <select
            value={environmentId}
            onChange={(e) => setEnvironmentId(e.target.value)}
            style={{ padding: "8px 12px", fontSize: 14 }}
          >
            {environments.length === 0 && (
              <option value="">No environments available</option>
            )}
            {environments.map((env) => (
              <option key={env.id} value={env.id}>
                {env.name}
              </option>
            ))}
          </select>
          {sessionId && (
            <Link
              href={`/sessions/${sessionId}`}
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--accent)";
                e.currentTarget.style.borderColor = "var(--accent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-muted)";
                e.currentTarget.style.borderColor = "var(--border-color)";
              }}
            >
              <ExternalLink size={12} />
              Session
            </Link>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={startNewChat}
            className="btn-secondary"
            style={{ padding: "8px 14px", fontSize: 13, gap: 6 }}
          >
            <RotateCcw size={14} />
            New Chat
          </button>
        </div>

        {/* Messages */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            paddingBottom: 16,
          }}
        >
          {loadingHistory && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 14,
              }}
            >
              Loading conversation history...
            </div>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--text-muted)",
                fontSize: 15,
              }}
            >
              Select an agent and send a message to start a conversation.
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent:
                  msg.role === "user" ? "flex-end" : "flex-start",
              }}
            >
              <div style={{ maxWidth: "70%" }}>
                {msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {msg.tool_calls.map((call) => (
                      <ToolCallCard key={call.id} call={call} />
                    ))}
                  </div>
                )}
                {msg.content && msg.content.trim() && (
                  <div
                    style={{
                      padding: "12px 16px",
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      borderBottomLeftRadius: msg.role === "user" ? 12 : 4,
                      borderBottomRightRadius: msg.role === "user" ? 4 : 12,
                      fontSize: 14,
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                      ...(msg.role === "user"
                        ? {
                            background: "var(--accent)",
                            color: "#FFFFFF",
                            whiteSpace: "pre-wrap" as const,
                          }
                        : {
                            background: "var(--bg-card)",
                            border: "1px solid var(--border-color)",
                            color: "var(--text-primary)",
                          }),
                    }}
                  >
                    {msg.role === "assistant" ? (
                      <Markdown content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </div>
                )}
                {msg.role === "assistant" && msg.content && (
                  <CopyButton text={msg.content} />
                )}
              </div>
            </div>
          ))}
          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 12,
                  borderBottomLeftRadius: 4,
                  padding: "12px 16px",
                  color: "var(--text-secondary)",
                  fontSize: 14,
                }}
              >
                Thinking...
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div
          style={{
            display: "flex",
            gap: 8,
            paddingTop: 12,
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            rows={1}
            style={{
              flex: 1,
              resize: "none",
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || !agentId || sending}
            className="btn-primary"
            style={{
              padding: "12px 20px",
              opacity: !input.trim() || !agentId || sending ? 0.5 : 1,
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ marginTop: 4, display: "flex" }}>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(text).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          padding: "3px 8px",
          borderRadius: 4,
          border: "none",
          background: "transparent",
          color: copied ? "var(--success)" : "var(--text-muted)",
          cursor: "pointer",
          fontSize: 11,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={(e) => { if (!copied) e.currentTarget.style.color = "var(--text-muted)"; }}
      >
        {copied ? <Check size={11} /> : <Copy size={11} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function groupByDate(
  items: ChatHistoryItem[]
): Record<string, ChatHistoryItem[]> {
  const groups: Record<string, ChatHistoryItem[]> = {};
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  for (const item of items) {
    const d = new Date(item.created_at);
    let label: string;
    if (d >= today) {
      label = "Today";
    } else if (d >= yesterday) {
      label = "Yesterday";
    } else if (d >= weekAgo) {
      label = "This Week";
    } else {
      label = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    }
    if (!groups[label]) groups[label] = [];
    groups[label].push(item);
  }

  return groups;
}
