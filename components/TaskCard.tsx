"use client";

import { Circle, Loader, CheckCircle, XCircle } from "lucide-react";
import type { BoardTask } from "@/lib/types";
import SessionEventLog from "./SessionEventLog";
import CostTicker from "./CostTicker";
import { useCostTracker } from "@/lib/useCostTracker";

interface TaskCardProps {
  task: BoardTask;
  onDragStart: (e: React.DragEvent, taskId: number) => void;
}

const statusConfig: Record<string, { color: string; icon: typeof Circle; label: string }> = {
  todo: { color: "var(--text-muted)", icon: Circle, label: "Todo" },
  in_progress: { color: "var(--accent)", icon: Loader, label: "In Progress" },
  done: { color: "var(--success)", icon: CheckCircle, label: "Done" },
  failed: { color: "var(--error)", icon: XCircle, label: "Failed" },
};

export default function TaskCard({ task, onDragStart }: TaskCardProps) {
  const streamUrl =
    task.status === "in_progress" ? `/api/board/${task.id}/stream` : null;

  const costData = useCostTracker(streamUrl);
  const config = statusConfig[task.status] || statusConfig.todo;
  const StatusIcon = config.icon;

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border-color)",
        borderRadius: 10,
        padding: 14,
        cursor: "grab",
        transition: "border-color 0.15s ease",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-dashed)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border-color)";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <h4 style={{ fontSize: 14, fontWeight: 600, margin: 0, flex: 1 }}>
          {task.title}
        </h4>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            color: config.color,
            padding: "2px 8px",
            borderRadius: 10,
            marginLeft: 8,
            whiteSpace: "nowrap",
            background: "var(--bg-badge)",
          }}
        >
          <StatusIcon size={12} />
          {config.label}
        </span>
      </div>

      {task.description && (
        <p
          style={{
            fontSize: 13,
            color: "var(--text-secondary)",
            margin: 0,
            marginBottom: streamUrl ? 10 : 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {task.description}
        </p>
      )}

      {streamUrl && <SessionEventLog streamUrl={streamUrl} compact />}

      {streamUrl && (
        <CostTicker
          inputTokens={costData.inputTokens}
          outputTokens={costData.outputTokens}
          model={costData.model}
          sessionStartTime={costData.sessionStartTime}
          compact
        />
      )}

      {task.status === "done" && task.result && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "var(--text-secondary)",
            background: "var(--bg-input)",
            borderRadius: 8,
            padding: 8,
            maxHeight: 100,
            overflowY: "auto",
            fontFamily: "monospace",
          }}
        >
          {task.result}
        </div>
      )}
    </div>
  );
}
