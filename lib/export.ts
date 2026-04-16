"use client";

interface LogEntry {
  type: string;
  text: string;
  timestamp: string;
}

function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportAsJson(events: LogEntry[], sessionName?: string) {
  const data = {
    exported_at: new Date().toISOString(),
    session: sessionName || "session",
    events,
  };
  const json = JSON.stringify(data, null, 2);
  const filename = `${sessionName || "session"}-events-${Date.now()}.json`;
  downloadBlob(json, filename, "application/json");
}

export function exportAsMarkdown(events: LogEntry[], sessionName?: string) {
  const lines: string[] = [];
  lines.push(`# Session Event Log`);
  lines.push("");
  lines.push(`**Session:** ${sessionName || "Unknown"}`);
  lines.push(`**Exported:** ${new Date().toLocaleString()}`);
  lines.push(`**Total Events:** ${events.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const event of events) {
    const typeLabel = event.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    lines.push(`### ${typeLabel}`);
    lines.push(`**Time:** ${event.timestamp}`);
    lines.push("");

    if (event.type === "tool_use") {
      lines.push("```");
      lines.push(event.text);
      lines.push("```");
    } else {
      lines.push(event.text);
    }

    lines.push("");
    lines.push("---");
    lines.push("");
  }

  const md = lines.join("\n");
  const filename = `${sessionName || "session"}-events-${Date.now()}.md`;
  downloadBlob(md, filename, "text/markdown");
}
