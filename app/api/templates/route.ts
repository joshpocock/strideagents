import { NextResponse } from "next/server";
import { getClient } from "@/lib/anthropic";

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  model: string;
  type: "agent" | "routine";
  system: string;
  tools: { type: string }[];
}

const templates: TemplateDefinition[] = [
  {
    id: "deep-researcher",
    name: "Deep Researcher",
    description:
      "Searches the web, synthesizes information from multiple sources, and writes structured reports with citations.",
    model: "claude-sonnet-4-20250514",
    type: "agent",
    system:
      "You are a research analyst. When given a topic:\n\n1. Search the web for recent, authoritative sources (at least 5 different searches).\n2. Read the most relevant pages to gather detailed information.\n3. Synthesize your findings into a well-structured markdown report.\n4. Save the report to /workspace/report.md.\n5. Save a sources list to /workspace/sources.md with URLs and brief descriptions.\n\nYour report should include:\n- Executive summary (2-3 sentences)\n- Key findings (organized by theme)\n- Data points and statistics where available\n- Open questions or areas needing further research\n\nBe thorough but concise. Cite your sources inline using [Source Name](URL) format.",
    tools: [{ type: "agent_toolset_20260401" }],
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description:
      "Reviews pull requests for bugs, security vulnerabilities, style issues, and improvement opportunities.",
    model: "claude-sonnet-4-20250514",
    type: "agent",
    system:
      "You are a senior software engineer conducting a code review. When given a PR to review:\n\n1. Clone the repository and check out the PR branch.\n2. Run `git diff main...HEAD` to see all changes.\n3. Analyze the changes for bugs, security vulnerabilities, performance concerns, code style, missing error handling, and test coverage gaps.\n4. Write a structured review to /workspace/review.md.\n5. Be constructive and specific. Reference file names and line numbers.",
    tools: [{ type: "agent_toolset_20260401" }],
  },
  {
    id: "data-processor",
    name: "Data Processor",
    description:
      "Processes CSV and JSON data files, runs analysis, generates charts, and writes summary reports.",
    model: "claude-sonnet-4-20250514",
    type: "agent",
    system:
      "You are a data analyst. When given data to process:\n\n1. Load the data and inspect its structure.\n2. Clean the data: handle missing values, fix types, remove duplicates.\n3. Run exploratory analysis: summary statistics, value counts, correlations.\n4. Generate visualizations and save charts as PNG files to /workspace/charts/.\n5. Write a summary report to /workspace/analysis.md.",
    tools: [{ type: "agent_toolset_20260401" }],
  },
  {
    id: "content-writer",
    name: "Content Writer",
    description:
      "Researches topics and writes long-form content including blog posts, documentation, and technical tutorials.",
    model: "claude-sonnet-4-20250514",
    type: "agent",
    system:
      "You are a technical content writer. When given a topic:\n\n1. Research the topic by searching the web for current information.\n2. Create an outline first and save it to /workspace/outline.md.\n3. Write the full article and save it to /workspace/article.md.\n4. Include a compelling introduction, clear sections, code examples, practical takeaways, and a conclusion.\n5. Save a metadata file to /workspace/metadata.json with title, description, tags, and estimated_read_time.",
    tools: [{ type: "agent_toolset_20260401" }],
  },
  {
    id: "nightly-triage",
    name: "Nightly Triage",
    description:
      "Scheduled routine that pulls open issues, categorizes them by priority, and posts an actionable summary.",
    model: "claude-sonnet-4-20250514",
    type: "routine",
    system: "",
    tools: [],
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description:
      "GitHub-triggered routine that runs a structured code review checklist on every pull request.",
    model: "claude-sonnet-4-20250514",
    type: "routine",
    system: "",
    tools: [],
  },
];

/**
 * GET /api/templates
 * Returns all template definitions.
 */
export async function GET() {
  return NextResponse.json(templates);
}

/**
 * POST /api/templates
 * Imports a template by creating an agent via the Anthropic API.
 *
 * Body: { template_id: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { template_id } = body;

    const template = templates.find((t) => t.id === template_id);
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    if (template.type === "routine") {
      return NextResponse.json(
        {
          error:
            "Routines cannot be imported as agents. Configure them at claude.ai/code/routines.",
        },
        { status: 400 }
      );
    }

    const client = getClient();
    const agent = await client.beta.agents.create({
      name: template.name,
      model: template.model,
      description: template.description,
      system: template.system,
      tools: template.tools as Parameters<typeof client.beta.agents.create>[0]["tools"],
    });

    return NextResponse.json(agent, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create agent from template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
