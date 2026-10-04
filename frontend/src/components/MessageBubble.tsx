"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CheckCheck, CornerUpLeft, Download, ExternalLink, FileIcon, Forward, Loader2, Pencil, Pin, SmilePlus, Trash2, Volume2, X } from "lucide-react";
import type { Message, ReactionItem } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { mediaUrl, API_URL, csrfHeaders } from "@/lib/api";
import { useChatStore } from "@/lib/store";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

const URL_RE = /(https?:\/\/[^\s<>"']+)/gi;

/** Renders message text with clickable links and a compact domain preview. */
function MessageText({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  if (parts.length === 1) {
    return <div className="whitespace-pre-wrap break-words">{text}</div>;
  }

  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((part, i) => {
        if (!URL_RE.test(part) || !/^https?:\/\//i.test(part)) {
          URL_RE.lastIndex = 0;
          return <span key={i}>{part}</span>;
        }
        URL_RE.lastIndex = 0;
        let host = part;
        try {
          host = new URL(part).hostname.replace(/^www\./, "");
        } catch {
          host = part;
        }
        return (
          <span key={i} className="my-0.5 flex flex-col gap-1">
            <a
              href={part}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "inline-flex w-fit max-w-full items-center gap-1 rounded px-1 py-0.5 underline underline-offset-2",
                "break-all transition-opacity hover:opacity-80"
              )}
            >
              <ExternalLink size={12} className="shrink-0" />
              <span className="break-all">{part}</span>
            </a>
            <span
              className={cn(
                "w-fit max-w-full truncate rounded-full px-2 py-0.5 text-[10px]",
                "bg-black/10 text-current opacity-70 dark:bg-white/15"
              )}
            >
              {host}
            </span>
          </span>
        );
      })}
    </div>
  );
}

export function MessageBubble({
  message,
  currentUser,
  currentUserId,
  onReply,
  onEdit,
  onToggleReaction,
  onTogglePin,
  onDelete,
  onForward,
  canForward,
}: {
  message: Message;
  currentUser: string;
  currentUserId?: number;
  onReply: () => void;
  onEdit: () => void;
  onToggleReaction: (emoji: string) => void;
  onTogglePin: () => void;
  onDelete?: () => void;
  onForward?: () => void;
  canForward?: boolean;
}) {
  const isOwn = message.username === currentUser;
  const isAi = message.is_ai ?? false;
  const isPinned = message.pinned ?? false;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [imageOpen, setImageOpen] = useState(false);
  const reactions = message.reactions ?? [];

  const { setMessageTranscription } = useChatStore();
  const activeRoom = useChatStore((s) => s.activeRoom);

  const handleTranscribe = async () => {
    if (!activeRoom) return;
    setTranscribing(true);
    try {
      const res = await fetch(
        `${API_URL}/chat/rooms/${activeRoom.id}/transcribe/`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", ...csrfHeaders("POST") },
          body: JSON.stringify({ message_id: message.id }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        if (data.transcription) {
          setMessageTranscription(message.id, data.transcription);
        }
      }
    } catch {
      // ignore
    } finally {
      setTranscribing(false);
    }
  };

  const grouped = reactions.reduce<Map<string, ReactionItem[]>>((acc, r) => {
    const list = acc.get(r.emoji) ?? [];
    list.push(r);
    acc.set(r.emoji, list);
    return acc;
  }, new Map());

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn("group flex gap-2.5", isOwn ? "flex-row-reverse" : "flex-row")}
    >
      {!isOwn &&
        (message.avatar ? (
          <img
            src={mediaUrl(message.avatar)}
            alt={message.username}
            className="mt-1 h-8 w-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className={cn(
              "mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
              isAi
                ? "bg-gradient-to-br from-emerald-400 to-teal-600"
                : "bg-gradient-to-br from-brand-400 to-brand-600"
            )}
          >
            {isAi ? "AI" : message.username.slice(0, 2).toUpperCase()}
          </div>
        ))}

      <div className={cn("flex max-w-[70%] flex-col md:max-w-[60%]", isOwn ? "items-end" : "items-start")}>
        {!isOwn && (
          <span className="mb-1 ml-1 text-xs font-medium text-[var(--text-secondary)]">
            {isAi ? "AI-ассистент" : message.username}
          </span>
        )}

        <div
          className={cn(
            "relative rounded-2xl px-3.5 py-2.5 text-sm shadow-md",
            isAi
              ? "rounded-tl-md border border-emerald-200 bg-emerald-50 text-emerald-900 shadow-emerald-500/10 dark:border-emerald-900/50 dark:bg-emerald-950/60 dark:text-emerald-50"
              : isOwn
                ? "rounded-br-md bg-gradient-to-br from-brand-500 to-brand-600 text-white shadow-[var(--brand-primary)]/20"
                : "rounded-tl-md bg-[var(--message-other)] text-[var(--message-other-text)]"
          )}
        >
          {message.forwarded_from && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-black/10 px-2 py-1 text-xs dark:bg-black/25">
              <Forward size={12} className="shrink-0" />
              <div className="min-w-0">
                <span className="font-medium">Переслано от {message.forwarded_from.username}</span>
                {message.forwarded_from.text && (
                  <span className="opacity-70"> · {message.forwarded_from.text}</span>
                )}
              </div>
            </div>
          )}

          {message.reply_to && (
            <div className="mb-1.5 flex items-center gap-1.5 rounded-lg bg-black/10 px-2 py-1 text-xs dark:bg-black/20">
              <CornerUpLeft size={12} className="shrink-0" />
              <div className="min-w-0">
                <span className="font-medium">{message.reply_to.username}: </span>
                <span className="opacity-70">{message.reply_to.text}</span>
              </div>
            </div>
          )}

          {message.attachment_type === "audio" && message.attachment_url && (
            <div className="mb-2">
              <audio controls src={mediaUrl(message.attachment_url)} className="w-full" />
              {message.transcription ? (
                <div className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-black/5 px-2 py-1.5 text-xs italic text-[var(--text-secondary)] dark:bg-white/10">
                  <Volume2 size={12} className="mt-0.5 shrink-0" />
                  <span>{message.transcription}</span>
                </div>
              ) : (
                <button
                  onClick={handleTranscribe}
                  disabled={transcribing}
                  className={cn(
                    "mt-1.5 flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium",
                    "transition-colors hover:underline disabled:opacity-60",
                    isOwn
                      ? "bg-white/20 text-white hover:bg-white/25"
                      : "bg-[var(--brand-light)] text-[var(--brand-primary)] hover:bg-[var(--brand-light)]/70"
                  )}
                >
                  {transcribing ? <Loader2 size={12} className="animate-spin" /> : <Volume2 size={12} />}
                  {transcribing ? "Распознаю..." : "Транскрибировать"}
                </button>
              )}
            </div>
          )}
          {message.attachment_type === "video" && message.attachment_url && (
            <div className="mb-2">
              <video controls src={mediaUrl(message.attachment_url)} className="max-h-64 rounded-lg" />
            </div>
          )}
          {message.attachment_type === "image" && message.attachment_url && (
            <button
              onClick={() => setImageOpen(true)}
              className="mb-2 block w-full max-w-[260px] overflow-hidden rounded-lg"
              aria-label="Открыть изображение"
            >
              <img
                src={mediaUrl(message.attachment_url)}
                alt={message.attachment_name}
                loading="lazy"
                className="max-h-56 w-full object-cover transition-transform hover:scale-[1.02]"
              />
            </button>
          )}
          {message.attachment_type === "file" && message.attachment_url && (
            <a
              href={mediaUrl(message.attachment_url)}
              download={message.attachment_name}
              className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 transition-colors hover:bg-[var(--bg-tertiary)]"
            >
              <FileIcon size={18} className="shrink-0 text-[var(--brand-primary)]" />
              <span className="min-w-0 flex-1 truncate text-sm">{message.attachment_name}</span>
              <Download size={14} className="shrink-0 text-[var(--text-muted)]" />
            </a>
          )}

          {message.is_ai && message.message ? (
            <AiText text={message.message} />
          ) : (
            message.message && <MessageText text={message.message} />
          )}

          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-60">
            <span>{formatTime(message.created_at)}</span>
            {isOwn && <CheckCheck size={12} />}
            {message.is_edited && <span className="italic">(изменено)</span>}
            {isPinned && (
              <span className="inline-flex items-center gap-0.5 font-medium text-[var(--brand-primary)]">
                <Pin size={10} /> закреплено
              </span>
            )}
          </div>
        </div>

        {grouped.size > 0 && (
          <div className={cn("mt-1 flex flex-wrap gap-1", isOwn ? "flex-row-reverse" : "")}>
            {Array.from(grouped.entries()).map(([emoji, items]) => {
              const reactedSelf =
                currentUser !== undefined &&
                items.some((r) => r.username === currentUser);
              const title = items.map((r) => r.username).join(", ");
              return (
                <button
                  key={emoji}
                  onClick={() => onToggleReaction(emoji)}
                  title={title}
                  className={cn(
                    "flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    reactedSelf
                      ? "border-[var(--brand-primary)] bg-[var(--brand-light)]"
                      : "border-[var(--border-color)] bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)]"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="tabular-nums">{items.length}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className={cn("relative mt-1 flex gap-1 md:opacity-0 md:transition-opacity md:group-hover:opacity-100", isOwn ? "flex-row-reverse" : "")}>
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
              title="Реакция"
            >
              <SmilePlus size={14} />
            </button>
            {pickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setPickerOpen(false)}
                />
                <div
                  className={cn(
                    "absolute z-40 flex gap-1 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-1.5 shadow-lg",
                    isOwn ? "right-0" : "left-0"
                  )}
                >
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => {
                        onToggleReaction(emoji);
                        setPickerOpen(false);
                      }}
                      className="rounded-lg p-1 text-lg transition-colors hover:bg-[var(--bg-tertiary)]"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            onClick={onReply}
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
            title="Ответить"
          >
            <CornerUpLeft size={14} />
          </button>
          {canForward && onForward && (
            <button
              onClick={onForward}
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
              title="Переслать в другой чат"
              aria-label="Переслать"
            >
              <Forward size={14} />
            </button>
          )}
          {isOwn && (
            <button
              onClick={onEdit}
              className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
              title="Редактировать"
            >
              <Pencil size={14} />
            </button>
          )}
          {isOwn && (
            <button
              onClick={onTogglePin}
              className={
                isPinned
                  ? "rounded p-1 text-[var(--brand-primary)]"
                  : "rounded p-1 text-[var(--text-muted)] hover:text-[var(--brand-primary)]"
              }
              title={isPinned ? "Открепить" : "Закрепить"}
            >
              <Pin size={14} />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="rounded p-1 text-[var(--text-muted)] hover:text-red-500"
              title="Удалить сообщение"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {imageOpen && message.attachment_url && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setImageOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={() => setImageOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
          <img
            src={mediaUrl(message.attachment_url)}
            alt={message.attachment_name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </motion.div>
  );
}

function AiText({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="whitespace-pre-wrap break-words">
      {blocks.map((block, i) => {
        const isCode = i % 2 === 1;
        if (!isCode) {
          return <span key={i}>{block}</span>;
        }
        const nl = block.indexOf("\n");
        const lang = nl === -1 ? "" : block.slice(0, nl).trim();
        const code = nl === -1 ? block : block.slice(nl + 1);
        return (
          <pre
            key={i}
            className="my-1.5 overflow-x-auto rounded-lg bg-black/85 p-2.5 text-xs leading-relaxed text-green-300 dark:bg-black/70"
          >
            <code>{code.replace(/\n$/, "")}</code>
          </pre>
        );
      })}
    </div>
  );
}
