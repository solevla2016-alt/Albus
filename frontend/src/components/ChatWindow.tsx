"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Hash, Loader2, Maximize2, Menu, Minimize2, MonitorUp, MonitorStop, MoreVertical, Phone, ShieldBan, Unlock, UserMinus, Users, Video, X } from "lucide-react";
import { useChatStore } from "@/lib/store";
import { useWebSocket } from "@/lib/useWebSocket";
import { API_URL, apiFetch, deleteContactApi, mediaUrl } from "@/lib/api";
import { dayKey, formatDayLabel } from "@/lib/utils";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  leaveScreenShare,
  resetScreenShare,
  setScreenShareHandlers,
  startScreenShare,
  stopScreenShare,
} from "@/lib/screenShare";
import { resetCalls, setCallHandlers, startCall } from "@/lib/calls";
import type { CallMode } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { ChatInput } from "./ChatInput";
import { TypingIndicator } from "./TypingIndicator";
import { EmptyState } from "./EmptyState";
import { MembersPanel } from "./MembersPanel";
import { CallPanel } from "./CallPanel";

export function ChatWindow() {
  const { activeRoom, messages, setSidebarOpen } = useChatStore();
  const { sendMessage, startTyping, editMessage, deleteMessage, toggleReaction, sendAiRequest, togglePin, sendRead, forwardMessage } = useWebSocket(activeRoom?.name ?? null, activeRoom?.id ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetRoomUnread = useChatStore((s) => s.resetRoomUnread);
  const call = useChatStore((s) => s.call);
  const setCall = useChatStore((s) => s.setCall);
  const setCallLocalStream = useChatStore((s) => s.setCallLocalStream);
  const setCallRemoteStream = useChatStore((s) => s.setCallRemoteStream);
  const [replyTarget, setReplyTarget] = useState<{ id: number; username: string; text: string } | null>(null);
  const [forwardTarget, setForwardTarget] = useState<{
    id: number;
    username: string;
    text: string;
  } | null>(null);
  const rooms = useChatStore((s) => s.rooms);
  // Пересылка из личного чата запрещена, поэтому и кнопку не показываем.
  const canForwardFromRoom = activeRoom?.room_type !== "direct";
  const forwardTargets = rooms.filter((r) => r.room_type !== "direct" && r.id !== activeRoom?.id);

  // Блокировка и удаление доступны только в личном чате с другим человеком.
  const contactUsername =
    activeRoom?.room_type === "direct" && activeRoom.peer_username
      ? activeRoom.peer_username
      : null;
  const [peerBlocked, setPeerBlocked] = useState(false);
  const [contactBusy, setContactBusy] = useState(false);
  const { setActiveRoom, setRooms } = useChatStore();

  useEffect(() => {
    if (!activeRoom || !contactUsername) {
      setPeerBlocked(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_URL}/chat/rooms/${activeRoom.id}/bans/`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ username: string; is_active?: boolean }>) => {
        if (!cancelled) {
          setPeerBlocked(
            Array.isArray(list) &&
              list.some((b) => b.username === contactUsername && b.is_active !== false)
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [activeRoom?.id, contactUsername, peerBlocked]);

  const handleToggleBlock = async () => {
    if (!activeRoom || !contactUsername) return;
    setContactBusy(true);
    try {
      if (peerBlocked) {
        const bans = await apiFetch<Array<{ username: string; user_id: number }>>(
          `/chat/rooms/${activeRoom.id}/bans/`
        );
        const found = bans.find((b) => b.username === contactUsername);
        if (found) await apiFetch(`/chat/rooms/${activeRoom.id}/bans/${found.user_id}/`, { method: "DELETE" });
        setPeerBlocked(false);
      } else {
        await apiFetch(`/chat/rooms/${activeRoom.id}/bans/`, {
          method: "POST",
          body: JSON.stringify({ username: contactUsername }),
        });
        setPeerBlocked(true);
      }
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Не удалось изменить блокировку");
    } finally {
      setContactBusy(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!activeRoom || !contactUsername) return;
    if (!window.confirm(`Удалить контакт ${contactUsername}? Чат исчезнет из вашего списка.`)) return;
    setContactBusy(true);
    try {
      await deleteContactApi(activeRoom.id);
      const next = rooms.find((r) => r.id !== activeRoom.id);
      setRooms(rooms.filter((r) => r.id !== activeRoom.id));
      setActiveRoom(next ?? null);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "Не удалось удалить контакт");
    } finally {
      setContactBusy(false);
    }
  };
  const [editingTarget, setEditingTarget] = useState<{ id: number; text: string } | null>(null);
  const typingUsers = useChatStore((s) => s.typingUsers);
  const aiTyping = useChatStore((s) => s.aiTyping);
  const chatError = useChatStore((s) => s.chatError);
  const setChatError = useChatStore((s) => s.setChatError);
  const connectionState = useChatStore((s) => s.connectionState);
  const [searchOpen, setSearchOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1280 : false
  );
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile) {
      setMembersOpen(false);
    }
  }, [isMobile]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ id: number; username: string; message: string; created_at: string }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map);
  const user = useChatStore((s) => s.user);

  const [screenState, setScreenState] = useState<{ broadcaster: string; isMe: boolean } | null>(null);
  const [localShareStream, setLocalShareStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [startingShare, setStartingShare] = useState(false);

  useEffect(() => {
    setScreenShareHandlers({
      onSessionStart: (broadcaster) =>
        setScreenState({ broadcaster, isMe: broadcaster === user?.username }),
      onRemoteStream: (_username, stream) => {
        setRemoteStream((prev) => {
          if (prev && prev !== stream) prev.getTracks().forEach((t) => t.stop());
          return stream;
        });
      },
      onSessionEnd: () => {
        setScreenState(null);
        setLocalShareStream((prev) => {
          prev?.getTracks().forEach((t) => t.stop());
          return null;
        });
        setRemoteStream((prev) => {
          prev?.getTracks().forEach((t) => t.stop());
          return null;
        });
      },
    });
    setCallHandlers({
      onPhase: (phase, endReason) => {
        const cur = useChatStore.getState().call;
        if (!cur) return;
        useChatStore.getState().setCall({ ...cur, phase, endReason });
        if (phase === "ended") {
          window.setTimeout(() => {
            const state = useChatStore.getState();
            const latest = state.call;
            if (latest?.phase === "ended") {
              state.callRemoteStream?.getTracks().forEach((t) => t.stop());
              state.setCallRemoteStream(null);
              state.setCallLocalStream(null);
              state.setCall(null);
            }
          }, 1800);
        }
      },
      onRemoteStream: (stream) => {
        const prev = useChatStore.getState().callRemoteStream;
        if (prev && prev !== stream) prev.getTracks().forEach((t) => t.stop());
        useChatStore.getState().setCallRemoteStream(stream);
      },
    });
  }, [user?.username]);

  const lastRoomId = useRef<number | null>(null);
  useEffect(() => {
    if (lastRoomId.current !== null && lastRoomId.current !== activeRoom?.id) {
      const state = useChatStore.getState();
      resetScreenShare();
      setScreenState(null);
      setLocalShareStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setRemoteStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      resetCalls();
      state.callRemoteStream?.getTracks().forEach((t) => t.stop());
      state.setCallRemoteStream(null);
      state.setCallLocalStream(null);
      state.setCall(null);
    }
    lastRoomId.current = activeRoom?.id ?? null;
  }, [activeRoom?.id]);

  useEffect(() => {
    return () => {
      resetScreenShare();
      resetCalls();
    };
  }, []);

  const handleStartScreenShare = useCallback(async () => {
    if (startingShare || !activeRoom || !user) return;
    setStartingShare(true);
    try {
      const [mic, display] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ audio: true }),
        navigator.mediaDevices.getDisplayMedia({ video: true }),
      ]);
      const combined = new MediaStream();
      display.getVideoTracks().forEach((t) => combined.addTrack(t));
      mic.getAudioTracks().forEach((t) => combined.addTrack(t));

      setScreenState({ broadcaster: user.username, isMe: true });
      setLocalShareStream(combined);
      await startScreenShare(combined, user.username);

      const shutdown = () => {
        display.getVideoTracks()[0]?.removeEventListener("ended", shutdown);
        stopScreenShare();
        setScreenState(null);
      };
      display.getVideoTracks()[0]?.addEventListener("ended", shutdown);
    } catch {
      // пользователь отменил выбор экрана или отказал в микрофоне
    } finally {
      setStartingShare(false);
    }
  }, [startingShare, activeRoom, user]);

  const handleStopScreenShare = useCallback(() => {
    stopScreenShare();
    setScreenState((s) => (s?.isMe ? null : s));
  }, []);

  const handleLeaveScreenShare = useCallback(() => {
    leaveScreenShare();
    setScreenState(null);
  }, []);;

  const directPeer = useMemo(() => {
    const room = activeRoom;
    if (!room || room.room_type !== "direct") return null;
    if (room.peer_username) return room.peer_username;
    const me = user?.username ?? "";
    const fromMembers = room.members?.find((m) => m.username !== me)?.username;
    if (fromMembers) return fromMembers;
    return room.name !== me ? room.name : null;
  }, [activeRoom, user]);

  const handleStartCall = useCallback(
    async (mode: CallMode) => {
      if (!directPeer || !user) return;
      const res = await startCall(directPeer, mode, user.username);
      if (res) {
        setCallLocalStream(res.stream);
        setCall({
          id: res.callId,
          peer: directPeer,
          mode,
          direction: "outgoing",
          phase: "calling",
        });
      }
    },
    [directPeer, user, setCall, setCallLocalStream]
  );

  const scrollToMessage = useCallback((id: number) => {
    const el = messageRefs.current.get(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("ring-2", "ring-[var(--brand-primary)]", "ring-offset-2");
      setTimeout(() => el.classList.remove("ring-2", "ring-[var(--brand-primary)]", "ring-offset-2"), 2000);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim() || !activeRoom) return;
    setSearchLoading(true);
    try {
      const res = await fetch(
        `${API_URL}/chat/rooms/${activeRoom.id}/search/?q=${encodeURIComponent(searchQuery)}`,        { credentials: "include" }
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch {
      // silently ignore
    } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, activeRoom]);

  // Jump instantly instead of animating through the whole history, and
  // only when the user is already at the bottom: a smooth scroll after
  // an AI answer walked the viewport over every earlier question.
  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      stickToBottomRef.current = distance < 120;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [activeRoom?.id]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!stickToBottomRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, activeRoom?.id, aiTyping]);

  // Switching rooms always starts at the newest message.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
  }, [activeRoom?.id]);

  useEffect(() => {
    if (!activeRoom || messages.length === 0) return;
    resetRoomUnread(activeRoom.id);
    const lastId = messages[messages.length - 1].id;
    sendRead(lastId);
  }, [activeRoom?.id, messages.length, activeRoom, resetRoomUnread, sendRead]);

  const meUsername = user?.username ?? "";
  const isModerator =
    user?.role === "moderator" || user?.role === "admin" || activeRoom?.owner === meUsername;
  const canDelete = (msg: (typeof messages)[number]) =>
    msg.username === meUsername || isModerator;

  if (!activeRoom) {
    return <EmptyState onOpenSidebar={() => setSidebarOpen(true)} />;
  }

  const canScreenShare = activeRoom.room_type === "channel";

  return (
    <div className="flex h-full min-w-0 flex-1">
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <ChatHeader
          roomName={
            activeRoom.room_type === "direct"
              ? (directPeer ?? activeRoom.name)
              : activeRoom.name
          }
          roomType={activeRoom.room_type}
          onOpenSidebar={() => setSidebarOpen(true)}
          onToggleSearch={() => setSearchOpen((v) => !v)}
          searchOpen={searchOpen}
          onToggleMembers={() => setMembersOpen((v) => !v)}
          membersOpen={membersOpen}
          canScreenShare={canScreenShare}
          screenShareActive={!!screenState}
          screenShareLoading={startingShare}
          onToggleScreenShare={
            screenState
              ? screenState.isMe
                ? handleStopScreenShare
                : handleLeaveScreenShare
              : handleStartScreenShare
          }
          showCallButtons={!!directPeer && !call}
          onCallAudio={() => void handleStartCall("audio")}
          onCallVideo={() => void handleStartCall("video")}
          contactMenu={
            contactUsername
              ? {
                  blocked: peerBlocked,
                  busy: contactBusy,
                  onToggleBlock: () => void handleToggleBlock(),
                  onDelete: () => void handleDeleteContact(),
                }
              : undefined
          }
        />

        {connectionState !== "online" && (
          <div
            className={`flex items-center gap-2 border-b px-4 py-2 text-xs md:px-6 ${
              connectionState === "offline"
                ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
                : "border-sky-500/30 bg-sky-500/10 text-sky-600"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {connectionState === "offline"
              ? "Нет соединения — показываем последние загруженные данные"
              : "Соединение слабое, идёт восстановление…"}
          </div>
        )}

        {chatError && (
          <div className="flex items-start gap-2 border-b border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500 md:px-6">
            <span className="min-w-0 flex-1">{chatError}</span>
            <button
              onClick={() => setChatError(null)}
              aria-label="Закрыть"
              className="shrink-0 rounded p-0.5 hover:bg-red-500/20"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {screenState && (
          <ScreenShareBar
            broadcaster={screenState.broadcaster}
            isMe={screenState.isMe}
            stream={screenState.isMe ? localShareStream : remoteStream}
            onStop={handleStopScreenShare}
            onLeave={handleLeaveScreenShare}
          />
        )}

      {searchOpen && (
        <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)] px-4 py-3 md:px-6">
          <div className="flex gap-2">
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Поиск сообщений..."
              className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-primary)]"
            />
            <button
              onClick={handleSearch}
              disabled={searchLoading}
              className="rounded-lg bg-[var(--brand-primary)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {searchLoading ? "..." : "Найти"}
            </button>
          </div>
          {searchResults.length > 0 && (
            <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.id}
                  onClick={() => {
                    scrollToMessage(r.id);
                    setSearchOpen(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-[var(--bg-tertiary)]"
                >
                  <span className="shrink-0 text-xs font-medium text-[var(--brand-primary)]">
                    {r.username}
                  </span>
                  <span className="min-w-0 truncate text-xs text-[var(--text-secondary)]">
                    {r.message.length > 80 ? r.message.slice(0, 80) + "..." : r.message}
                  </span>
                </button>
              ))}
            </div>
          )}
          {searchResults.length === 0 && !searchLoading && searchQuery && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">Ничего не найдено</p>
          )}
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 space-y-1 overflow-y-auto scrollbar-thin px-4 py-4 md:px-6"
      >
        {messages.map((msg, index) => {
          const prev = index > 0 ? messages[index - 1] : null;
          const showDateDivider =
            !prev || dayKey(prev.created_at) !== dayKey(msg.created_at);
          return (
            <div key={msg.id}>
              {showDateDivider && (
                <div className="sticky top-0 z-10 flex justify-center py-2">
                  <span className="rounded-full border border-[var(--border-color)] bg-[var(--bg-primary)]/90 px-3 py-1 text-[11px] font-medium text-[var(--text-secondary)] backdrop-blur">
                    {formatDayLabel(msg.created_at)}
                  </span>
                </div>
              )}
              <div ref={(el) => { if (el) messageRefs.current.set(msg.id, el); }}>
            <MessageBubble
              message={msg}
              currentUser={useChatStore.getState().user?.username ?? ""}
              currentUserId={useChatStore.getState().user?.id}
              onReply={() =>
                setReplyTarget({ id: msg.id, username: msg.username, text: msg.message })
              }
              onEdit={() => setEditingTarget({ id: msg.id, text: msg.message })}
              onToggleReaction={(emoji) => toggleReaction(msg.id, emoji)}
              onTogglePin={() => togglePin(msg.id)}
              onDelete={canDelete(msg) ? () => deleteMessage(msg.id) : undefined}
              canForward={canForwardFromRoom}
              onForward={
                canForwardFromRoom
                  ? () =>
                      setForwardTarget({
                        id: msg.id,
                        username: msg.username,
                        text: msg.message,
                      })
                  : undefined
              }
            />
          </div>
              </div>
            );
          })}
      </div>

      <div className="px-4 pb-2 md:px-6">
        <TypingIndicator users={typingUsers} />
        {aiTyping && <AiTypingIndicator />}
      </div>

      <ChatInput
        onSend={(text) => {
          sendMessage(text, replyTarget?.id);
          setReplyTarget(null);
        }}
        onSendWithAttachment={(text, attachment) => {
          sendMessage(text, replyTarget?.id, attachment);
          setReplyTarget(null);
        }}
        onSendAiRequest={(prompt) => {
          sendAiRequest(prompt);
        }}
        roomId={activeRoom.id}
        onTyping={startTyping}
        replyTarget={replyTarget}
        onCancelReply={() => setReplyTarget(null)}
        editingTarget={editingTarget}
        onCancelEdit={() => setEditingTarget(null)}
        onSaveEdit={(text) => {
          if (editingTarget) editMessage(editingTarget.id, text);
          setEditingTarget(null);
        }}
        onError={setChatError}
      />
        </div>

        {forwardTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-4 shadow-2xl">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Переслать сообщение</div>
                  <div className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                    {forwardTarget.username}: {forwardTarget.text || "вложение"}
                  </div>
                </div>
                <button
                  onClick={() => setForwardTarget(null)}
                  className="shrink-0 rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)]"
                  aria-label="Закрыть"
                >
                  <X size={16} />
                </button>
              </div>

              {forwardTargets.length === 0 ? (
                <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                  Нет других чатов и каналов для пересылки
                </p>
              ) : (
                <div className="max-h-72 space-y-1 overflow-y-auto scrollbar-thin">
                  {forwardTargets.map((room) => (
                    <button
                      key={room.id}
                      onClick={() => {
                        forwardMessage(forwardTarget.id, room.name);
                        setForwardTarget(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                    >
                      <Hash size={14} className="shrink-0 text-[var(--text-muted)]" />
                      <span className="min-w-0 flex-1 truncate">{room.name}</span>
                      {room.server_name && (
                        <span className="shrink-0 text-xs text-[var(--text-muted)]">
                          {room.server_name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {membersOpen && (
          <div className="hidden lg:block">
            <MembersPanel onClose={() => setMembersOpen(false)} />
          </div>
        )}
        {membersOpen && (
          <div className="fixed inset-0 z-40 flex justify-end lg:hidden">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMembersOpen(false)} />
            <div className="relative z-10">
              <MembersPanel onClose={() => setMembersOpen(false)} />
            </div>
          </div>
        )}

        <CallPanel />
      </div>
  );
}

export function ChatHeader({
  roomName,
  roomType,
  onOpenSidebar,
  onToggleSearch,
  searchOpen,
  onToggleMembers,
  membersOpen,
  canScreenShare,
  screenShareActive,
  screenShareLoading,
  onToggleScreenShare,
  showCallButtons,
  onCallAudio,
  onCallVideo,
  contactMenu,
}: {
  roomName: string;
  roomType?: "group" | "channel" | "direct";
  onOpenSidebar: () => void;
  onToggleSearch: () => void;
  searchOpen: boolean;
  onToggleMembers: () => void;
  membersOpen: boolean;
  canScreenShare?: boolean;
  screenShareActive?: boolean;
  screenShareLoading?: boolean;
  onToggleScreenShare?: () => void;
  showCallButtons?: boolean;
  onCallAudio?: () => void;
  onCallVideo?: () => void;
  contactMenu?: {
    blocked: boolean;
    onToggleBlock: () => void;
    onDelete: () => void;
    busy?: boolean;
  };
}) {
  const onlineUsers = useChatStore((s) => s.onlineUsers);
  const [contactMenuOpen, setContactMenuOpen] = useState(false);
  const typeLabel =
    roomType === "direct"
      ? "Личный чат"
      : roomType === "channel"
        ? "Канал"
        : "Группа";
  return (
      <div className="safe-t safe-x flex items-center justify-between border-b border-[var(--border-color)] bg-[var(--bg-primary)]/80 px-4 py-3 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenSidebar}
          className="rounded-lg p-2 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] md:hidden"
          aria-label="Меню"
        >
          <Menu size={20} />
        </button>
        <div>
          <h2 className="text-base font-semibold">
            <span className="text-brand-600 dark:text-brand-400">
              {roomType === "channel" ? "#" : roomType === "direct" ? "@" : "#"}
            </span>{" "}
            {roomName}
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            {onlineUsers.length} в сети · {typeLabel}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {showCallButtons && onCallAudio && onCallVideo && (
          <>
            <button
              onClick={onCallAudio}
              className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
              title="Голосовой вызов"
            >
              <Phone size={18} />
            </button>
            <button
              onClick={onCallVideo}
              className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
              title="Видеозвонок"
            >
              <Video size={18} />
            </button>
          </>
        )}
        {canScreenShare && onToggleScreenShare && (
          <button
            onClick={onToggleScreenShare}
            disabled={screenShareLoading}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
              screenShareActive
                ? "bg-red-500 text-white hover:bg-red-600"
                : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
            }`}
            title={screenShareActive ? "Остановить показ экрана" : "Показать экран участникам"}
          >
            {screenShareActive ? <MonitorStop size={16} /> : <MonitorUp size={16} />}
            <span className="hidden sm:inline">
              {screenShareActive ? "Остановить" : "Экран"}
            </span>
          </button>
        )}
        <button
          onClick={onToggleMembers}
          className={`rounded-lg p-2 transition-colors ${
            membersOpen
              ? "bg-[var(--brand-primary)] text-white"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          }`}
          title="Участники"
        >
          <Users size={18} />
        </button>
        <button
          onClick={onToggleSearch}
          className={`rounded-lg p-2 transition-colors ${
            searchOpen
              ? "bg-[var(--brand-primary)] text-white"
              : "text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
          }`}
          title="Поиск"
        >
          🔍
        </button>
        {contactMenu && (
          <div className="relative">
            <button
              onClick={() => setContactMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)]"
              title="Действия с контактом"
              aria-label="Действия с контактом"
            >
              <MoreVertical size={18} />
            </button>
            {contactMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setContactMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] py-1 shadow-xl">
                  <button
                    onClick={() => {
                      setContactMenuOpen(false);
                      contactMenu.onToggleBlock();
                    }}
                    disabled={contactMenu.busy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-tertiary)] disabled:opacity-60"
                  >
                    {contactMenu.blocked ? (
                      <Unlock size={15} className="text-emerald-500" />
                    ) : (
                      <ShieldBan size={15} className="text-amber-500" />
                    )}
                    {contactMenu.blocked ? "Разблокировать" : "Заблокировать контакт"}
                  </button>
                  <button
                    onClick={() => {
                      setContactMenuOpen(false);
                      contactMenu.onDelete();
                    }}
                    disabled={contactMenu.busy}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-500 transition-colors hover:bg-red-50 disabled:opacity-60 dark:hover:bg-red-950/30"
                  >
                    <UserMinus size={15} />
                    Удалить контакт
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AiTypingIndicator() {
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-[var(--brand-primary)]" />
      AI думает...
    </div>
  );
}

function VideoSurface({
  stream,
  className,
  muted = false,
}: {
  stream: MediaStream;
  className: string;
  muted?: boolean;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.srcObject = stream;
      void el.play().catch(() => {});
    }
    return () => {
      if (el) el.srcObject = null;
    };
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={className} />;
}

function ScreenShareBar({
  broadcaster,
  isMe,
  stream,
  onStop,
  onLeave,
}: {
  broadcaster: string;
  isMe: boolean;
  stream: MediaStream | null;
  onStop: () => void;
  onLeave: () => void;
}) {
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = videoWrapRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // fullscreen не поддерживается или заблокирован
    }
  }, []);

  return (
    <div className="border-b border-[var(--border-color)] bg-[var(--bg-secondary)]/90 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4 py-2 md:px-6">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div
            ref={videoWrapRef}
            className="relative w-full overflow-hidden rounded-xl border border-[var(--border-color)] bg-black"
            style={{ minHeight: "30vh", height: "45vh", maxHeight: "70vh" }}
          >
            {stream ? (
              <VideoSurface stream={stream} muted={isMe} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full w-full items-center justify-center gap-2 text-base text-white/70">
                <Loader2 className="animate-spin" size={24} />
                {isMe ? "Вы показываете экран..." : "Подключение к экрану..."}
              </div>
            )}
            <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
              <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
              LIVE
            </div>
            <button
              onClick={toggleFullscreen}
              className="absolute right-3 top-3 rounded-lg bg-black/60 p-2 text-white/90 backdrop-blur transition-colors hover:bg-black/80 hover:text-white"
              title={isFullscreen ? "Свернуть" : "Во весь экран"}
            >
              {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
          <div className="flex shrink-0 flex-col items-center gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <MonitorUp size={18} />
              {isMe ? "Вы" : broadcaster} {isMe ? "показываете" : "показывает"} экран
            </span>
            {isMe ? (
              <button
                onClick={onStop}
                className="rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              >
                <MonitorStop size={16} className="mr-1 inline" />
                Остановить
              </button>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm text-emerald-500">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  смотрите в реальном времени
                </span>
                <button
                  onClick={onLeave}
                  className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                >
                  Отключиться от трансляции
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
