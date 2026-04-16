"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import {
  Rocket,
  Home,
  MessageSquare,
  LayoutDashboard,
  Bot,
  Server,
  Shield,
  Package,
  Moon,
  Sun,
  Menu,
  X,
  Sparkles,
  History,
  Search,
  Zap,
  BarChart3,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { useCommandPalette } from "./CommandPalette";

const navItems = [
  { icon: Rocket, label: "Quickstart", href: "/quickstart" },
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: MessageSquare, label: "Chat", href: "/chat" },
  { icon: LayoutDashboard, label: "Task Board", href: "/board" },
  { icon: Bot, label: "Agents", href: "/agents" },
  { icon: Shield, label: "Vaults", href: "/vaults" },
  { icon: Sparkles, label: "Skills", href: "/skills" },
  { icon: Server, label: "Environments", href: "/environments" },
  { icon: History, label: "Sessions", href: "/sessions" },
  { icon: Package, label: "Templates", href: "/templates" },
  { icon: Zap, label: "Routines", href: "/routines" },
  { icon: BarChart3, label: "Analytics", href: "/analytics" },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const { setOpen: setCommandPaletteOpen } = useCommandPalette();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const checkMobile = useCallback(() => {
    setIsMobile(window.innerWidth < 768);
  }, []);

  useEffect(() => {
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [checkMobile]);

  // Close on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const handleNavClick = () => {
    if (isMobile) setMobileOpen(false);
  };

  const sidebarVisible = !isMobile || mobileOpen;

  return (
    <>
      {/* Mobile hamburger button */}
      {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          style={{
            position: "fixed",
            top: 12,
            left: 12,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 40,
            height: 40,
            background: "var(--bg-card)",
            border: "1px solid var(--border-color)",
            borderRadius: 8,
            color: "var(--text-primary)",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <Menu size={20} />
        </button>
      )}

      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.6)",
            zIndex: 99,
            transition: "opacity 0.2s ease",
          }}
        />
      )}

      {/* Sidebar */}
      <nav
        className="sidebar"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          width: 240,
          background: "var(--bg-sidebar)",
          borderRight: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          zIndex: 100,
          overflowY: "auto",
          transform: sidebarVisible ? "translateX(0)" : "translateX(-100%)",
          transition: "transform 0.25s ease",
        }}
      >
        {/* Logo / Title */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid var(--border-color)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Link
            href="/"
            onClick={handleNavClick}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontFamily: "'Poppins', sans-serif",
              fontWeight: 700,
              fontSize: 15,
              color: "var(--accent)",
              textDecoration: "none",
              letterSpacing: "-0.3px",
            }}
          >
            <Bot size={22} />
            <span>Agent Dashboard</span>
          </Link>
          {isMobile && (
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: 0,
                borderRadius: 6,
              }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <div
          style={{
            flex: 1,
            padding: "8px 0",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {navItems.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={handleNavClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--accent)" : "var(--text-secondary)",
                  textDecoration: "none",
                  borderLeft: active
                    ? "3px solid var(--accent)"
                    : "3px solid transparent",
                  background: active ? "var(--accent-subtle)" : "transparent",
                  transition:
                    "background 0.15s ease, color 0.15s ease, border-color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "var(--bg-card-hover)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLAnchorElement).style.background =
                      "transparent";
                  }
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {/* Command Palette Trigger */}
        <div style={{ padding: "4px 16px 0" }}>
          <button
            onClick={() => setCommandPaletteOpen(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              color: "var(--text-muted)",
              fontSize: 13,
              cursor: "pointer",
              transition: "background 0.15s ease, border-color 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-hover)";
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--border-dashed)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-input)";
              (e.currentTarget as HTMLButtonElement).style.borderColor =
                "var(--border-color)";
            }}
          >
            <Search size={14} />
            <span style={{ flex: 1, textAlign: "left" }}>Search...</span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                background: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                borderRadius: 4,
                padding: "1px 5px",
                color: "var(--text-muted)",
              }}
            >
              {typeof navigator !== "undefined" &&
              navigator.platform?.includes("Mac")
                ? "\u2318K"
                : "Ctrl+K"}
            </span>
          </button>
        </div>

        {/* Theme Toggle */}
        <div
          style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <button
            onClick={toggleTheme}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              padding: "9px 12px",
              background: "var(--bg-card)",
              border: "1px solid var(--border-color)",
              borderRadius: 6,
              color: "var(--text-secondary)",
              fontSize: 13,
              cursor: "pointer",
              transition: "background 0.15s ease",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-card)";
            }}
          >
            {theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
            <span>{theme === "dark" ? "Dark Mode" : "Light Mode"}</span>
          </button>
        </div>
      </nav>
    </>
  );
}
