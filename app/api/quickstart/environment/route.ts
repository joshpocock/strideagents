import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

/**
 * POST /api/quickstart/environment
 *
 * Create an environment with the specified networking mode.
 *
 * Body: { networking: "limited" | "unrestricted" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { networking } = body;

    if (!networking || !["limited", "unrestricted"].includes(networking)) {
      return NextResponse.json(
        { error: 'networking must be "limited" or "unrestricted"' },
        { status: 400 }
      );
    }

    const client = getClient();

    const envName = `quickstart-${networking}-${Date.now()}`;

    const networkingConfig =
      networking === "unrestricted"
        ? { type: "unrestricted" as const }
        : { type: "limited" as const, allow_mcp_servers: true };

    const environment = await client.beta.environments.create({
      name: envName,
      config: {
        type: "cloud",
        networking: networkingConfig,
      },
    });

    const configDisplay = {
      name: envName,
      config: { type: "cloud", networking: networkingConfig },
    };

    const curlBody = JSON.stringify(configDisplay, null, 2);
    const curl_command = `curl -X POST https://api.anthropic.com/v1/environments \\
  -H "x-api-key: $ANTHROPIC_API_KEY" \\
  -H "content-type: application/json" \\
  -H "anthropic-beta: managed-agents-2026-04-01" \\
  -d '${curlBody.replace(/'/g, "'\\''")}'`;

    return NextResponse.json(
      { environment, curl_command, config: configDisplay },
      { status: 201 }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create environment";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
