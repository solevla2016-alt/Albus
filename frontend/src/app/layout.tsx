import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DevRedirect } from "@/components/DevRedirect";

export const metadata: Metadata = {
  title: "Albus — Мессенджер",
  description: "Современный реально-временный чат для команды Albus",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Albus",
  },
  openGraph: {
    title: "Albus — Мессенджер",
    description: "Современный реально-временный чат для команды Albus",
    images: [{ url: "/logo-card.png", width: 768, height: 768 }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fcfaf9" },
    { media: "(prefers-color-scheme: dark)", color: "#17110f" },
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
