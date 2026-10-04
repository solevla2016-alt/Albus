"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { apiFetch, ensureCsrfToken } from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    await ensureCsrfToken();

    if (!uid || !token) {
      setError("Ссылка недействительна");
      return;
    }
    if (password !== password2) {
      setError("Пароли не совпадают");
      return;
    }

    setLoading(true);
    try {
      await apiFetch<{ ok: boolean; username: string }>("/auth/password-reset/confirm/", {
        method: "POST",
        body: JSON.stringify({ uid, token, password, password2 }),
      });
      setDone(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка сброса пароля");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="glass-strong w-full max-w-md rounded-3xl p-8 shadow-lg"
    >
      <h1 className="text-2xl font-bold">Новый пароль</h1>
      <p className="mt-1 text-sm text-[var(--text-secondary)]">
        Придумайте новый пароль для аккаунта
      </p>

      {done ? (
        <div className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-600 dark:bg-green-950/50 dark:text-green-400">
          Пароль обновлён. Перенаправляем на страницу входа…
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Новый пароль"
              className="input-base w-full pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label={showPass ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showPass ? "text" : "password"}
              placeholder="Повторите пароль"
              className="input-base w-full pr-10"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPass((v) => !v)}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
              aria-label={showPass ? "Скрыть пароль" : "Показать пароль"}
            >
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? <Loader2 className="mx-auto animate-spin" size={20} /> : "Сохранить пароль"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-[var(--text-secondary)]">
        <Link href="/login" className="font-medium text-[var(--brand-primary)] hover:underline">
          Назад ко входу
        </Link>
      </p>
    </motion.div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-x-hidden overflow-y-auto px-4 py-6">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-brand-50 via-transparent to-brand-100/50 dark:from-brand-950 dark:to-transparent" />
      <Suspense fallback={<Loader2 className="animate-spin" size={24} />}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
