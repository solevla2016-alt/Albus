"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { apiFetch, ensureCsrfToken, joinServer } from "@/lib/api";
import { useChatStore } from "@/lib/store";
import type { ChatRoom, Server, User } from "@/lib/types";
import { Sidebar } from "@/components/Sidebar";
import { ChatWindow } from "@/components/ChatWindow";
import { ACTIVE_ROOM_KEY, persistActiveRoom } from "@/lib/activeRoom";
import { CACHE_KEYS, readCache, writeCache } from "@/lib/cache";
import { ConsentGate } from "@/components/ConsentGate";

export default function ChatPage() {
  const router = useRouter();
  const {
    user,
    setUser,
    setRooms,
    setServers,
    activeRoom,
    setActiveRoom,
    sidebarOpen,
    setSidebarOpen,
  } = useChatStore();
  const [loading, setLoading] = useState(true);
  const [needsConsent, setNeedsConsent] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await ensureCsrfToken();
        const me = await apiFetch<User>("/auth/me/");
        setUser(me);

        try {
          const consent = await apiFetch<{ needs_consent: boolean }>("/auth/consent/");
          setNeedsConsent(Boolean(consent.needs_consent));
        } catch {
          // the endpoint is missing on an older backend: do not block the app
        }

        const invite = new URLSearchParams(window.location.search).get("invite");
        if (invite) {
          await joinServer(invite).catch(() => {});
          window.history.replaceState(null, "", "/chat");
        }

        const [rooms, servers] = await Promise.all([
          apiFetch<ChatRoom[]>("/chat/rooms/"),
          apiFetch<Server[]>("/chat/servers/"),
        ]);
        setRooms(rooms);
        setServers(servers);
        writeCache(CACHE_KEYS.rooms, rooms);
        writeCache(CACHE_KEYS.servers, servers);
        if (rooms.length > 0 && !activeRoom) {
          // Возвращаемся ровно на ту комнату, на которой был сделан
          // перезагруз: сначала адрес из ?room=<id>, затем последняя
          // открытая комната из localStorage.
          const params = new URLSearchParams(window.location.search);
          const fromUrl = Number(params.get("room"));
          const fromStorage = Number(localStorage.getItem(ACTIVE_ROOM_KEY));
          const wanted = rooms.find((r) => r.id === fromUrl) ?? rooms.find((r) => r.id === fromStorage);
          if (wanted) {
            setActiveRoom(wanted);
          } else if (servers.length === 0) {
            setActiveRoom(rooms[0]);
          }
        }
      } catch {
        // Нет сети: показываем последние известные данные из кэша.
        const cachedRooms = readCache<ChatRoom[]>(CACHE_KEYS.rooms);
        const cachedServers = readCache<Server[]>(CACHE_KEYS.servers);
        if (cachedRooms?.length) {
          setRooms(cachedRooms);
          const params = new URLSearchParams(window.location.search);
          const fromUrl = Number(params.get("room"));
          const fromStorage = Number(localStorage.getItem(ACTIVE_ROOM_KEY));
          const wanted =
            cachedRooms.find((r) => r.id === fromUrl) ??
            cachedRooms.find((r) => r.id === fromStorage);
          if (wanted) setActiveRoom(wanted);
          setLoading(false);
          return;
        }
        if (cachedServers?.length) setServers(cachedServers);
        router.push("/login");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeRoom) return;
    persistActiveRoom(activeRoom.id);
  }, [activeRoom?.id]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-[var(--brand-primary)]" size={40} />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <motion.div
        initial={false}
        animate={{
          x: sidebarOpen ? 0 : "-100%",
        }}
        transition={{ duration: 0.2 }}
        className="absolute z-20 h-full w-full bg-white/95 backdrop-blur-lg dark:bg-slate-900/95 md:hidden"
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </motion.div>

      <aside className="hidden h-full w-auto shrink-0 md:block">
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </aside>

      <main className="relative flex flex-1 flex-col min-w-0">
        <ChatWindow />
      </main>

      <ConsentGate needsConsent={needsConsent} onAccepted={() => setNeedsConsent(false)} />
    </div>
  );
}
