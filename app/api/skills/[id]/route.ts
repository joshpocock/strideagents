import { NextResponse } from "next/server";

/**
 * GET /api/skills/:id
 * Returns a single skill by ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Fetch all skills and find the one with the matching ID
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/skills`, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to fetch skills" },
        { status: 500 }
      );
    }

    const skills = await res.json();
    const skill = skills.find(
      (s: { id: string }) => s.id === id
    );

    if (!skill) {
      return NextResponse.json(
        { error: "Skill not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(skill);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to retrieve skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
