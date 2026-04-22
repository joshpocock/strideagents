"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Wrench, XCircle, Plug } from "lucide-react";
import type { ToolCallEvent } from "@/lib/types";

/**
 * Compact collapsible card showing a tool call in the chat transcript.
 * Collapsed by default — click to expand and see the input args + result.
 */

interface Props {
  call: ToolCallEvent;
}

function stringify(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function resultSummary(result: unknown): string {
  if (result === null || result === undefined) return "—";
  if (typeof result === "string") {
    const trimmed = result.trim();
    return trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed;
  }
  // content blocks: [{type:"text", text:"..."}] is the common MCP shape
  if (Array.isArray(result)) {
    const first = result[0] as Record<string, unknown> | undefined;
    if (first?.type === "text" && typeof first.text === "string") {
      const t = first.text.trim();
      return t.length > 80 ? t.slice(0, 80) + "…" : t;
    }
    return `${result.length} block${result.length === 1 ? "" : "s"}`;
  }
  return "see details";
}

export default function ToolCallCard({ call }: Props) {
  const [open, setOpen] = useState(false);
  const hasResult = call.result !== undefined && call.result !== null;

  const Icon = call.is_mcp ? Plug : Wrench;
  const accent = call.is_error
    ? "var(--error)"
    : call.is_mcp
    ? "var(--accent)"
    : "var(--text-secondary)";

  return (
    <div
      style={{
        marginTop: 8,
        marginBottom: 8,
        border: "1px solid var(--border-color)",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 8,
        background: "var(--bg-card)",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          textAlign: "left",
          cursor: "pointer",
          color: "var(--text-primary)",
        }}
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Icon size={13} color={accent} style={{ flexShrink: 0 }} />
        <code
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "var(--text-primary)",
            wordBreak: "break-all",
          }}
        >
          {call.name}
        </code>
        {call.is_error && (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 3,
              color: "var(--error)",
              fontSize: 11,
              fontWeight: 600,
              marginLeft: 4,
            }}
          >
            <XCircle size={11} />
            error
          </span>
        )}
        {!open && hasResult && (
          <span
            style={{
              fontSize: 11,
              color: "var(--text-muted)",
              marginLeft: "auto",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
            }}
            title={stringify(call.result)}
          >
            → {resultSummary(call.result)}
          </span>
        )}
        {!open && !hasResult && (
          <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: "auto" }}>
            in flight…
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            padding: "0 12px 10px 34px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {call.input !== undefined && call.input !== null && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Input
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  background: "var(--bg-input)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 240,
                  overflowY: "auto",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {stringify(call.input)}
              </pre>
            </div>
          )}
          {hasResult && (
            <div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                  color: "var(--text-muted)",
                  marginBottom: 4,
                }}
              >
                Result
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: "8px 10px",
                  background: "var(--bg-input)",
                  borderRadius: 6,
                  fontSize: 11,
                  color: call.is_error
                    ? "var(--error)"
                    : "var(--text-secondary)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  maxHeight: 320,
                  overflowY: "auto",
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
                }}
              >
                {stringify(call.result)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
