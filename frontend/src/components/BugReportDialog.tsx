"use client";

import { useEffect, useState } from "react";
import { Bug, Check, X } from "lucide-react";
import { apiFetch, ensureCsrfToken } from "@/lib/api";

type Report = {
  id: number;
  username: string;
  text: string;
  page_url: string;
  status: string;
  admin_note: string;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "Новое",
  in_progress: "В работе",
  resolved: "Решено",
};

const STATUS_NEXT: Record<string, string> = {
  new: "in_progress",
  in_progress: "resolved",
  resolved: "new",
};

/** Lets the user report a problem and shows moderators what came in. */
export function BugReportDialog({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [isModerator, setIsModerator] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);

  useEffect(() => {
    // moderators also get the incoming list
    apiFetch<Report[]>("/chat/bug-reports/list/")
      .then((data) => {
        if (Array.isArray(data)) {
          setReports(data);
          setIsModerator(true);
        }
      })
      .catch(() => {
        // 403 for regular users
      });
  }, []);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setStatus("sending");
    setError("");
    try {
      await ensureCsrfToken();
      await apiFetch("/chat/bug-reports/", {
        method: "POST",
        body: JSON.stringify({
          text: body,
          page_url: window.location.href.slice(0, 500),
          user_agent: navigator.userAgent.slice(0, 300),
        }),
      });
      setStatus("sent");
      setText("");
      window.setTimeout(onClose, 1200);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Не удалось отправить отчёт");
    }
  };

  const advance = async (report: Report) => {
    try {
      await apiFetch(`/chat/bug-reports/${report.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ status: STATUS_NEXT[report.status] ?? "new" }),
      });
      setReports((prev) =>
        prev.map((r) =>
          r.id === report.id ? { ...r, status: STATUS_NEXT[r.status] ?? "new" } : r
        )
      );
    } catch {
      // keep the list as is if the update failed
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--border-color)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Bug size={18} className="text-[var(--brand-primary)]" />
            <h2 className="text-base font-semibold">Сообщить о проблеме</h2>
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
          {status === "sent" ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-emerald-500">
              <Check size={28} />
              Спасибо, отчёт отправлен
            </div>
          ) : (
            <>
              <label className="text-sm font-medium text-[var(--text-secondary)]">
                Что пошло не так?
              </label>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={5}
                maxLength={4000}
                placeholder="Опишите, что ожидали и что получилось"
                className="input-base mt-2 resize-none"
                autoFocus
              />
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Страница и браузер подставятся автоматически: {window.location.pathname}
              </p>
              {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

              <button
                onClick={send}
                disabled={status === "sending" || text.trim().length === 0}
                className="btn-primary mt-4 w-full"
              >
                {status === "sending" ? "Отправляем…" : "Отправить отчёт"}
              </button>
            </>
          )}

          {isModerator && reports.length > 0 && (
            <div className="mt-6 border-t border-[var(--border-color)] pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Поступившие отчёты
              </h3>
              <ul className="mt-2 space-y-2">
                {reports.map((report) => (
                  <li
                    key={report.id}
                    className="rounded-xl border border-[var(--border-color)] p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{report.username}</span>
                      <button
                        onClick={() => advance(report)}
                        className="shrink-0 rounded-full border border-[var(--border-color)] px-2 py-0.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
                      >
                        {STATUS_LABEL[report.status] ?? report.status} →
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-[var(--text-secondary)]">
                      {report.text}
                    </p>
                    {report.page_url && (
                      <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]">
                        {report.page_url}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}