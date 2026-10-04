"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch, ensureCsrfToken } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    await ensureCsrfToken();
    try {
      await apiFetch<{ ok: boolean }>("/auth/password-reset/request/", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка запроса");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-transparent to-brand-100/50 dark:from-brand-950 dark:to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-strong w-full max-w-md rounded-3xl p-8 shadow-lg"
      >
        <div className="mb-6 flex flex-col items-center">
          <h1 className="text-2xl font-bold">Восстановление пароля</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Укажите email — отправим письмо со ссылкой для сброса
          </p>
        </div>

        {sent ? (
          <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
            Письмо отправлено. Проверьте почту — ссылка действует 1 час.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <input
              type="email"
              placeholder="Email"
              className="input-base"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />

            {error && (
              <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? <Loader2 className="mx-auto animate-spin" size={20} /> : "Отправить письмо"}
            </button>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
          <Link href="/login" className="font-medium text-[var(--brand-primary)] hover:underline">
            Назад ко входу
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
