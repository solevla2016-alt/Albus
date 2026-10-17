"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ShieldAlert, X } from "lucide-react";

import { apiFetch } from "@/lib/api";

type SafetyAlert = {
  id: number;
  username: string;
  room_name: string;
  rule: string;
  rule_label: string;
  excerpt: string;
  excerpt_cleared: boolean;
  notified: boolean;
  status: string;
  status_label: string;
  reviewed_by_username: string;
  reviewed_at: string | null;
  created_at: string;
};

const STATUS_NEXT: Record<string, string> = {
  new: "reviewed",
  reviewed: "new",
};

function formatWhen(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Сигналы безопасности для модератора.
 *
 * Письмо на почту несёт обезличенную выдержку, потому что оператору нужно
 * понять, что произошло, не читая переписку. Здесь виден тот же сигнал, но
 * уже под учётной записью с правами модератора, поэтому здесь же его можно
 * отметить разобранным.
 */
export function SafetyAlertsDialog({ onClose }: { onClose: () => void }) {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<SafetyAlert[]>("/chat/safety-alerts/");
      setAlerts(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить сигналы");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const advance = async (alert: SafetyAlert) => {
    const next = STATUS_NEXT[alert.status] ?? "reviewed";
    try {
      const updated = await apiFetch<SafetyAlert>(`/chat/safety-alerts/${alert.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: next }),
      });
      setAlerts((prev) => prev.map((a) => (a.id === alert.id ? updated : a)));
    } catch {
      // список не трогаем, если обновление не прошло
    }
  };

  const unresolved = alerts.filter((a) => a.status === "new").length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-500" />
            <h2 className="text-base font-semibold">Сигналы безопасности</h2>
            {unresolved > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                {unresolved}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-tertiary)]"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-500">{error}</p>}

          {loading && alerts.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">Загрузка…</p>
          )}

          {!loading && !error && alerts.length === 0 && (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              Сигналов пока нет.
            </p>
          )}

          <ul className="space-y-2">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="rounded-xl border border-[var(--border-color)] p-3 text-sm"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-medium">{alert.username}</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">
                      {alert.rule_label}
                    </span>
                  </div>
                  <button
                    onClick={() => advance(alert)}
                    className="shrink-0 rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
                  >
                    {alert.status === "new" ? "Разобрано" : "Вернуть в новое"}
                  </button>
                </div>

                <p className="mt-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                  {alert.excerpt_cleared && !alert.excerpt ? (
                    <span className="italic text-[var(--text-muted)]">
                      Текст удалён по сроку хранения
                    </span>
                  ) : (
                    alert.excerpt
                  )}
                </p>

                <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                  {formatWhen(alert.created_at)}
                  {alert.room_name ? ` · ${alert.room_name}` : ""}
                  {alert.notified ? " · письмо отправлено" : " · письмо не отправлено"}
                  {alert.reviewed_by_username
                    ? ` · разобрал ${alert.reviewed_by_username}`
                    : ""}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}