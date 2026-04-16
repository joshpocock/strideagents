"use client";

import { useEffect, useRef, useState } from "react";

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
};

interface CostData {
  inputTokens: number;
  outputTokens: number;
  model: string;
  sessionStartTime: string | null;
}

/**
 * Tracks token usage from an SSE stream URL by counting characters
 * in text_delta and tool_use events, estimating ~4 chars per token.
 */
export function useCostTracker(streamUrl: string | null): CostData {
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState<string | null>(null);

  useEffect(() => {
    if (!streamUrl) return;

    setInputTokens(0);
    setOutputTokens(0);
    setSessionStartTime(new Date().toISOString());

    const source = new EventSource(streamUrl);

    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const type = data.type || "";

        if (type === "content_block_delta") {
          if (data.delta?.type === "text_delta") {
            const chars = (data.delta.text || "").length;
            const tokens = Math.ceil(chars / 4);
            setOutputTokens((prev) => prev + tokens);
          } else if (data.delta?.type === "input_json_delta") {
            const chars = (data.delta.partial_json || "").length;
            const tokens = Math.ceil(chars / 4);
            setOutputTokens((prev) => prev + tokens);
          }
        } else if (type === "message_start" && data.message?.usage) {
          if (data.message.usage.input_tokens) {
            setInputTokens((prev) => prev + data.message.usage.input_tokens);
          }
        }
      } catch {
        // skip malformed events
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [streamUrl]);

  return {
    inputTokens,
    outputTokens,
    model: "claude-sonnet-4-6",
    sessionStartTime,
  };
}
