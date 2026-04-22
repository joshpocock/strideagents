"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ChevronDown, FileJson, FileText } from "lucide-react";
import { exportAsJson, exportAsMarkdown } from "@/lib/export";
import CostTicker from "./CostTicker";
import { useCostTracker } from "@/lib/useCostTracker";

interface LogEntry {
  type: string;
  text: string;
  timestamp: string;
}

interface SessionEventLogProps {
  streamUrl: string | null;
  compact?: boolean;
  sessionName?: string;
}

const typeColors: Record<string, string> = {
  tool_use: "var(--accent)",
  text_delta: "var(--text-primary)",
  status: "var(--success)",
  error: "var(--error)",
};

export default function SessionEventLog({
  streamUrl,
  compact = false,
  sessionName,
}: SessionEventLogProps) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const costData = useCostTracker(streamUrl);

  useEffect(() => {
    if (!streamUrl) return;

    setEntries([]);
    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const rawType = data.type || "unknown";
        let type: string = "unknown";
        let text = "";

        // Managed Agents event shapes (primary — what board streams today)
        if (rawType === "agent.message" && Array.isArray(data.content)) {
          type = "text_delta";
          text = data.content
            .filter((b: any) => b?.type === "text" && typeof b.text === "string")
            .map((b: any) => b.text)
            .join("");
          if (!text) return;
        } else if (
          rawType === "agent.tool_use" ||
          rawType === "agent.mcp_tool_use" ||
          rawType === "agent.custom_tool_use"
        ) {
          type = "tool_use";
          const name = data.name || data.tool_name || "tool";
          text = `Using tool: ${name}`;
        } else if (
          rawType === "agent.tool_result" ||
          rawType === "agent.mcp_tool_result"
        ) {
          type = "tool_use";
          const summary = Array.isArray(data.content)
            ? (data.content.find((b: any) => b?.type === "text")?.text ?? "result")
            : "result";
          text = `Tool result: ${String(summary).slice(0, 120)}`;
        } else if (rawType === "agent.thinking") {
          type = "status";
          text = "Agent thinking…";
        } else if (rawType === "session.status_running") {
          type = "status";
          text = "Session running";
        } else if (rawType === "session.status_idle") {
          type = "status";
          text = "Session idle";
        } else if (rawType === "session.status_terminated") {
          type = "status";
          text = "Session terminated";
        } else if (rawType === "session.error" || rawType === "error") {
          type = "error";
          text =
            data.error?.message ||
            data.message ||
            "Session error";
        } else if (rawType === "task_status") {
          type = "status";
          text = `Task ${data.status || "started"}`;
        } else if (rawType === "task_complete") {
          type = "status";
          text = `Task ${data.status || "done"}`;
        }

        // Fall back for legacy Messages-API shapes (older flows / local testing)
        else if (rawType === "content_block_start" && data.content_block?.type === "tool_use") {
          type = "tool_use";
          text = `Using tool: ${data.content_block.name}`;
        } else if (rawType === "content_block_delta") {
          if (data.delta?.type === "text_delta") {
            type = "text_delta";
            text = data.delta.text || "";
          } else if (data.delta?.type === "input_json_delta") {
            type = "tool_use";
            text = data.delta.partial_json || "";
          } else {
            return;
          }
        } else if (rawType === "message_start" || rawType === "message_stop") {
          type = "status";
          text = rawType === "message_start" ? "Agent started" : "Agent finished";
        } else {
          // Unknown type — skip.
          return;
        }

        const entry: LogEntry = {
          type,
          text,
          timestamp: new Date().toLocaleTimeString(),
        };

        setEntries((prev) => {
          if (
            type === "text_delta" &&
            prev.length > 0 &&
            prev[prev.length - 1].type === "text_delta"
          ) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...updated[updated.length - 1],
              text: updated[updated.length - 1].text + text,
            };
            return updated;
          }
          return [...prev, entry];
        });
      } catch {
        // skip malformed events
      }
    };

    source.onerror = () => {
      setEntries((prev) => [
        ...prev,
        { type: "status", text: "Stream ended", timestamp: new Date().toLocaleTimeString() },
      ]);
      source.close();
    };

    return () => source.close();
  }, [streamUrl]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    if (exportOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [exportOpen]);

  const maxHeight = compact ? 160 : 400;

  return (
    <div>
      {/* Cost ticker (full mode) */}
      {!compact && streamUrl && (
        <CostTicker
          inputTokens={costData.inputTokens}
          outputTokens={costData.outputTokens}
          model={costData.model}
          sessionStartTime={costData.sessionStartTime}
        />
      )}

      {/* Export controls */}
      {!compact && entries.length > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginBottom: 8,
            position: "relative",
          }}
          ref={dropdownRef}
        >
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="btn-secondary"
            style={{
              padding: "6px 12px",
              fontSize: 12,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Download size={14} />
            Export
            <ChevronDown size={12} />
          </button>
          {exportOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
                overflow: "hidden",
                zIndex: 10,
                minWidth: 180,
              }}
            >
              <button
                onClick={() => {
                  exportAsJson(entries, sessionName);
                  setExportOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                <FileJson size={16} color="var(--accent)" />
                Export as JSON
              </button>
              <button
                onClick={() => {
                  exportAsMarkdown(entries, sessionName);
                  setExportOpen(false);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderTop: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  fontSize: 13,
                  cursor: "pointer",
                  textAlign: "left",
                  transition: "background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "transparent";
                }}
              >
                <FileText size={16} color="var(--accent)" />
                Export as Markdown
              </button>
            </div>
          )}
        </div>
      )}

      {/* Log entries */}
      <div
        style={{
          background: "var(--bg-input)",
          borderRadius: 8,
          padding: compact ? 8 : 12,
          maxHeight,
          overflowY: "auto",
          fontSize: compact ? 12 : 13,
          fontFamily: "monospace",
          lineHeight: 1.6,
        }}
      >
        {entries.length === 0 && (
          <span style={{ color: "var(--text-muted)" }}>Waiting for events...</span>
        )}
        {entries.map((entry, i) => (
          <div key={i} style={{ marginBottom: 2 }}>
            {!compact && (
              <span style={{ color: "var(--text-muted)", marginRight: 8 }}>
                {entry.timestamp}
              </span>
            )}
            <span style={{ color: typeColors[entry.type] || "var(--text-secondary)" }}>
              {entry.text}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
