import { NextResponse } from "next/server";
import {
  getAgentSchedule,
  upsertAgentSchedule,
  deleteAgentSchedule,
} from "@/lib/db";

/**
 * GET /api/agents/:id/schedule — return saved schedule (or 404)
 * PUT /api/agents/:id/schedule — create or replace schedule
 *   Body: { cron_schedule, environment_id?, prompt? }
 * DELETE /api/agents/:id/schedule — remove schedule
 */

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const schedule = getAgentSchedule(id);
  if (!schedule) return NextResponse.json({ error: "No schedule" }, { status: 404 });
  return NextResponse.json(schedule);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { cron_schedule, environment_id, prompt } = body;

    if (!cron_schedule || typeof cron_schedule !== "string") {
      return NextResponse.json(
        { error: "cron_schedule is required" },
        { status: 400 }
      );
    }

    const schedule = upsertAgentSchedule({
      agent_id: id,
      cron_schedule,
      environment_id: environment_id ?? null,
      prompt: prompt ?? null,
    });

    return NextResponse.json(schedule);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save schedule";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const removed = deleteAgentSchedule(id);
  if (!removed) return NextResponse.json({ error: "No schedule" }, { status: 404 });
  return NextResponse.json({ success: true });
}
