import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/health
 * Check whether the Anthropic API is reachable.
 */
export async function GET() {
  try {
    const client = getClient();
    await client.beta.agents.list();
    return NextResponse.json({ status: "connected" });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { status: "disconnected", error: message },
      { status: 200 }
    );
  }
}
