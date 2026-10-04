"use client";

import { useEffect, useRef, useState } from "react";
import { CornerUpLeft, Mic, Paperclip, Pencil, Plus, SendHorizonal, Smile, Square, Video, X } from "lucide-react";
import { API_URL, csrfHeaders } from "@/lib/api";
import {
  checkFileSize,
  DEFAULT_UPLOAD_LIMITS,
  formatSize,
  MAX_MESSAGE_LENGTH,
} from "@/lib/uploadLimits";

const EMOJI_LIST = [
  "😀", "😂", "🤣", "😊", "😍", "😘", "😉", "😎",
  "🤔", "😴", "🥳", "😢", "😭", "😡", "🤯", "🥺",
  "👍", "👎", "👏", "🙌", "🤝", "🙏", "💪", "✌️",
  "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💯",
  "🔥", "✨", "🎉", "🎊", "⚡", "🌟", "🚀", "☀️",
  "🌹", "🌸", "🍀", "🎂", "🍕", "☕", "🎮", "🎵",
];

interface PendingAttachment {
  blob: Blob;
  type: "audio" | "video" | "file";
  name: string;
  duration?: number | null;
}

export function ChatInput({
  onSend,
  onSendWithAttachment,
  onSendAiRequest,
  roomId,
  onTyping,
  replyTarget,
  onCancelReply,
  editingTarget,
  onCancelEdit,
  onSaveEdit,
  onError,
}: {
  onSend: (text: string) => void;
  onSendWithAttachment: (text: string, attachment: { attachment_type: string; attachment_url: string; attachment_name: string; duration?: number | null }) => void;
  onSendAiRequest: (prompt: string) => void;
  roomId: number;
  onTyping: () => void;
  replyTarget: { id: number; username: string; text: string } | null;
  onCancelReply: () => void;
  editingTarget: { id: number; text: string } | null;
  onCancelEdit: () => void;
  onSaveEdit: (text: string) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const draftRef = useRef("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [pending, setPending] = useState<PendingAttachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingType, setRecordingType] = useState<"audio" | "video" | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const [uploadLimits, setUploadLimits] = useState<Record<string, number>>(DEFAULT_UPLOAD_LIMITS);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/chat/upload-limits/`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data && typeof data.audio === "number") setUploadLimits(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (editingTarget && textareaRef.current) {
      // keep whatever was typed before editing so it can be restored
      draftRef.current = value;
      setValue(editingTarget.text);
      textareaRef.current.focus();
    } else if (!editingTarget) {
      setValue(draftRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingTarget]);

  // Replying used to leave the composer unfocused and silent, so the
  // button looked like it did nothing: nothing was typed into the input.
  useEffect(() => {
    if (replyTarget) textareaRef.current?.focus();
  }, [replyTarget?.id]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 150)}px`;
    }
  }, [value]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const cleanupRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setRecordingType(null);
    setRecordingTime(0);
  };

  const startRecording = async (type: "audio" | "video") => {
    try {
      const constraints: MediaStreamConstraints =
        type === "audio" ? { audio: true } : { audio: true, video: { width: 640, height: 480 } };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      const mimeType = type === "audio"
        ? (MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm")
        : (MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus") ? "video/webm;codecs=vp9,opus" : "video/webm");

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
        const recorded = chunksRef.current.reduce((sum, c) => sum + c.size, 0);
        const limit = uploadLimits[type];
        if (recorded > limit && recorder.state === "recording") {
          recorder.stop();
          onError(
            `Запись превысила лимит: максимум ${formatSize(limit)} для ${
              type === "audio" ? "аудио" : "видео"
            }`
          );
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const ext = type === "audio" ? "webm" : "webm";
        const name = `${type}_record_${Date.now()}.${ext}`;
        setPending({ blob, type, name, duration: recordingTime || null });
        cleanupRecording();
      };

      recorder.start();
      setRecording(true);
      setRecordingType(type);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch {
      cleanupRecording();
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
  };

  const cancelRecording = () => {
    recorderRef.current?.stop();
    cleanupRecording();
    setPending(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const tooBig = checkFileSize(file, uploadLimits);
    if (tooBig) {
      onError(tooBig);
      e.target.value = "";
      return;
    }
    const type = file.type.startsWith("audio/") ? "audio"
      : file.type.startsWith("video/") ? "video"
      : "file";
    setPending({ blob: file, type, name: file.name });
    e.target.value = "";
  };

  const handleSubmit = async () => {
    const text = value.trim();

    if (editingTarget) {
      onSaveEdit(text);
      setValue("");
      return;
    }

    if (!text && !pending) return;

    if (text.length > MAX_MESSAGE_LENGTH) {
      onError(`Сообщение длиннее ${MAX_MESSAGE_LENGTH} символов — сократите на ${text.length - MAX_MESSAGE_LENGTH}`);
      return;
    }

    // AI-запрос через префикс /ai
    if (!pending && text.startsWith("/ai ") && text.length > 4) {
      onSendAiRequest(text.slice(4).trim());
      setValue("");
      return;
    }

    if (pending) {
      const formData = new FormData();
      formData.append("file", pending.blob, pending.name);
      try {
        const res = await fetch(`${API_URL}/chat/rooms/${roomId}/upload/`, {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders("POST"),
          body: formData,
        });
        if (!res.ok) throw new Error("Ошибка загрузки");
        const data = await res.json();
        onSendWithAttachment(text, {
          attachment_type: data.attachment_type,
          attachment_url: data.attachment_url,
          attachment_name: data.attachment_name,
          duration: data.duration ?? pending.duration ?? null,
        });
      } catch {
        return;
      }
      setPending(null);
    } else {
      onSend(text);
    }
    setValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onTyping();
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    if (!el) {
      setValue((v) => v + emoji);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + emoji + value.slice(end);
    setValue(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
    onTyping();
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = (value.trim() || pending) && !tooLong;

  return (
    <div className="safe-b safe-x relative border-t border-[var(--border-color)] px-4 py-3 md:px-6">
      {(replyTarget || editingTarget) && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2 text-sm">
          {replyTarget ? (
            <CornerUpLeft size={14} className="text-[var(--brand-primary)]" />
          ) : (
            <Pencil size={14} className="text-[var(--brand-primary)]" />
          )}
          <div className="min-w-0 flex-1">
            <span className="font-medium text-[var(--brand-primary)]">
              {replyTarget ? replyTarget.username : "Редактирование"}
            </span>
            <span className="ml-1 truncate text-[var(--text-secondary)]">
              {replyTarget?.text ?? editingTarget?.text}
            </span>
          </div>
          <button
            onClick={() => (replyTarget ? onCancelReply() : onCancelEdit())}
            className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {pending && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-3 py-2">
          {pending.type === "audio" && (
            <audio controls src={URL.createObjectURL(pending.blob)} className="h-8 flex-1" />
          )}
          {pending.type === "video" && (
            <video controls src={URL.createObjectURL(pending.blob)} className="h-16 rounded-lg" />
          )}
          {pending.type === "file" && (
            <div className="flex items-center gap-2 text-sm">
              <Paperclip size={14} className="text-[var(--brand-primary)]" />
              <span className="truncate">{pending.name}</span>
            </div>
          )}
          <button
            onClick={() => setPending(null)}
            className="ml-auto rounded p-1 text-[var(--text-muted)] hover:text-red-500"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {emojiOpen && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setEmojiOpen(false)} />
          <div className="absolute bottom-full left-0 z-40 mb-2 grid w-56 grid-cols-6 gap-0.5 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-2 shadow-xl sm:w-72 sm:grid-cols-8">
            {EMOJI_LIST.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => insertEmoji(emoji)}
                className="rounded-lg p-1.5 text-xl transition-colors hover:bg-[var(--bg-tertiary)]"
              >
                {emoji}
              </button>
            ))}
          </div>
        </>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,video/*,.pdf,.doc,.docx,.txt,.zip,.rar"
          className="hidden"
          onChange={handleFileSelect}
        />

        {recording ? (
          <div className="flex items-center gap-2">
            <button
              onClick={stopRecording}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-red-500 text-white animate-pulse"
              title="Остановить"
            >
              <Square size={18} />
            </button>
            <span className="text-sm font-medium text-red-500 tabular-nums">
              {formatTime(recordingTime)}
            </span>
            <span className="text-xs text-[var(--text-muted)]">
              {recordingType === "audio" ? "Запись голоса..." : "Запись видео..."}
            </span>
          </div>
        ) : (
          <>
            <div className="hidden gap-2 md:flex">
              <button
                type="button"
                onClick={() => setEmojiOpen((v) => !v)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-primary)]"
                aria-label="Эмодзи"
              >
                <Smile size={18} />
              </button>
              <button
                type="button"
                onClick={() => startRecording("audio")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-primary)]"
                title="Записать голосовое"
              >
                <Mic size={18} />
              </button>
              <button
                type="button"
                onClick={() => startRecording("video")}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-primary)]"
                title="Записать видео"
              >
                <Video size={18} />
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-primary)]"
                title="Прикрепить файл"
              >
                <Paperclip size={18} />
              </button>
            </div>
            <div className="relative md:hidden">
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] text-[var(--text-secondary)] transition-colors hover:text-[var(--brand-primary)]"
                aria-label="Ещё"
              >
                <Plus size={18} />
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                  <div className="absolute bottom-full left-0 z-40 mb-2 grid grid-cols-2 gap-2 rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 shadow-xl">
                    <button
                      type="button"
                      onClick={() => { setEmojiOpen(true); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--brand-primary)]"
                    >
                      <Smile size={18} />
                      <span className="text-xs">Эмодзи</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { startRecording("audio"); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--brand-primary)]"
                    >
                      <Mic size={18} />
                      <span className="text-xs">Голос</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { startRecording("video"); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--brand-primary)]"
                    >
                      <Video size={18} />
                      <span className="text-xs">Видео</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { fileInputRef.current?.click(); setMoreOpen(false); }}
                      className="flex flex-col items-center gap-1 rounded-xl px-3 py-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--brand-primary)]"
                    >
                      <Paperclip size={18} />
                      <span className="text-xs">Файл</span>
                    </button>
                    <p className="col-span-2 mt-1 border-t border-[var(--border-color)] pt-2 text-center text-[10px] leading-tight text-[var(--text-muted)]">
                      Аудио до {formatSize(uploadLimits.audio)} · видео до{" "}
                      {formatSize(uploadLimits.video)}
                      <br />
                      Фото до {formatSize(uploadLimits.image)} · файлы до{" "}
                      {formatSize(uploadLimits.file)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {!recording && (
          <>
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Введите сообщение..."
              rows={1}
              className="max-h-[150px] min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 text-sm placeholder-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
            <button
              onClick={handleSubmit}
              disabled={!canSend}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-white transition-all hover:bg-[var(--brand-hover)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Отправить"
            >
              <SendHorizonal size={18} />
            </button>
          </>
        )}
      </div>

      {tooLong && (
        <p className="mt-1.5 text-right text-xs text-red-500">
          Сообщение длиннее {MAX_MESSAGE_LENGTH} символов — сократите на{" "}
          {value.length - MAX_MESSAGE_LENGTH}
        </p>
      )}
    </div>
  );
}
