"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Globe, Layers, Terminal } from "lucide-react";

interface Preset {
  icon: React.ComponentType<{ size?: number }>;
  name: string;
  description: string;
  setup_commands: string[];
}

const presets: Preset[] = [
  {
    icon: Cpu,
    name: "Python Data Science",
    description: "Pandas, NumPy, Matplotlib, scikit-learn, and Jupyter for data analysis and ML workflows.",
    setup_commands: ["pip install pandas numpy matplotlib scikit-learn jupyter"],
  },
  {
    icon: Globe,
    name: "Node.js Web Dev",
    description: "TypeScript, tsx runner, and Express for building web applications and APIs.",
    setup_commands: ["npm install -g typescript tsx", "npm install express"],
  },
  {
    icon: Layers,
    name: "Full Stack",
    description: "Python data tools, TypeScript, PostgreSQL client, and Redis tools for full-stack development.",
    setup_commands: [
      "pip install pandas numpy",
      "npm install -g typescript tsx",
      "apt-get install -y postgresql-client redis-tools",
    ],
  },
  {
    icon: Terminal,
    name: "Go Backend",
    description: "Go language server (gopls) for building performant backend services.",
    setup_commands: ["go install golang.org/x/tools/gopls@latest"],
  },
];

export default function NewEnvironmentPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [setupCommands, setSetupCommands] = useState("");
  const [networkAccess, setNetworkAccess] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const applyPreset = (preset: Preset) => {
    setName(preset.name);
    setDescription(preset.description);
    setSetupCommands(preset.setup_commands.join("\n"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const commands = setupCommands
        .split("\n")
        .map((c) => c.trim())
        .filter(Boolean);

      const res = await fetch("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          setup_commands: commands.length > 0 ? commands : undefined,
          network_access: networkAccess,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        alert(`Failed to create environment: ${err}`);
        return;
      }

      router.push("/environments");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 640 }}>
      {/* Presets Section */}
      <div style={{ marginBottom: 24 }}>
        <h2
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-secondary)",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          Quick Presets
        </h2>
        <div
          className="preset-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gap: 12,
          }}
        >
          {presets.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.name}
                type="button"
                onClick={() => applyPreset(preset)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 16,
                  background: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 10,
                  textAlign: "left",
                  cursor: "pointer",
                  transition: "border-color 0.15s ease, background 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "var(--accent)";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--accent-bg)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor =
                    "var(--border-color)";
                  (e.currentTarget as HTMLButtonElement).style.background =
                    "var(--bg-card)";
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: "var(--accent-subtle)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={16} />
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {preset.name}
                  </span>
                </div>
                <p
                  style={{
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {preset.description}
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 4,
                    marginTop: 2,
                  }}
                >
                  {preset.setup_commands.map((cmd, i) => (
                    <span
                      key={i}
                      style={{
                        fontSize: 10,
                        fontFamily: "monospace",
                        color: "var(--text-muted)",
                        background: "var(--bg-badge)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cmd}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form */}
      <div className="card">
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: 20 }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Name <span style={{ color: "var(--accent)" }}>*</span>
            </label>
            <input
              style={{ width: "100%" }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Python Data Science"
              required
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Description
            </label>
            <input
              style={{ width: "100%" }}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this environment for?"
            />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 13,
                fontWeight: 500,
                color: "var(--text-secondary)",
                marginBottom: 6,
              }}
            >
              Setup Commands
            </label>
            <textarea
              style={{
                width: "100%",
                minHeight: 120,
                resize: "vertical",
                fontFamily: "monospace",
                fontSize: 13,
              }}
              value={setupCommands}
              onChange={(e) => setSetupCommands(e.target.value)}
              placeholder={"pip install pandas numpy\nnpm install typescript\napt-get install -y curl"}
            />
            <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 6 }}>
              One command per line. These run when the environment starts.
            </p>
          </div>

          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              <div
                onClick={() => setNetworkAccess(!networkAccess)}
                style={{
                  width: 44,
                  height: 24,
                  borderRadius: 12,
                  background: networkAccess ? "var(--accent)" : "var(--border-dashed)",
                  position: "relative",
                  transition: "background 0.2s ease",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#FFFFFF",
                    position: "absolute",
                    top: 3,
                    left: networkAccess ? 23 : 3,
                    transition: "left 0.2s ease",
                  }}
                />
              </div>
              <span>
                Network Access{" "}
                <span style={{ color: "var(--text-muted)" }}>
                  ({networkAccess ? "enabled" : "disabled"})
                </span>
              </span>
            </label>
          </div>

          <button
            type="submit"
            disabled={submitting || !name.trim()}
            className="btn-primary"
            style={{
              alignSelf: "flex-start",
              opacity: submitting || !name.trim() ? 0.6 : 1,
            }}
          >
            {submitting ? "Creating..." : "Create Environment"}
          </button>
        </form>
      </div>
    </div>
  );
}
