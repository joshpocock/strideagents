import { NextResponse } from "next/server";

/**
 * POST /api/skills/install
 * Installs an Anthropic skill for the current workspace via the Skills API.
 *
 * Body: {
 *   anthropic_skill_id: string,
 *   name?: string,
 *   description?: string,
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { anthropic_skill_id, name, description } = body;

    if (!anthropic_skill_id) {
      return NextResponse.json(
        { error: "anthropic_skill_id is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY is not configured" },
        { status: 500 }
      );
    }

    // Install/clone the skill into the user's workspace via POST /v1/skills
    const res = await fetch("https://api.anthropic.com/v1/skills", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "managed-agents-2026-04-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source_skill_id: anthropic_skill_id,
        ...(name && { name }),
        ...(description && { description }),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Install failed: ${errText || res.statusText}` },
        { status: res.status }
      );
    }

    const installed = await res.json();
    return NextResponse.json(installed, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to install skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
