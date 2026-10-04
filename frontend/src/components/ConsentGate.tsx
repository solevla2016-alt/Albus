"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, ensureCsrfToken } from "@/lib/api";

const ERRORS = {
  terms: "Примите правила использования",
  privacy: "Дайте согласие на обработку персональных данных",
  network: "Не удалось сохранить согласие, проверьте соединение",
};

/**
 * One-time gate shown to users who registered before the documents
 * existed, and again whenever the document versions change.
 */
export function ConsentGate({
  needsConsent,
  onAccepted,
}: {
  needsConsent: boolean;
  onAccepted: () => void;
}) {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!needsConsent) return null;

  const submit = async () => {
    setError("");
    if (!acceptTerms || !acceptPrivacy) {
      setError(!acceptTerms ? ERRORS.terms : ERRORS.privacy);
      return;
    }
    setBusy(true);
    try {
      await ensureCsrfToken();
      await apiFetch("/auth/consent/accept/", {
        method: "POST",
        body: JSON.stringify({ accept_terms: true, accept_privacy: true }),
      });
      onAccepted();
    } catch {
      setError(ERRORS.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-5 shadow-2xl">
        <h2 className="text-lg font-semibold">Прежде чем продолжить</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          В мессенджере появились правила использования и политика обработки персональных
          данных. Вам нужно подтвердить, что вы с ними ознакомлены.
        </p>

        <div className="mt-4 space-y-3">
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
            />
            <span>
              Принимаю{" "}
              <Link
                href="/terms"
                target="_blank"
                className="text-[var(--brand-primary)] hover:underline"
              >
                правила использования
              </Link>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={acceptPrivacy}
              onChange={(e) => setAcceptPrivacy(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--brand-primary)]"
            />
            <span>
              Даю согласие на обработку{" "}
              <Link
                href="/privacy"
                target="_blank"
                className="text-[var(--brand-primary)] hover:underline"
              >
                персональных данных
              </Link>
            </span>
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <button
          onClick={submit}
          disabled={busy || !acceptTerms || !acceptPrivacy}
          className="btn-primary mt-5 w-full"
        >
          {busy ? "Сохраняем…" : "Принимаю и продолжаю"}
        </button>
      </div>
    </div>
  );
}