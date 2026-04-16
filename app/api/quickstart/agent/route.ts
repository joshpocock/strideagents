import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";
import { getTemplate, TEMPLATES } from "@/lib/templates";

/**
 * POST /api/quickstart/agent
 *
 * Create an agent from a template or a free-form description.
 *
 * Body: { template_id: string } | { description: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { template_id, description } = body;

    if (!template_id && !description) {
      return NextResponse.json(
        { error: "template_id or description is required" },
        { status: 400 }
      );
    }

    const client = getClient();

    let name: string;
    let model: string;
    let system: string;
    let tools: Array<{ type: string; name?: string }>;
    let mcp_servers: Array<{ name: string; url: string }>;

    if (template_id) {
      const template = getTemplate(template_id);
      if (!template) {
        return NextResponse.json(
          {
            error: `Unknown template: ${template_id}. Available: ${TEMPLATES.map((t) => t.id).join(", ")}`,
          },
          { status: 400 }
        );
      }
      name = template.name;
      model = template.model;
      system = template.system;
      tools = template.tools;
      mcp_servers = template.mcp_servers;
    } else {
      // Generate config from free-form description using Claude Messages API
      const generation = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system:
          "You are an agent configuration generator. Given a user description, output a JSON object with fields: name (string, short), model (string, use claude-sonnet-4-6 unless the task needs opus-level reasoning), system (string, 3-5 paragraph system prompt), tools (array, always include {type: agent_toolset_20260401}), mcp_servers (array of {name, url}, empty if none needed). Output ONLY valid JSON, no markdown fences.",
        messages: [
          {
            role: "user",
            content: `Create an agent config for: ${description}`,
          },
        ],
      });

      const text =
        generation.content[0].type === "text"
          ? generation.content[0].text
          : "";

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "Failed to parse generated config", raw: text },
          { status: 500 }
        );
      }

      name = parsed.name || "Custom Agent";
      model = parsed.model || "claude-sonnet-4-6";
      system = parsed.system || "";
      tools = parsed.tools || [{ type: "agent_toolset_20260401" }];
      mcp_servers = parsed.mcp_servers || [];
    }

    // Build typed create params
    const mcpServersParam =
      mcp_servers.length > 0
        ? mcp_servers.map((s) => ({
            type: "url" as const,
            name: s.name,
            url: s.url,
          }))
        : undefined;

    // Build properly typed tools array
    const typedTools: Array<
      | { type: "agent_toolset_20260401" }
      | { type: "mcp_toolset"; mcp_server_name: string }
    > = [];
    for (const t of tools) {
      if (t.type === "agent_toolset_20260401") {
        typedTools.push({ type: "agent_toolset_20260401" });
      } else if (t.type === "mcp_toolset" && t.name) {
        typedTools.push({ type: "mcp_toolset", mcp_server_name: t.name });
      }
    }

    const agent = await client.beta.agents.create({
      name,
      model,
      ...(system && { system }),
      ...(typedTools.length > 0 && { tools: typedTools }),
      ...(mcpServersParam && { mcp_servers: mcpServersParam }),
    });

    // Build display payload for the config viewer
    const configDisplay: Record<string, unknown> = {
      name,
      model,
      ...(system && { system }),
      ...(tools.length > 0 && { tools }),
      ...(mcp_servers.length > 0 && { mcp_servers }),
    };

    // Build the equivalent curl command for display
    const curlBody = JSON.stringify(configDisplay, null, 2);
    const curl_command = `curl -X POST https://api.anthropic.com/v1/agents \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "content-type: application/json" \\
  -H "anthropic-beta: managed-agents-2026-04-01" \\
  -d '${curlBody.replace(/'/g, "'\\''")}'`;

    return NextResponse.json(
      { agent, curl_command, config: configDisplay },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to create agent";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
