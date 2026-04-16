import { NextResponse } from "next/server";
import { getRoutines, createRoutine } from "@/lib/db";

/**
 * Mask a token so only the last 4 characters are visible.
 */
function maskToken(token: string): string {
  if (token.length <= 16) return "sk-ant-oat01-...****";
  return token.slice(0, 14) + "..." + token.slice(-4);
}

/**
 * GET /api/routines
 * Returns all routines with masked tokens.
 */
export async function GET() {
  try {
    const routines = getRoutines();
    const masked = routines.map((r) => ({
      ...r,
      token: maskToken(r.token),
    }));
    return NextResponse.json(masked);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list routines";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/routines
 * Create a new routine.
 * Body: { name, routine_id, token, description?, trigger_type? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, routine_id, token, description, trigger_type } = body;

    if (!name || !routine_id || !token) {
      return NextResponse.json(
        { error: "name, routine_id, and token are required" },
        { status: 400 }
      );
    }

    const routine = createRoutine({
      name,
      routine_id,
      token,
      description,
      trigger_type,
    });

    return NextResponse.json(
      { ...routine, token: maskToken(routine.token) },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create routine";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
