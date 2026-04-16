"use client";

interface ShortcutHintProps {
  keys: string;
}

export default function ShortcutHint({ keys }: ShortcutHintProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 20,
        height: 20,
        padding: "0 5px",
        background: "var(--bg-input)",
        border: "1px solid var(--border-color)",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "monospace",
        fontWeight: 500,
        color: "var(--text-muted)",
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {keys}
    </span>
  );
}
