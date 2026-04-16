import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * GET /api/agents
 * List all agents from the Anthropic Managed Agents API.
 */
export async function GET() {
  try {
    const client = getClient();
    const response: any = await (client.beta as any).agents.list();
    // Normalize paginated response to plain array
    const agents = Array.isArray(response)
      ? response
      : (response?.data ?? []);
    return NextResponse.json(agents);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to list agents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * Create a new agent.
 *
 * Body: { name, model, system?, tools?, mcp_servers?, description? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, model, system, tools, mcp_servers, description } = body;

    if (!name || !model) {
      return NextResponse.json(
        { error: "name and model are required" },
        { status: 400 }
      );
    }

    const client = getClient();
    const agent = await client.beta.agents.create({
      name,
      model,
      ...(system && { system }),
      ...(tools && { tools }),
      ...(mcp_servers && { mcp_servers }),
      ...(description && { description }),
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to create agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
