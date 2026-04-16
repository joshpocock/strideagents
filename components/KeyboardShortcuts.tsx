"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCommandPalette } from "./CommandPalette";

function isInputFocused(): boolean {
  const tag = document.activeElement?.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((document.activeElement as HTMLElement)?.isContentEditable) return true;
  return false;
}

export default function KeyboardShortcuts({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { open: paletteOpen, setOpen: setPaletteOpen } = useCommandPalette();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K is handled by CommandPalette itself
      if (paletteOpen) return;
      if (isInputFocused()) return;

      switch (e.key.toLowerCase()) {
        case "n":
          e.preventDefault();
          router.push("/agents/new");
          break;
        case "t":
          e.preventDefault();
          router.push("/board?add=1");
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router, paletteOpen, setPaletteOpen]);

  return <>{children}</>;
}
