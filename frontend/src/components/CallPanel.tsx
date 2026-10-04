"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, MicOff, Phone, PhoneOff, X } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { acceptCall, cancelCall, hangupCall, rejectCall } from "@/lib/calls";
import { startRingtone, stopRingtone } from "@/lib/ringtone";

function CallVideo({
  stream,
  className,
  muted = false,
}: {
  stream: MediaStream | null;
  className: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = true;
    setNeedsTap(false);
    const start = async () => {
      try {
        await el.play();
        if (!muted) el.muted = false;
      } catch {
        el.muted = true;
        setNeedsTap(!muted);
      }
    };
    void start();
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream, className, muted]);
  if (!stream) return null;
  return (
    <>
      <video ref={ref} autoPlay playsInline muted className={className} />
      {needsTap && (
        <button
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.muted = true;
            void el
              .play()
              .then(() => {
                el.muted = false;
                setNeedsTap(false);
              })
              .catch(() => {});
          }}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 text-sm font-semibold text-white"
        >
          Нажмите, чтобы включить звук
        </button>
      )}
    </>
  );
}

function CallAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    el.muted = true;
    setNeedsTap(false);
    const start = async () => {
      try {
        await el.play();
        el.muted = false;
      } catch {
        el.muted = true;
        setNeedsTap(true);
      }
    };
    void start();
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);
  return (
    <>
      <audio ref={ref} autoPlay playsInline muted />
      {needsTap && (
        <button
          onClick={() => {
            const el = ref.current;
            if (!el) return;
            el.muted = true;
            void el
              .play()
              .then(() => {
                el.muted = false;
                setNeedsTap(false);
              })
              .catch(() => {});
          }}
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 text-sm font-semibold text-white"
        >
          Нажмите, чтобы включить звук
        </button>
      )}
    </>
  );
}

export function CallPanel() {
  const call = useChatStore((s) => s.call);
  const localStream = useChatStore((s) => s.callLocalStream);
  const remoteStream = useChatStore((s) => s.callRemoteStream);
  const user = useChatStore((s) => s.user);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    if (call && (call.phase === "calling" || call.phase === "ringing")) {
      startRingtone();
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [call?.phase, call?.direction]);

  if (!call) return null;

  const handleAccept = () => {
    void acceptCall(call.peer, call.id, call.mode, user?.username ?? "").then((stream) => {
      if (stream) useChatStore.getState().setCallLocalStream(stream);
    });
  };

  const toggleMute = () => {
    const stream = useChatStore.getState().callLocalStream;
    const track = stream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  };

  const endLabel: Record<string, string> = {
    rejected: "вызов отклонён",
    cancelled: "вызов отменён",
    busy: "абонент занят",
    failed: "не удалось установить соединение",
    ended: "вызов завершён",
  };

  const statusText =
    call.phase === "calling" || call.phase === "ringing" ? (
      <>
        <Loader2 className="animate-spin" size={14} />
        {call.direction === "outgoing" ? "звоним..." : "входящий вызов"}
      </>
    ) : call.phase === "connecting" ? (
      <>
        <Loader2 className="animate-spin" size={14} />
        подключение...
      </>
    ) : call.phase === "active" ? (
      <>
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        разговор
      </>
    ) : (
      <span className="text-[var(--text-muted)]">
        {endLabel[call.endReason ?? "ended"] ?? "вызов завершён"}
      </span>
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] shadow-2xl">
        <div
          className={`relative w-full ${
            call.mode === "video" ? "aspect-video bg-black" : "px-6 pb-14 pt-10"
          }`}
        >
          {call.mode === "video" ? (
            <>
              <CallVideo stream={remoteStream} className="h-full w-full object-contain" />
              {!remoteStream && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-white/70">
                  <Loader2 className="animate-spin" size={22} />
                  {call.phase === "active" ? "нет видеопотока" : "подключение..."}
                </div>
              )}
              {call.phase === "active" && localStream && (
                <div className="absolute bottom-3 right-3 h-1/4 w-1/4 overflow-hidden rounded-lg border border-white/30 bg-black">
                  <CallVideo
                    stream={localStream}
                    muted
                    className="h-full w-full -scale-x-100 object-cover"
                  />
                </div>
              )}
            </>
          ) : (
            <>
              <audio
                ref={(el) => {
                  if (el && remoteStream) el.srcObject = remoteStream;
                }}
                autoPlay
                playsInline
              />
              <div className="flex flex-col items-center gap-4">
              <div
                className={`h-24 w-24 overflow-hidden rounded-full border-2 border-[var(--brand-primary)] bg-[var(--brand-primary)] text-xl font-bold text-white ${
                  call.phase === "ringing" || call.phase === "connecting"
                    ? "animate-pulse"
                    : ""
                }`}
              >
                <div className="flex h-full w-full items-center justify-center">
                  {call.peer.slice(0, 2).toUpperCase()}
                </div>
              </div>
              <div className="text-center">
                <p className="text-lg font-semibold">{call.peer}</p>
                <p className="mt-1 flex items-center justify-center gap-2 text-sm text-[var(--text-secondary)]">
                  {statusText}
                </p>
              </div>
              </div>
            </>
          )}
        </div>

        {call.direction === "incoming" && call.phase === "ringing" ? (
          <div className="flex items-center justify-center gap-4 py-5">
            <button
              onClick={() => rejectCall(call.peer, call.id)}
              className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            >
              <PhoneOff size={18} />
              Отклонить
            </button>
            <button
              onClick={handleAccept}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              <Phone size={18} />
              Ответить
            </button>
          </div>
        ) : call.phase === "calling" || call.phase === "connecting" ? (
          <div className="flex items-center justify-center gap-4 py-5">
            <button
              onClick={() => cancelCall(call.peer, call.id)}
              className="flex items-center gap-2 rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-600"
            >
              <X size={18} />
              Отменить
            </button>
          </div>
        ) : call.phase === "active" ? (
          <div className="flex items-center justify-center gap-4 py-5">
            <button
              onClick={toggleMute}
              className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                muted
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]"
              }`}
              title={muted ? "Включить микрофон" : "Выключить микрофон"}
            >
              {muted ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <button
              onClick={() => hangupCall(call.peer, call.id)}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500 text-white transition-colors hover:bg-red-600"
              title="Завершить вызов"
            >
              <PhoneOff size={20} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}