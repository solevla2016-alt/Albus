"use client";

import { useEffect, useState } from "react";
import { ChevronsLeft, ChevronsRight, Home, Plus } from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import type { Server } from "@/lib/types";

export type RailKey = "home" | number;

const COLLAPSED_WIDTH = 72;
const EXPANDED_WIDTH = 216;

export function ServerRail({
  servers,
  activeId,
  onSelect,
  onCreate,
  unreadCounts,
  homeUnread = 0,
}: {
  servers: Server[];
  activeId: "home" | number | null;
  onSelect: (key: RailKey) => void;
  onCreate: () => void;
  unreadCounts?: Record<number, number>;
  homeUnread?: number;
}) {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("albus-rail-expanded");
    if (stored !== null) setExpanded(stored !== "0");
  }, []);

  const toggle = () => {
    setExpanded((v) => {
      localStorage.setItem("albus-rail-expanded", v ? "0" : "1");
      return !v;
    });
  };

  const row = cn(
    "flex h-11 shrink-0 items-center gap-3 rounded-xl transition-all duration-150",
    expanded ? "w-full px-2" : "w-11 justify-center"
  );

  const icon = cn(
    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition-colors"
  );

  return (
    <div
      style={{ width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH }}
      className="hidden shrink-0 flex-col items-stretch gap-1.5 overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-tertiary)] py-3 transition-[width] duration-200 md:flex"
    >
      <button
        title="Главная"
        aria-label="Главная"
        onClick={() => onSelect("home")}
        className={cn(
          row,
          activeId === "home"
            ? "bg-[var(--brand-primary)] text-white shadow-lg shadow-brand-500/30"
            : "text-[var(--text-muted)] hover:bg-[var(--brand-light)] hover:text-[var(--brand-primary)]"
        )}
      >
        <span className={cn(icon, activeId === "home" && "bg-transparent text-white")}>
          <span className="relative">
            <Home size={20} />
            {homeUnread > 0 && activeId !== "home" && (
              expanded ? (
                <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/40">
                  {homeUnread > 99 ? "99+" : homeUnread}
                </span>
              ) : (
                <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[var(--bg-tertiary)] bg-red-500" />
              )
            )}
          </span>
        </span>
        {expanded && (
          <span className="truncate text-sm font-semibold">Главная</span>
        )}
      </button>

      <div className="mx-2 h-px shrink-0 bg-[var(--border-color)]" />

      {servers.map((s) => {
        const active = activeId === s.id;
        const unread = unreadCounts?.[s.id] ?? 0;
        return (
          <button
            key={s.id}
            title={s.name}
            aria-label={s.name}
            onClick={() => onSelect(s.id)}
            className={cn(
              row,
              active
                ? "bg-[var(--brand-primary)] text-white shadow-lg shadow-brand-500/30"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
            )}
          >
            <span
              className={cn(
                icon,
                active
                  ? "bg-transparent text-white"
                  : "bg-[var(--bg-primary)] text-[var(--text-secondary)]",
                !active && !expanded && "group"
              )}
            >
              <span className="relative">
                {getInitials(s.name)}
                {unread > 0 && !active && (
                  <>
                    {expanded ? (
                      <span className="absolute -right-2.5 -top-2 flex h-5 min-w-5 animate-pulse items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-1 ring-white/40">
                        {unread > 99 ? "99+" : unread}
                      </span>
                    ) : (
                      <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 animate-pulse rounded-full border-2 border-[var(--bg-tertiary)] bg-red-500" />
                    )}
                  </>
                )}
              </span>
            </span>
            {expanded && (
              <span className="truncate text-sm font-medium">{s.name}</span>
            )}
          </button>
        );
      })}

      <div className="mx-2 h-px shrink-0 bg-[var(--border-color)]" />

      <button
        title="Создать сервер"
        aria-label="Создать сервер"
        onClick={onCreate}
        className={cn(
          row,
          "text-emerald-500 hover:bg-emerald-500 hover:text-white hover:shadow-lg hover:shadow-emerald-500/30"
        )}
      >
        <span className={cn(icon, "bg-[var(--bg-primary)]")}>
          <Plus size={20} />
        </span>
        {expanded && (
          <span className="truncate text-sm font-medium">Создать сервер</span>
        )}
      </button>

      <div className="flex-1" />

      <button
        title={expanded ? "Свернуть панель" : "Развернуть панель"}
        aria-label={expanded ? "Свернуть панель" : "Развернуть панель"}
        onClick={toggle}
        className={cn(
          row,
          "text-[var(--text-muted)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]"
        )}
      >
        <span className={icon}>
          {expanded ? <ChevronsLeft size={18} /> : <ChevronsRight size={18} />}
        </span>
        {expanded && (
          <span className="truncate text-sm font-medium">Свернуть</span>
        )}
      </button>
    </div>
  );
}