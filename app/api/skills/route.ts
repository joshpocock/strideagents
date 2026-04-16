import { NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// Bundled skills -- always available
// ---------------------------------------------------------------------------

export interface BundledSkill {
  id: string;
  name: string;
  description: string;
  author: string;
  source: "bundled" | "anthropic" | "github";
  category: string;
  content: string;
}

const BUNDLED_SKILLS: BundledSkill[] = [
  {
    id: "bundled-deep-researcher",
    name: "Deep Researcher",
    description: "Conducts multi-source web research, synthesizes findings, and produces structured reports with citations.",
    author: "Anthropic",
    source: "bundled",
    category: "Research",
    content: `# Deep Researcher

A skill for conducting thorough web research and producing structured reports.

## Capabilities

- Multi-source web research with citation tracking
- Automatic claim verification across sources
- Structured report generation with executive summary
- Source quality assessment and ranking
- Follow-up question generation

## Usage

Attach this skill to an agent and ask it to research any topic. The agent will search multiple sources, cross-reference claims, and produce a formatted report.

## Configuration

No additional configuration required. The skill uses the agent's built-in web search tools.

## Example Prompts

- "Research the current state of quantum computing in 2026"
- "Compare the top 5 project management tools for remote teams"
- "Investigate recent developments in solid-state batteries"
`,
  },
  {
    id: "bundled-code-reviewer",
    name: "Code Reviewer",
    description: "Reviews pull requests with a structured checklist covering security, performance, and best practices.",
    author: "Anthropic",
    source: "bundled",
    category: "Development",
    content: `# Code Reviewer

A skill for performing thorough, structured code reviews on pull requests.

## Capabilities

- Security vulnerability detection
- Performance bottleneck identification
- Code style and consistency checks
- Test coverage analysis
- Dependency audit
- Architecture pattern validation

## Review Checklist

1. **Security** - SQL injection, XSS, auth bypass, secret exposure
2. **Performance** - N+1 queries, unnecessary re-renders, memory leaks
3. **Correctness** - Edge cases, error handling, race conditions
4. **Style** - Naming conventions, code organization, documentation
5. **Tests** - Coverage gaps, flaky test patterns, missing assertions

## Usage

Attach to an agent with GitHub MCP server access. Provide a PR URL or diff and the agent will produce a structured review.
`,
  },
  {
    id: "bundled-data-processor",
    name: "Data Processor",
    description: "Analyzes CSV, JSON, and tabular data with summary statistics, filtering, and transformation.",
    author: "Anthropic",
    source: "bundled",
    category: "Data",
    content: `# Data Processor

A skill for analyzing and transforming structured data files.

## Capabilities

- CSV and JSON file parsing
- Summary statistics (mean, median, mode, std dev)
- Data filtering and grouping
- Format conversion (CSV to JSON, JSON to CSV)
- Outlier detection
- Trend analysis and visualization descriptions

## Usage

Attach this skill to an agent and provide a data file or paste tabular data. The agent will analyze the data and provide insights.

## Supported Formats

- CSV (comma, tab, pipe delimited)
- JSON (arrays, nested objects)
- TSV
- JSONL (newline-delimited JSON)
`,
  },
  {
    id: "bundled-content-writer",
    name: "Content Writer",
    description: "Writes blog posts, documentation, and long-form content with SEO optimization and consistent tone.",
    author: "Anthropic",
    source: "bundled",
    category: "Content",
    content: `# Content Writer

A skill for producing high-quality written content across multiple formats.

## Capabilities

- Blog post writing with SEO optimization
- Technical documentation generation
- Tutorial and how-to guide creation
- Content outline and structure planning
- Tone and style adaptation
- Meta description and title tag generation

## Content Types

- **Blog Posts** - SEO-optimized articles with headers, internal links
- **Documentation** - API docs, user guides, README files
- **Tutorials** - Step-by-step guides with code examples
- **Landing Pages** - Conversion-focused copy

## Usage

Attach to an agent and provide a topic, target audience, and desired format. The agent will produce publication-ready content.
`,
  },
  {
    id: "bundled-web-scraper",
    name: "Web Scraper",
    description: "Extracts structured data from websites with configurable selectors and pagination support.",
    author: "Anthropic",
    source: "bundled",
    category: "Data",
    content: `# Web Scraper

A skill for extracting structured data from web pages.

## Capabilities

- URL content extraction and parsing
- CSS selector-based data extraction
- Pagination handling
- Rate limiting and polite crawling
- Output formatting (JSON, CSV)
- Error handling and retry logic

## Usage

Attach this skill to an agent and provide a URL along with what data you want extracted. The agent will fetch the page, parse the content, and return structured data.

## Configuration

- **Rate Limiting** - Built-in delays between requests
- **User Agent** - Configurable request headers
- **Timeout** - Adjustable page load timeout
- **Retries** - Automatic retry on transient failures
`,
  },
];

/**
 * GET /api/skills
 * Returns bundled skills plus any imported GitHub skills stored in SQLite.
 */
export async function GET() {
  try {
    // Try to load GitHub-imported skills from SQLite
    let importedSkills: BundledSkill[] = [];
    try {
      const { getDb } = await import("@/lib/db");
      const db = getDb();

      // Ensure the skills table exists
      db.exec(`
        CREATE TABLE IF NOT EXISTS imported_skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          author TEXT NOT NULL,
          source TEXT NOT NULL,
          category TEXT NOT NULL,
          content TEXT NOT NULL,
          github_url TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      importedSkills = db
        .prepare("SELECT * FROM imported_skills ORDER BY created_at DESC")
        .all() as BundledSkill[];
    } catch {
      // SQLite not available or table doesn't exist yet
    }

    return NextResponse.json([...BUNDLED_SKILLS, ...importedSkills]);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to list skills";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/skills
 * Import a skill from a GitHub repository.
 * Body: { github_url: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { github_url } = body;

    if (!github_url) {
      return NextResponse.json(
        { error: "github_url is required" },
        { status: 400 }
      );
    }

    // Parse GitHub URL: accept "user/repo" or full URL
    let owner: string;
    let repo: string;

    const urlStr = github_url.trim();
    if (urlStr.includes("github.com")) {
      const match = urlStr.match(
        /github\.com\/([^/]+)\/([^/]+)/
      );
      if (!match) {
        return NextResponse.json(
          { error: "Invalid GitHub URL format" },
          { status: 400 }
        );
      }
      owner = match[1];
      repo = match[2].replace(/\.git$/, "");
    } else if (urlStr.includes("/")) {
      const parts = urlStr.split("/");
      owner = parts[0];
      repo = parts[1];
    } else {
      return NextResponse.json(
        { error: "Provide a GitHub URL or user/repo format" },
        { status: 400 }
      );
    }

    // Fetch SKILL.md from the repo root
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`;
    const fallbackUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`;

    let skillContent = "";
    let res = await fetch(rawUrl);
    if (!res.ok) {
      res = await fetch(fallbackUrl);
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: "Could not find SKILL.md in the repository. Tried main and master branches." },
        { status: 404 }
      );
    }
    skillContent = await res.text();

    // Extract name from first heading or use repo name
    const nameMatch = skillContent.match(/^#\s+(.+)$/m);
    const skillName = nameMatch ? nameMatch[1].trim() : repo;

    // Extract first paragraph as description
    const lines = skillContent.split("\n").filter((l) => l.trim());
    let description = `Imported from ${owner}/${repo}`;
    for (const line of lines) {
      if (!line.startsWith("#") && line.trim().length > 10) {
        description = line.trim().substring(0, 200);
        break;
      }
    }

    const id = `github-${owner}-${repo}-${Date.now()}`;

    const skill: BundledSkill = {
      id,
      name: skillName,
      description,
      author: owner,
      source: "github",
      category: "Community",
      content: skillContent,
    };

    // Store in SQLite
    try {
      const { getDb } = await import("@/lib/db");
      const db = getDb();
      db.exec(`
        CREATE TABLE IF NOT EXISTS imported_skills (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL,
          author TEXT NOT NULL,
          source TEXT NOT NULL,
          category TEXT NOT NULL,
          content TEXT NOT NULL,
          github_url TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);
      db.prepare(
        `INSERT INTO imported_skills (id, name, description, author, source, category, content, github_url)
         VALUES (@id, @name, @description, @author, @source, @category, @content, @github_url)`
      ).run({ ...skill, github_url: `https://github.com/${owner}/${repo}` });
    } catch {
      // If DB fails, still return the skill (it won't persist)
    }

    return NextResponse.json(skill, { status: 201 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Failed to import skill";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
