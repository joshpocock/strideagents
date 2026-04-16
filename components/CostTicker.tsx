"use client";

import { useEffect, useState, useRef } from "react";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

const SESSION_RATE_PER_HOUR = 0.08;

interface CostTickerProps {
  inputTokens: number;
  outputTokens: number;
  model?: string;
  sessionStartTime?: string | null;
  compact?: boolean;
}

function formatCost(cost: number): string {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export default function CostTicker({
  inputTokens,
  outputTokens,
  model = "claude-sonnet-4-6",
  sessionStartTime,
  compact = false,
}: CostTickerProps) {
  const [runtimeCost, setRuntimeCost] = useState(0);
  const [animating, setAnimating] = useState(false);
  const prevCostRef = useRef(0);

  const pricing = MODEL_PRICING[model] || MODEL_PRICING["claude-sonnet-4-6"];
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  useEffect(() => {
    if (!sessionStartTime) return;

    const updateRuntime = () => {
      const elapsed =
        (Date.now() - new Date(sessionStartTime).getTime()) / 1000 / 3600;
      setRuntimeCost(elapsed * SESSION_RATE_PER_HOUR);
    };

    updateRuntime();
    const interval = setInterval(updateRuntime, 1000);
    return () => clearInterval(interval);
  }, [sessionStartTime]);

  const totalCost = inputCost + outputCost + runtimeCost;

  useEffect(() => {
    if (totalCost !== prevCostRef.current) {
      setAnimating(true);
      const timeout = setTimeout(() => setAnimating(false), 400);
      prevCostRef.current = totalCost;
      return () => clearTimeout(timeout);
    }
  }, [totalCost]);

  if (compact) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 0",
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--text-secondary)",
        }}
      >
        <span
          style={{
            color: animating ? "var(--accent)" : "var(--text-primary)",
            fontWeight: 600,
            fontSize: 12,
            transition: "color 0.3s ease",
          }}
        >
          {formatCost(totalCost)}
        </span>
        <span style={{ color: "var(--text-muted)" }}>
          {formatTokens(inputTokens)} in / {formatTokens(outputTokens)} out
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
        background: "var(--bg-card)",
        border: "1px solid var(--bg-card-border)",
        borderRadius: 8,
        fontSize: 13,
        fontFamily: "monospace",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>Cost</span>
        <span
          style={{
            color: animating ? "var(--accent)" : "var(--text-primary)",
            fontWeight: 700,
            fontSize: 15,
            transition: "color 0.3s ease",
          }}
        >
          {formatCost(totalCost)}
        </span>
      </div>

      <div
        style={{
          width: 1,
          height: 20,
          background: "var(--border-color)",
        }}
      />

      <div style={{ display: "flex", gap: 12, color: "var(--text-secondary)", fontSize: 12 }}>
        <span>
          <span style={{ color: "var(--text-muted)" }}>In: </span>
          {formatTokens(inputTokens)}
        </span>
        <span>
          <span style={{ color: "var(--text-muted)" }}>Out: </span>
          {formatTokens(outputTokens)}
        </span>
        {sessionStartTime && (
          <span>
            <span style={{ color: "var(--text-muted)" }}>Runtime: </span>
            {formatCost(runtimeCost)}
          </span>
        )}
      </div>

      <div
        style={{
          marginLeft: "auto",
          fontSize: 11,
          color: "var(--text-muted)",
        }}
      >
        {model}
      </div>
    </div>
  );
}
