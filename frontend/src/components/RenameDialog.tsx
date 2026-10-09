import { useEffect, useRef, useState } from "react";

import { apiFetch } from "@/lib/api";

interface RenameDialogProps {
  title: string;
  label: string;
  initialName: string;
  initialDescription?: string;
  path: string;
  onClose: () => void;
  onRenamed: (data: { name: string; description: string }) => void;
}

/**
 * Переименование комнаты или сервера.
 *
 * Право решает сервер: если у текущего пользователя его нет, диалог показывает
 * ошибку ответа, а не молча закрывается.
 */
export function RenameDialog({
  title,
  label,
  initialName,
  initialDescription = "",
  path,
  onClose,
  onRenamed,
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError("");
    try {
      const data = await apiFetch<{ name: string; description: string }>(path, {
        method: "PATCH",
        body: JSON.stringify({
          name: trimmed,
          description: description.trim(),
        }),
      });
      onRenamed({ name: data.name, description: data.description ?? "" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving) onClose();
      }}
    >
      <form
        onSubmit={submit}
        className="glass-strong w-full max-w-sm rounded-2xl p-5 shadow-lg"
      >
        <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>

        <label className="mt-4 block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Название"
          className="mt-1 w-full rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />

        <label className="mt-3 block text-sm font-medium text-[var(--text-secondary)]">
          Описание
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Необязательно"
          className="mt-1 w-full resize-none rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />

        {error && (
          <p className="mt-3 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-60"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="rounded-xl bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--brand-hover)] disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </div>
      </form>
    </div>
  );
}