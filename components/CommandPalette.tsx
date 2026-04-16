"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Bot,
  Plus,
  MessageSquare,
  Package,
  LayoutDashboard,
  Moon,
  Sun,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  Command,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme } from "./ThemeProvider";

interface PaletteAction {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  category: string;
}

interface CommandPaletteContextType {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextType>({
  open: false,
  setOpen: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

interface AgentItem {
  id: string;
  name: string;
}

export default function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [agents, setAgents] = useState<AgentItem[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (open) {
      fetch("/api/agents")
        .then((r) => (r.ok ? r.json() : []))
        .then((data: AgentItem[]) => setAgents(data))
        .catch(() => {});
    }
  }, [open]);

  const actions: PaletteAction[] = [
    {
      id: "new-agent",
      label: "New Agent",
      icon: Plus,
      action: () => router.push("/agents/new"),
      category: "Actions",
    },
    {
      id: "new-task",
      label: "New Task",
      icon: LayoutDashboard,
      action: () => router.push("/board?add=1"),
      category: "Actions",
    },
    {
      id: "start-chat",
      label: "Start Chat",
      icon: MessageSquare,
      action: () => router.push("/chat"),
      category: "Actions",
    },
    {
      id: "browse-templates",
      label: "Browse Templates",
      icon: Package,
      action: () => router.push("/templates"),
      category: "Navigation",
    },
    {
      id: "view-sessions",
      label: "View Agents",
      icon: Bot,
      action: () => router.push("/agents"),
      category: "Navigation",
    },
    {
      id: "toggle-theme",
      label: `Toggle Theme (${theme === "dark" ? "Light" : "Dark"})`,
      icon: theme === "dark" ? Sun : Moon,
      action: () => toggleTheme(),
      category: "Settings",
    },
    ...agents.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      icon: Bot,
      action: () => router.push(`/agents/${agent.id}`),
      category: "Agents",
    })),
  ];

  const filtered = query
    ? actions.filter((a) =>
        a.label.toLowerCase().includes(query.toLowerCase())
      )
    : actions;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const executeSelected = useCallback(() => {
    if (filtered[selectedIndex]) {
      filtered[selectedIndex].action();
      close();
    }
  }, [filtered, selectedIndex, close]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        return;
      }

      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close, filtered.length, executeSelected]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (listRef.current) {
      const selected = listRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selected) {
        selected.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex]);

  // Group filtered results by category
  const grouped: Record<string, PaletteAction[]> = {};
  for (const action of filtered) {
    if (!grouped[action.category]) grouped[action.category] = [];
    grouped[action.category].push(action);
  }

  return (
    <CommandPaletteContext.Provider value={{ open, setOpen }}>
      {children}
      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: "var(--modal-overlay)",
            backdropFilter: "blur(4px)",
            display: "flex",
            justifyContent: "center",
            paddingTop: 120,
            animation: "palette-overlay-in 0.15s ease",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 560,
              background: "var(--bg-card)",
              border: "1px solid var(--bg-card-border)",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 24px 48px rgba(0,0,0,0.4)",
              animation: "palette-slide-down 0.2s ease",
              display: "flex",
              flexDirection: "column",
              maxHeight: "min(480px, 70vh)",
            }}
          >
            {/* Search input */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "12px 16px",
                borderBottom: "1px solid var(--border-color)",
                gap: 10,
              }}
            >
              <Search size={18} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type a command..."
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: 15,
                  outline: "none",
                  padding: 0,
                }}
              />
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text-muted)",
                  background: "var(--bg-input)",
                  border: "1px solid var(--border-color)",
                  borderRadius: 4,
                  padding: "2px 6px",
                  fontFamily: "monospace",
                }}
              >
                ESC
              </span>
            </div>

            {/* Results list */}
            <div
              ref={listRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "8px 0",
              }}
            >
              {filtered.length === 0 && (
                <div
                  style={{
                    padding: "24px 16px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 14,
                  }}
                >
                  No results found
                </div>
              )}
              {Object.entries(grouped).map(([category, items]) => (
                <div key={category}>
                  <div
                    style={{
                      padding: "8px 16px 4px",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "var(--text-muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {category}
                  </div>
                  {items.map((action) => {
                    const globalIndex = filtered.indexOf(action);
                    const isSelected = globalIndex === selectedIndex;
                    const Icon = action.icon;

                    return (
                      <div
                        key={action.id}
                        data-index={globalIndex}
                        onClick={() => {
                          action.action();
                          close();
                        }}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          padding: "8px 16px",
                          cursor: "pointer",
                          background: isSelected
                            ? "var(--bg-hover)"
                            : "transparent",
                          color: isSelected
                            ? "var(--text-primary)"
                            : "var(--text-secondary)",
                          fontSize: 14,
                          transition: "background 0.1s ease",
                        }}
                      >
                        <Icon size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                        <span style={{ flex: 1 }}>{action.label}</span>
                        {isSelected && (
                          <CornerDownLeft
                            size={14}
                            style={{ color: "var(--text-muted)" }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Footer hints */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "8px 16px",
                borderTop: "1px solid var(--border-color)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <ArrowUp size={12} />
                <ArrowDown size={12} />
                Navigate
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <CornerDownLeft size={12} />
                Select
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Command size={12} />K Toggle
              </span>
            </div>
          </div>
        </div>
      )}
    </CommandPaletteContext.Provider>
  );
}
