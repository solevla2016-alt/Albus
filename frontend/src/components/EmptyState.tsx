"use client";

import { motion } from "framer-motion";
import { Menu, MessagesSquare, Sparkles } from "lucide-react";

export function EmptyState({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden p-6 text-center">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[var(--brand-primary)]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-pink-500/10 blur-3xl" />

      <button
        onClick={onOpenSidebar}
        className="mb-6 rounded-xl border border-[var(--border-color)] p-3 text-[var(--text-secondary)] md:hidden"
      >
        <Menu size={20} />
      </button>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="relative mb-5"
      >
        <div className="absolute inset-0 rounded-3xl bg-[var(--brand-primary)]/30 blur-xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-brand-500 to-indigo-700 text-white shadow-lg shadow-brand-500/30">
          <MessagesSquare size={34} />
        </div>
      </motion.div>
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-2xl font-bold"
      >
        Выберите комнату
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="mt-2 max-w-sm text-sm leading-relaxed text-[var(--text-secondary)]"
      >
        Выберите чат слева или создайте новую комнату, чтобы начать общение с командой Albus
      </motion.p>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="mt-6 flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--bg-secondary)]/70 px-3 py-1.5 text-xs text-[var(--text-muted)]"
      >
        <Sparkles size={12} className="text-[var(--brand-primary)]" />
        Советы: напишите /ai вопрос — ментор по Python ответит прямо в чате
      </motion.div>
    </div>
  );
}