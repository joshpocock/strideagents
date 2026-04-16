import { NextResponse } from "next/server";
import { getRoutine, updateRoutineLastFired } from "@/lib/db";

/**
 * POST /api/routines/:id/fire
 * Fires a routine via the Anthropic API using Bearer auth.
 * Body: { text?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const routine = getRoutine(numId);
    if (!routine) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const payload: Record<string, unknown> = {};
    if (body.text) {
      payload.text = body.text;
    }

    const res = await fetch(
      `https://api.anthropic.com/v1/claude_code/routines/${routine.routine_id}/fire`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${routine.token}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "experimental-cc-routine-2026-04-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Anthropic API error (${res.status}): ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Update last fired metadata
    const now = new Date().toISOString();
    const sessionUrl = data.claude_code_session_url || "";
    updateRoutineLastFired(numId, now, sessionUrl);

    return NextResponse.json({
      ...data,
      last_fired_at: now,
      last_session_url: sessionUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to fire routine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
