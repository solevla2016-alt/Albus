"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/useTheme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { dark, toggle } = useTheme();
  return (
    <button
      onClick={toggle}
      className={`rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] ${className}`}
      aria-label="Переключить тему"
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
