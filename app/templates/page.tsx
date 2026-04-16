"use client";

import { useState } from "react";
import {
  Bot,
  Code,
  Database,
  FileText,
  Clock,
  GitPullRequest,
  CheckCircle,
  ExternalLink,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string;
  model: string;
  type: "agent" | "routine";
  icon: LucideIcon;
  tools: string[];
  trigger?: string;
}

const agentTemplates: Template[] = [
  {
    id: "deep-researcher",
    name: "Deep Researcher",
    description:
      "Searches the web, synthesizes information from multiple sources, and writes structured reports with citations.",
    model: "claude-sonnet-4-6",
    type: "agent",
    icon: Bot,
    tools: ["web_search", "file_tools"],
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    description:
      "Reviews pull requests for bugs, security vulnerabilities, style issues, and improvement opportunities.",
    model: "claude-sonnet-4-6",
    type: "agent",
    icon: Code,
    tools: ["bash", "file_tools", "web_search"],
  },
  {
    id: "data-processor",
    name: "Data Processor",
    description:
      "Processes CSV and JSON data files, runs analysis, generates charts, and writes summary reports.",
    model: "claude-sonnet-4-6",
    type: "agent",
    icon: Database,
    tools: ["bash", "file_tools"],
  },
  {
    id: "content-writer",
    name: "Content Writer",
    description:
      "Researches topics and writes long-form content including blog posts, documentation, and technical tutorials.",
    model: "claude-sonnet-4-6",
    type: "agent",
    icon: FileText,
    tools: ["web_search", "file_tools"],
  },
];

const routineTemplates: Template[] = [
  {
    id: "nightly-triage",
    name: "Nightly Triage",
    description:
      "Scheduled routine that pulls open issues, categorizes them by priority, and posts an actionable summary.",
    model: "claude-sonnet-4-6",
    type: "routine",
    icon: Clock,
    tools: [],
    trigger: "Scheduled (cron)",
  },
  {
    id: "pr-reviewer",
    name: "PR Reviewer",
    description:
      "GitHub-triggered routine that runs a structured code review checklist on every pull request.",
    model: "claude-sonnet-4-6",
    type: "routine",
    icon: GitPullRequest,
    tools: [],
    trigger: "GitHub webhook",
  },
];

function TemplateCard({ template }: { template: Template }) {
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const Icon = template.icon;

  const handleImport = async () => {
    setImporting(true);
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: template.id }),
      });

      if (res.ok) {
        setImported(true);
        setTimeout(() => setImported(false), 3000);
      } else {
        const err = await res.text();
        alert(`Failed to import: ${err}`);
      }
    } catch {
      alert("Network error while importing template");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="card"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header with icon and name */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--accent-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon size={20} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>
            {template.name}
          </h3>
        </div>
        {template.type === "routine" && (
          <span
            style={{
              background: "var(--accent-subtle)",
              color: "var(--accent)",
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 8px",
              borderRadius: 10,
              whiteSpace: "nowrap",
            }}
          >
            Routine
          </span>
        )}
      </div>

      {/* Description */}
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: 13,
          lineHeight: 1.5,
          margin: 0,
          flex: 1,
        }}
      >
        {template.description}
      </p>

      {/* Badges */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <span
          style={{
            background: "var(--bg-badge)",
            padding: "3px 8px",
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "monospace",
            color: "var(--text-secondary)",
          }}
        >
          {template.model}
        </span>
        {template.tools.map((tool) => (
          <span
            key={tool}
            style={{
              background: "var(--bg-badge)",
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {tool}
          </span>
        ))}
        {template.trigger && (
          <span
            style={{
              background: "var(--bg-badge)",
              padding: "3px 8px",
              borderRadius: 6,
              fontSize: 11,
              color: "var(--text-secondary)",
            }}
          >
            {template.trigger}
          </span>
        )}
      </div>

      {/* Action */}
      {template.type === "routine" ? (
        <a
          href="https://claude.ai/code/routines"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{
            alignSelf: "flex-start",
            fontSize: 13,
            padding: "8px 14px",
            textDecoration: "none",
            gap: 6,
          }}
        >
          <ExternalLink size={14} />
          View Setup Guide
        </a>
      ) : (
        <button
          onClick={handleImport}
          disabled={importing}
          className="btn-primary"
          style={{
            alignSelf: "flex-start",
            fontSize: 13,
            padding: "8px 16px",
            background: imported ? "var(--success)" : undefined,
            opacity: importing ? 0.6 : 1,
            gap: 6,
          }}
        >
          {importing ? (
            "Importing..."
          ) : imported ? (
            <>
              <CheckCircle size={14} />
              Imported
            </>
          ) : (
            "Import Agent"
          )}
        </button>
      )}
    </div>
  );
}

export default function TemplatesPage() {
  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <p style={{ color: "var(--text-secondary)", fontSize: 14 }}>
          Pre-built agent configurations ready to import. Click Import to create
          an agent from a template.
        </p>
      </div>

      {/* Agent Templates */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Agent Templates
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
          marginBottom: 40,
        }}
      >
        {agentTemplates.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>

      {/* Routine Templates */}
      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
        Routine Templates
      </h2>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
          gap: 16,
        }}
      >
        {routineTemplates.map((t) => (
          <TemplateCard key={t.id} template={t} />
        ))}
      </div>
    </div>
  );
}
