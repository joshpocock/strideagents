import { NextResponse } from "next/server";
import { deleteRoutine } from "@/lib/db";

/**
 * DELETE /api/routines/:id
 * Removes a routine from SQLite.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const removed = deleteRoutine(numId);
    if (!removed) {
      return NextResponse.json({ error: "Routine not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete routine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
