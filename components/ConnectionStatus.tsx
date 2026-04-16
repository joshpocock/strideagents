"use client";

import { useEffect, useState } from "react";

type Status = "connected" | "disconnected" | "checking";

interface ConnectionStatusProps {
  compact?: boolean;
}

export default function ConnectionStatus({ compact = false }: ConnectionStatusProps) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health");
        if (res.ok) {
          const data = await res.json();
          setStatus(data.status === "connected" ? "connected" : "disconnected");
        } else {
          setStatus("disconnected");
        }
      } catch {
        setStatus("disconnected");
      }
    };

    check();
    const interval = setInterval(check, 30000);
    return () => clearInterval(interval);
  }, []);

  const dotColor =
    status === "connected"
      ? "var(--success)"
      : status === "disconnected"
      ? "var(--error)"
      : "var(--warning)";

  const label =
    status === "connected"
      ? "Connected"
      : status === "disconnected"
      ? "Disconnected"
      : "Checking...";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        color: "var(--text-secondary)",
      }}
      title={`API ${label}`}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: dotColor,
          flexShrink: 0,
          transition: "background 0.3s ease",
        }}
      />
      {!compact && <span>{label}</span>}
    </div>
  );
}
