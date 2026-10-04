"use client";

import type { TypingUser } from "@/lib/types";

export function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;

  const names = users.map((u) => u.username);

  return (
    <div className="flex items-center gap-2 px-1 py-1 text-xs text-[var(--text-secondary)]">
      <div className="flex items-center gap-1">
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--brand-primary)]" style={{ animationDelay: "0ms" }} />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--brand-primary)]" style={{ animationDelay: "150ms" }} />
        <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-[var(--brand-primary)]" style={{ animationDelay: "300ms" }} />
      </div>
      <span>
        {names.length === 1
          ? `${names[0]} печатает...`
          : names.length === 2
            ? `${names[0]} и ${names[1]} печатают...`
            : `${names.slice(0, 2).join(", ")} и ещё ${names.length - 2} печатают...`}
      </span>
    </div>
  );
}
