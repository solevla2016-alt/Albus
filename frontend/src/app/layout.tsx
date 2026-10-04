import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DevRedirect } from "@/components/DevRedirect";

export const metadata: Metadata = {
  title: "Albus — Мессенджер",
  description: "Современный реально-временный чат для команды Albus",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Albus",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f172a" },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="chat-app min-h-dvh bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        <DevRedirect />
        {children}
      </body>
    </html>
  );
}
