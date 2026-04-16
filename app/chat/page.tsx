"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw } from "lucide-react";
import type { Agent, ChatMessage } from "@/lib/types";

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default function ChatPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentId, setAgentId] = useState("");
  const [chatId, setChatId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/agents")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Agent[]) => {
        setAgents(data);
        if (data.length > 0) setAgentId(data[0].id);
      })
      .catch(() => {});

    const stored = localStorage.getItem("managed_agents_chat_id");
    if (stored) {
      setChatId(stored);
    } else {
      const id = generateId();
      localStorage.setItem("managed_agents_chat_id", id);
      setChatId(id);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
        body: JSON.stringify({ chat_id: chatId, message: text, agent_id: agentId }),
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
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: data.response || data.text || JSON.stringify(data),
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
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
    setMessages([]);
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "calc(100vh - 56px - 48px)",
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
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          style={{ padding: "8px 12px", fontSize: 14 }}
        >
          {agents.length === 0 && <option value="">No agents available</option>}
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
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
        {messages.length === 0 && (
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
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                maxWidth: "70%",
                padding: "12px 16px",
                borderRadius: 12,
                fontSize: 14,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                ...(msg.role === "user"
                  ? {
                      background: "var(--accent)",
                      color: "#FFFFFF",
                      borderBottomRightRadius: 4,
                    }
                  : {
                      background: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                      borderBottomLeftRadius: 4,
                    }),
              }}
            >
              {msg.content}
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
  );
}
