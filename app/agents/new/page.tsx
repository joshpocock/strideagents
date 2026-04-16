"use client";

import { useRouter } from "next/navigation";
import AgentForm, { type AgentFormData } from "@/components/AgentForm";

export default function NewAgentPage() {
  const router = useRouter();

  const handleSubmit = async (data: AgentFormData) => {
    const body = {
      name: data.name,
      description: data.description || undefined,
      model: data.model,
      system: data.system || undefined,
      tools: data.tools.map((t) => ({ type: t })),
      mcp_servers: data.mcp_servers.length > 0 ? data.mcp_servers : undefined,
    };

    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      alert(`Failed to create agent: ${err}`);
      return;
    }

    router.push("/agents");
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <div className="card">
        <AgentForm onSubmit={handleSubmit} submitLabel="Create Agent" />
      </div>
    </div>
  );
}
