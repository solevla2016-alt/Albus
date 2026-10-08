"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { OPERATOR } from "@/lib/operator";

const COOKIE_NOTICE_KEY = "albus-cookie-notice";

export function useCookieNotice() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(COOKIE_NOTICE_KEY)) setOpen(true);
    } catch {
      // private mode or storage disabled: stay silent rather than nag
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, "1");
    } catch {
      // ignore
    }
    setOpen(false);
  };

  return { open, accept };
}

/**
 * Cookie banner. The site sets no analytics or advertising cookies, so there is
 * nothing to opt out of: only the strictly necessary session and CSRF cookies,
 * which are disclosed in the cookie policy instead.
 */
export function CookieNotice() {
  const { open, accept } = useCookieNotice();
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Уведомление об использовании cookie"
      className="fixed inset-x-0 bottom-0 z-50 p-3 sm:p-4"
    >
      <div className="glass-strong mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl p-4 shadow-lg sm:flex-row sm:items-center">
        <p className="flex-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          Сайт использует только обязательные cookie:{" "}
          <code className="text-[11px]">sessionid</code> для входа и{" "}
          <code className="text-[11px]">csrftoken</code> для защиты от подделки
          запросов. Аналитических и рекламных cookie не используется. Подробнее —{" "}
          <Link href="/cookies" className="text-[var(--brand-primary)] hover:underline">
            политика использования cookie
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={accept}
            className="btn-primary px-4 py-2 text-sm"
          >
            Понятно
          </button>
        </div>
      </div>
    </div>
  );
}