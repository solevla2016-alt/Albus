"use client";

import { useCallback, useEffect, useRef } from "react";
import { useChatStore } from "./store";
import { API_URL, WS_URL } from "./api";
import type { CallMode, ChatRoom, Message, Server, WebSocketMessage } from "./types";
import {
  handleAnswer,
  handleCandidate,
  handleOffer,
  handleScreenStart,
  handleScreenStop,
  setSignalSender,
} from "./screenShare";
import {
  handleBusy,
  handleCallAccept,
  handleCallAnswer,
  handleCallCancel,
  handleCallCandidate,
  handleCallIncoming,
  handleCallOffer,
  handleCallReject,
  handleRemoteHangup,
  setCallSender,
} from "./calls";
import { CACHE_KEYS, readCache, writeCache } from "./cache";

const WS_BASE = WS_URL;

export function useWebSocket(roomName: string | null, roomId: number | null = null) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const reconnectAttempts = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isTypingRef = useRef(false);
  const pendingMessagesRef = useRef<Record<string, unknown>[]>([]);
  const roomIdRef = useRef<number | null>(roomId);
  roomIdRef.current = roomId;

  const {
    addMessage,
    removeMessage,
    updateMessage,
    setMessages,
    setOnlineUsers,
    setRooms,
    setServers,
    updateRoomMeta,
    addTypingUser,
    removeTypingUser,
    setMessageReactions,
    setAiTyping,
    setMessagePinned,
    setCall,
    setChatError,
    setConnectionState,
  } = useChatStore();

  const refreshLists = useCallback(async () => {
    try {
      const [rooms, servers] = await Promise.all([
        fetch(`${API_URL}/chat/rooms/`, { credentials: "include" }).then((r) => r.json()),
        fetch(`${API_URL}/chat/servers/`, { credentials: "include" }).then((r) => r.json()),
      ]);
      if (Array.isArray(rooms)) {
        setRooms(rooms as ChatRoom[]);
        writeCache(CACHE_KEYS.rooms, rooms);
      }
      if (Array.isArray(servers)) {
        setServers(servers as Server[]);
        writeCache(CACHE_KEYS.servers, servers);
      }
      setConnectionState("online");
    } catch {
      // Offline or slow: keep the last known lists on screen.
      const cachedRooms = readCache<ChatRoom[]>(CACHE_KEYS.rooms);
      const cachedServers = readCache<Server[]>(CACHE_KEYS.servers);
      if (cachedRooms) setRooms(cachedRooms);
      if (cachedServers) setServers(cachedServers);
      setConnectionState(navigator.onLine ? "slow" : "offline");
    }
  }, [API_URL, setRooms, setServers, setConnectionState]);

  const connect = useCallback(() => {
    if (!roomName) return;

    console.debug("[ws] connecting to room:", roomName);

    // Показываем кэш комнаты сразу, не дожидаясь ответа сервера.
    if (roomIdRef.current !== null) {
      const cached = readCache<Message[]>(CACHE_KEYS.history(roomIdRef.current));
      if (cached && cached.length > 0) setMessages(cached);
    }

    let ws: WebSocket;
    try {
      ws = new WebSocket(`${WS_BASE}/${encodeURIComponent(roomName)}/`);
    } catch (err) {
      console.error("[ws] failed to create WebSocket:", err);
      reconnectAttempts.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      console.debug("[ws] open", roomName);
      reconnectAttempts.current = 0;
      setConnectionState("online");
      setSignalSender((msg) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      });
      setCallSender((msg) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
        }
      });
      const queued = pendingMessagesRef.current.splice(0);
      queued.forEach((msg) => ws.send(JSON.stringify(msg)));
    };

    ws.onmessage = (event) => {
      const data: WebSocketMessage = JSON.parse(event.data);

      switch (data.type) {
        case "history":
          if (data.messages) {
            setMessages(data.messages);
            if (roomIdRef.current !== null) {
              writeCache(CACHE_KEYS.history(roomIdRef.current), data.messages);
            }
          }
          break;

        case "message":
          if (data.id && data.username && data.created_at) {
            const msg: Message = {
              id: data.id,
              username: data.username,
              avatar: data.avatar ?? null,
              message: data.message ?? "",
              created_at: data.created_at,
              is_edited: data.is_edited ?? false,
              reply_to: data.reply_to ?? null,
              reactions: data.reactions ?? [],
              attachment_type: data.attachment_type ?? "none",
              attachment_url: data.attachment_url ?? null,
              attachment_name: data.attachment_name ?? "",
              duration: data.duration ?? null,
              is_ai: data.is_ai ?? false,
              transcription: data.transcription ?? "",
            };
            addMessage(msg);
            removeTypingUser(data.username);
          }
          break;

        case "typing":
          if (data.username && data.is_typing !== undefined) {
            if (data.is_typing) {
              addTypingUser(data.username);
            } else {
              removeTypingUser(data.username);
            }
          }
          break;

        case "online_users":
          if (data.users) {
            setOnlineUsers(
              data.users.map((u) =>
                typeof u === "string" ? { username: u, avatar: null } : u
              )
            );
          }
          break;

        case "room_added":
          console.debug("[ws] room_added:", data.room_name);
          void refreshLists();
          break;

        case "room_update":
          if (data.room_id !== undefined) {
            updateRoomMeta(data.room_id, {
              last_message: data.last_message ?? null,
              unread_count: data.unread_count ?? 0,
            });
          }
          break;

        case "message_edited":
          if (data.id && data.message && data.updated_at) {
            updateMessage(data.id, data.message, data.updated_at);
          }
          break;

        case "message_deleted":
          if (data.id) {
            removeMessage(data.id);
          }
          break;

        case "reaction":
          if (data.id && data.reactions) {
            setMessageReactions(data.id, data.reactions);
          }
          break;

        case "user_status":
          break;

        case "ai_typing":
          setAiTyping(data.is_typing ?? data.ai_typing ?? false);
          break;

        case "ai_response":
          if (data.id && data.username && data.created_at) {
            addMessage({
              id: data.id,
              username: data.username,
              avatar: data.avatar ?? null,
              message: data.message ?? "",
              created_at: data.created_at,
              is_edited: data.is_edited ?? false,
              reply_to: data.reply_to ?? null,
              reactions: data.reactions ?? [],
              attachment_type: data.attachment_type ?? "none",
              attachment_url: data.attachment_url ?? null,
              attachment_name: data.attachment_name ?? "",
              duration: data.duration ?? null,
              is_ai: data.is_ai ?? true,
              transcription: data.transcription ?? "",
            });
            removeTypingUser(data.username);
          }
          break;

        case "pinned":
          if (data.id && data.pinned !== undefined) {
            setMessagePinned(data.id, data.pinned);
          }
          break;

        case "screen_start":
          if (data.broadcaster) {
            handleScreenStart(data.broadcaster);
          }
          break;

        case "screen_stop":
          handleScreenStop();
          break;

        case "signal": {
          const { from, sdp, candidate, call_id } = data;
          if (call_id) {
            if (data.signal_type === "webrtc_offer" && from && sdp) {
              void handleCallOffer(from, sdp, call_id);
            } else if (data.signal_type === "webrtc_answer" && from && sdp) {
              void handleCallAnswer(from, sdp, call_id);
            } else if (data.signal_type === "webrtc_candidate" && from && candidate) {
              void handleCallCandidate(from, candidate, call_id);
            }
          } else if (data.signal_type === "webrtc_offer" && from && sdp) {
            void handleOffer(from, sdp);
          } else if (data.signal_type === "webrtc_answer" && from && sdp) {
            void handleAnswer(from, sdp);
          } else if (data.signal_type === "webrtc_candidate" && from && candidate) {
            void handleCandidate(from, candidate);
          }
          break;
        }

        case "call_incoming":
          if (data.call_id && data.from && data.mode) {
            handleCallIncoming(data.call_id);
            setCall({
              id: data.call_id,
              peer: data.from,
              mode: data.mode as CallMode,
              direction: "incoming",
              phase: "ringing",
            });
          }
          break;

        case "call_accept":
          if (data.call_id && data.from) {
            handleCallAccept(data.from, data.call_id);
          }
          break;

        case "call_reject":
          if (data.call_id) {
            handleCallReject(data.call_id);
          }
          break;

        case "call_cancel":
          if (data.call_id) {
            handleCallCancel(data.call_id);
          }
          break;

        case "call_hangup":
          if (data.call_id) {
            handleRemoteHangup(data.call_id);
          }
          break;

        case "call_busy":
          if (data.call_id) {
            handleBusy(data.call_id);
          }
          break;

        case "error":
          setChatError(data.error ?? "Ошибка соединения");
          break;
      }
    };

    ws.onclose = () => {
      console.debug("[ws] closed", roomName);
      setConnectionState(navigator.onLine ? "slow" : "offline");
      if (wsRef.current !== ws) return;
      const delay = Math.min(1000 * 2 ** reconnectAttempts.current, 30000);
      reconnectAttempts.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (error) => {
      console.debug("[ws] WebSocket error:", error);
    };
  }, [roomName, addMessage, removeMessage, updateMessage, setMessages, setOnlineUsers, setRooms, setServers, updateRoomMeta, refreshLists, addTypingUser, removeTypingUser, setMessageReactions, setAiTyping, setMessagePinned, setCall, setChatError, setConnectionState]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const sendPayload = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    } else {
      pendingMessagesRef.current.push(payload);
    }
  }, []);

  const sendMessage = useCallback((text: string, replyToId?: number, attachment?: { attachment_type: string; attachment_url: string; attachment_name: string; duration?: number | null }) => {
    const payload: Record<string, unknown> = { action: "message", message: text };
    if (replyToId) payload.reply_to_id = replyToId;
    if (attachment) Object.assign(payload, attachment);
    sendPayload(payload);
  }, [sendPayload]);

  const forwardMessage = useCallback(
    (messageId: number, targetRoom: string) => {
      sendPayload({ action: "forward", message_id: messageId, room: targetRoom });
    },
    [sendPayload]
  );

  const sendTyping = useCallback((isTyping: boolean) => {
    sendPayload({ action: "typing", is_typing: isTyping });
  }, [sendPayload]);

  const editMessage = useCallback((messageId: number, text: string) => {
    sendPayload({ action: "edit", message_id: messageId, text });
  }, [sendPayload]);

  const deleteMessage = useCallback((messageId: number) => {
    sendPayload({ action: "delete", message_id: messageId });
  }, [sendPayload]);

  const toggleReaction = useCallback((messageId: number, emoji: string) => {
    sendPayload({ action: "reaction", message_id: messageId, emoji });
  }, [sendPayload]);

  const sendAiRequest = useCallback((prompt: string) => {
    sendPayload({ action: "ai_request", prompt });
  }, [sendPayload]);

  const togglePin = useCallback((messageId: number) => {
    sendPayload({ action: "pin", message_id: messageId });
  }, [sendPayload]);

  const sendRead = useCallback((lastMessageId: number) => {
    sendPayload({ action: "read", last_message_id: lastMessageId });
  }, [sendPayload]);

  const startTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTyping(true);
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTyping(false);
    }, 3000);
  }, [sendTyping]);

  return {
    sendMessage,
    startTyping,
    editMessage,
    deleteMessage,
    toggleReaction,
    sendAiRequest,
    togglePin,
    sendRead,
    forwardMessage,
  };
}
