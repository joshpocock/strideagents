import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getAgentRun, updateAgentRunOutput } from "@/lib/db";

/**
 * POST /api/agent-runs/:id/capture
 *
 * Grabs the last agent text message from the session tied to this run and
 * stores it as agent_runs.output_preview. Called ~30-60s after a trigger by
 * the scheduler worker and by the UI after a manual "Run now", so the Run
 * history card can show what the agent produced without clicking through to
 * claude.ai.
 *
 * Truncated to ~2KB to keep the DB snappy. Safe to call repeatedly — each
 * call overwrites with the latest snapshot.
 */
const MAX_PREVIEW_CHARS = 2000;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const runId = parseInt(id, 10);
    if (isNaN(runId)) {
      return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
    }

    const run = getAgentRun(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
    if (!run.session_id) {
      return NextResponse.json(
        { error: "Run has no session_id — nothing to capture" },
        { status: 400 }
      );
    }

    const client = getClient();
    const page: any = await (client.beta as any).sessions.events.list(
      run.session_id,
      {}
    );
    const events: any[] = Array.isArray(page) ? page : page?.data ?? [];

    // Walk newest-to-oldest and pull the last agent text we can find. We
    // accept a few event shapes: agent.message (with content blocks) and
    // content_block_delta (streaming text deltas concatenated in-order).
    let preview = "";
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev?.type === "agent.message" && Array.isArray(ev.content)) {
        const chunks: string[] = [];
        for (const block of ev.content) {
          if (block?.type === "text" && typeof block.text === "string") {
            chunks.push(block.text);
          }
        }
        if (chunks.length > 0) {
          preview = chunks.join("\n").trim();
          break;
        }
      }
    }

    // Fallback: if no agent.message yet, stitch together text_delta chunks.
    if (!preview) {
      const parts: string[] = [];
      for (const ev of events) {
        if (
          ev?.type === "content_block_delta" &&
          ev?.delta?.type === "text_delta" &&
          typeof ev.delta.text === "string"
        ) {
          parts.push(ev.delta.text);
        }
      }
      preview = parts.join("").trim();
    }

    if (!preview) {
      return NextResponse.json({
        captured: false,
        reason: "No agent text yet — try again later.",
      });
    }

    const truncated =
      preview.length > MAX_PREVIEW_CHARS
        ? preview.slice(0, MAX_PREVIEW_CHARS) + "…"
        : preview;

    updateAgentRunOutput(runId, truncated);

    return NextResponse.json({
      captured: true,
      preview: truncated,
      chars: truncated.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to capture output";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
