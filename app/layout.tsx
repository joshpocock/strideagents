import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import ThemeProvider from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import CommandPaletteProvider from "@/components/CommandPalette";
import KeyboardShortcuts from "@/components/KeyboardShortcuts";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Managed Agents Dashboard",
  description: "Control panel for Anthropic Managed Agents",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <ToastProvider>
            <CommandPaletteProvider>
              <KeyboardShortcuts>
                <div style={{ display: "flex" }}>
                  <Sidebar />
                  <div className="main-content">
                    <TopBar />
                    <main style={{ padding: 24, maxWidth: 1400 }}>
                      <Suspense>{children}</Suspense>
                    </main>
                  </div>
                </div>
              </KeyboardShortcuts>
            </CommandPaletteProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
