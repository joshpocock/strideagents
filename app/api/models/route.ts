import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/models
 * Fetches available models from the Anthropic API.
 * Returns models sorted by most recently released first.
 */
export async function GET() {
  try {
    const client = getClient();
    const models: Array<{
      id: string;
      display_name: string;
      created_at: string;
      max_input_tokens: number | null;
      max_tokens: number | null;
    }> = [];

    // Fetch all available models using pagination
    for await (const model of client.models.list()) {
      models.push({
        id: model.id,
        display_name: model.display_name,
        created_at: model.created_at,
        max_input_tokens: model.max_input_tokens,
        max_tokens: model.max_tokens,
      });
    }

    return NextResponse.json(models);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch models";

    // Fallback to hardcoded list if API fails
    const fallbackModels = [
      { id: "claude-opus-4-6", display_name: "Claude Opus 4.6", created_at: "2026-02-04T00:00:00Z", max_input_tokens: null, max_tokens: null },
      { id: "claude-sonnet-4-6", display_name: "Claude Sonnet 4.6", created_at: "2026-02-04T00:00:00Z", max_input_tokens: null, max_tokens: null },
      { id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", created_at: "2025-10-01T00:00:00Z", max_input_tokens: null, max_tokens: null },
    ];

    return NextResponse.json(fallbackModels, {
      headers: { "X-Models-Source": "fallback" },
    });
  }
}
