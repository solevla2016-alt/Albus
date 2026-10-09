"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookUser,
  Bug,
  ChevronDown,
  Cookie,
  FileText,
  Home,
  Link2,
  LogOut,
  Megaphone,
  MessageCircle,
  Moon,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Sun,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { API_URL, apiFetch, deleteAccountApi, getServerInvite, mediaUrl, uploadAvatar } from "@/lib/api";
import { useTheme } from "@/lib/useTheme";
import { useChatStore } from "@/lib/store";
import type { ChatRoom, Server, User } from "@/lib/types";
import { cn, getInitials } from "@/lib/utils";
import { CACHE_KEYS, readCache, writeCache } from "@/lib/cache";
import { ServerRail, type RailKey } from "./ServerRail";
import { BugReportDialog } from "./BugReportDialog";
import { RenameDialog } from "./RenameDialog";

function directTitle(room: ChatRoom): string {
  if (room.room_type !== "direct") return room.name;
  if (room.peer_username) return room.peer_username;
  if (room.is_ai) return "AI Assistant";
  return room.name;
}

export function Sidebar({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const {
    user,
    setUser,
    rooms,
    setRooms,
    servers,
    setServers,
    activeServer,
    setActiveServer,
    activeRoom,
    setActiveRoom,
    onlineUsers,
    setSidebarOpen,
    updateServer,
  } = useChatStore();
  const { dark: themeDark, toggle: toggleTheme } = useTheme();
  const [bugReportOpen, setBugReportOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState<RailKey>("home");
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [showCreateServer, setShowCreateServer] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomDesc, setRoomDesc] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomType, setRoomType] = useState<"group" | "channel" | "direct">("group");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState("");
  const [serverName, setServerName] = useState("");
  const [serverDesc, setServerDesc] = useState("");
  const [serverRenameOpen, setServerRenameOpen] = useState(false);
  const [serverLoading, setServerLoading] = useState(false);
  const [directError, setDirectError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<number[]>([]);
  const [statusDraft, setStatusDraft] = useState("");
  const [birthDraft, setBirthDraft] = useState("");
  const [privacyDraft, setPrivacyDraft] = useState<User["message_privacy"]>("everyone");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [inviteMsg, setInviteMsg] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const openProfile = () => {
    setProfileMsg("");
    setStatusDraft(user?.status ?? "");
    setBirthDraft(user?.birth_date ?? "");
    setPrivacyDraft(user?.message_privacy ?? "everyone");
    setProfileOpen((v) => !v);
  };

  const handleDeleteAccount = async () => {
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteAccountApi(deletePassword);
      // The server ends the session, so a reload lands on the login page.
      window.location.assign("/login");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Не удалось удалить аккаунт");
      setDeleteBusy(false);
    }
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg("");
    try {
      const data = await apiFetch<User>("/auth/profile/", {
        method: "POST",
        body: JSON.stringify({
          status: statusDraft,
          birth_date: birthDraft || "",
          message_privacy: privacyDraft,
        }),
      });
      setUser(data);
      setProfileMsg("Сохранено");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (file: File) => {
    setProfileMsg("");
    try {
      const data = await uploadAvatar<User>(file);
      setUser(data);
      setProfileMsg("Аватар обновлён");
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : "Ошибка загрузки аватара");
    }
  };

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/auth/users/`, { credentials: "include" });
      if (res.ok) {
        const data: Array<{ id: number; username: string; avatar: string | null; status: string; is_ai?: boolean }> = await res.json();
        setUsers(data);
        writeCache(CACHE_KEYS.users, data);
      }
    } catch {
      // Офлайн: контакты берём из кэша, чтобы список не пустовал.
      const cached = readCache<Array<{ id: number; username: string; avatar: string | null; status: string; is_ai?: boolean }>>(CACHE_KEYS.users);
      if (cached?.length) setUsers(cached);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const selectContext = (key: RailKey) => {
    setActiveId(key);
    if (key === "home") {
      setActiveServer(null);
    } else {
      const s = servers.find((x) => x.id === key) ?? null;
      setActiveServer(s);
    }
    const ctxRooms = key === "home"
      ? rooms.filter((r) => r.room_type === "direct")
      : rooms.filter((r) => r.server === key && r.room_type !== "direct");
    if (ctxRooms.length > 0) {
      setActiveRoom(ctxRooms[0]);
    }
  };

  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (didAutoSelect.current) return;
    if (servers.length === 0) return;
    didAutoSelect.current = true;

    // Комната уже восстановлена из адреса или из хранилища: показываем
    // её контекст и не переключаемся на первую комнату первого сервера.
    if (activeRoom) {
      const sid = activeRoom.server ?? "home";
      setActiveId(sid);
      setActiveServer(sid === "home" ? null : servers.find((s) => s.id === sid) ?? null);
      return;
    }
    selectContext(servers[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [servers.length, activeRoom?.id]);

  const currentServer = activeId === "home" ? null : servers.find((s) => s.id === activeId) ?? null;

  const filterContext = (r: ChatRoom): boolean => {
    if (activeId === "home") return r.room_type === "direct";
    return r.server === activeId && r.room_type !== "direct";
  };

  const filteredRooms = rooms
    .filter(filterContext)
    .filter((r) => directTitle(r).toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (Boolean(a.is_ai) !== Boolean(b.is_ai)) return a.is_ai ? -1 : 1;
      return 0;
    });

  const unreadCounts = Object.fromEntries(
    servers.map((s) => [
      s.id,
      rooms
        .filter((r) => r.server === s.id && r.room_type !== "direct" && r.id !== activeRoom?.id)
        .reduce((acc, r) => acc + (r.unread_count ?? 0), 0),
    ])
  );
  const homeUnread = rooms
    .filter((r) => r.room_type === "direct" && r.id !== activeRoom?.id)
    .reduce((acc, r) => acc + (r.unread_count ?? 0), 0);

  const openCreateServer = () => {
    setShowCreateServer((v) => !v);
    setShowCreateRoom(false);
  };

  const openCreateRoom = () => {
    setShowCreateRoom((v) => !v);
    setShowCreateServer(false);
  };

  const handleCreateServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerLoading(true);
    setCreateError("");
    try {
      if (!serverName.trim()) {
        setCreateError("Укажите название сервера");
        return;
      }
      const server = await apiFetch<Server>("/chat/servers/create/", {
        method: "POST",
        body: JSON.stringify({
          name: serverName.trim(),
          description: serverDesc.trim(),
        }),
      });
      setServers([server, ...servers]);
      setShowCreateServer(false);
      setServerName("");
      setServerDesc("");
      selectContext(server.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Ошибка создания сервера");
    } finally {
      setServerLoading(false);
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateLoading(true);
    setCreateError("");
    try {
      let name = roomName.trim();
      if (roomType === "direct" && !name && selectedUsers.length === 1) {
        name = users.find((u) => u.id === selectedUsers[0])?.username ?? "";
      }
      if (!name) {
        setCreateError("Укажите название или выберите собеседника");
        return;
      }
      const room = await apiFetch<ChatRoom>("/chat/rooms/create/", {
        method: "POST",
        body: JSON.stringify({
          name,
          description: roomDesc.trim(),
          is_private: roomType === "direct" ? true : isPrivate,
          room_type: roomType,
          server: currentServer?.id ?? null,
        }),
      });
      for (const uid of selectedUsers) {
        await apiFetch(`/chat/rooms/${room.id}/members/`, {
          method: "POST",
          body: JSON.stringify({ user_id: uid }),
        }).catch(() => {});
      }
      const res = await fetch(`${API_URL}/chat/rooms/`, { credentials: "include" });
      if (res.ok) {
        const all = await res.json();
        setRooms(all);
        const fresh = all.find((r: ChatRoom) => r.id === room.id) ?? room;
        setActiveRoom(fresh);
      } else {
        setRooms([room, ...rooms]);
        setActiveRoom(room);
      }
      setShowCreateRoom(false);
      setRoomName("");
      setRoomDesc("");
      setIsPrivate(false);
      setRoomType("group");
      setSelectedUsers([]);
      setSidebarOpen(false);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Ошибка создания");
    } finally {
      setCreateLoading(false);
    }
  };

  const toggleUser = (id: number) => {
    setSelectedUsers((prev) => {
      if (roomType === "direct") {
        return prev.includes(id) ? [] : [id];
      }
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  };

  const openDirect = async (other: User) => {
    const existing = rooms.find(
      (r) => r.room_type === "direct" && r.peer_id === other.id
    );
    if (existing) {
      setActiveRoom(existing);
      setSidebarOpen(false);
      return;
    }
    try {
      const room = await apiFetch<ChatRoom>("/chat/rooms/create/", {
        method: "POST",
        body: JSON.stringify({
          name: other.username,
          description: "",
          is_private: true,
          room_type: "direct",
        }),
      });
      const res = await fetch(`${API_URL}/chat/rooms/`, { credentials: "include" });
      if (res.ok) {
        const all = await res.json();
        setRooms(all);
      } else {
        setRooms([room, ...rooms]);
      }
      setActiveRoom(room);
      setSidebarOpen(false);
    } catch (err) {
      setDirectError(
        err instanceof Error ? err.message : "Не удалось открыть личный чат"
      );
    }
  };

  const handleLogout = async () => {
    await apiFetch("/auth/logout/", { method: "POST" }).catch(() => {});
    setUser(null);
    router.push("/login");
  };

  return (
    <div className="flex h-full">
      <ServerRail
        servers={servers}
        activeId={activeId}
        onSelect={selectContext}
        onCreate={openCreateServer}
        unreadCounts={unreadCounts}
        homeUnread={homeUnread}
      />

      <div className="relative flex h-full w-full shrink-0 flex-col border-r border-[var(--border-color)] bg-[var(--bg-primary)] md:w-60 xl:w-72">
        <div className="flex shrink-0 items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={() => selectContext("home")}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--brand-primary)] md:hidden"
              aria-label="Главная"
              title="Показать все комнаты"
            >
              <Home size={16} />
            </button>
            <div
              className="truncate text-sm font-bold"
              title={activeId === "home" ? "Albus" : (currentServer?.name ?? "Сервер")}
            >
              {activeId === "home" ? "Albus" : currentServer?.name ?? "Сервер"}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {currentServer?.can_edit && (
              <button
                onClick={() => setServerRenameOpen(true)}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                aria-label="Переименовать сервер"
                title="Переименовать сервер"
              >
                <Pencil size={16} />
              </button>
            )}
            {currentServer && (
              <button
onClick={async () => {
                    try {
                      const { token } = await getServerInvite<{ token: string }>(currentServer.id);
                      const url = `${window.location.origin}?invite=${token}`;
                      await navigator.clipboard.writeText(url);
                      setInviteMsg("Ссылка скопирована");
                      setTimeout(() => setInviteMsg(""), 2000);
                    } catch {
                      setInviteMsg("Ошибка");
                      setTimeout(() => setInviteMsg(""), 2000);
                    }
                  }}
                className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                aria-label="Скопировать приглашение в сервер"
                title="Скопировать приглашение в сервер"
              >
                <Link2 size={16} />
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] md:hidden"
              aria-label="Закрыть"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {activeId === "home" ? (
          <div className="px-3 pb-2 text-xs text-[var(--text-muted)]">
            Личные сообщения и контакты
          </div>
        ) : currentServer ? (
          <div className="px-3 pb-2 text-xs text-[var(--text-muted)]">
            {currentServer.description || "Текстовые каналы сервера"}
            {inviteMsg && (
              <span className="ml-2 font-medium text-emerald-500">{inviteMsg}</span>
            )}
          </div>
        ) : (
          <div className="px-3 pb-2 text-xs text-[var(--text-muted)]" />
        )}

        <div className="px-3 pb-2">
          <div className="relative">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск..."
              className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-secondary)] py-2 pl-8 pr-3 text-sm placeholder-[var(--text-muted)] focus:border-[var(--brand-primary)] focus:outline-none"
            />
          </div>
        </div>

        {(showCreateServer || showCreateRoom) && (
          <div className="absolute inset-0 z-30 flex flex-col bg-[var(--bg-primary)]">
            <div className="flex-1 overflow-y-auto scrollbar-thin">
        {showCreateServer && (
          <form onSubmit={handleCreateServer} className="mx-3 mb-2 flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Новый сервер
              </span>
              <button
                type="button"
                onClick={() => setShowCreateServer(false)}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
            <input
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="Название сервера"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
            <input
              value={serverDesc}
              onChange={(e) => setServerDesc(e.target.value)}
              placeholder="Описание (необязательно)"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none"
            />
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white">
              {serverName.trim() ? getInitials(serverName) : "НС"}
            </div>
            {createError && <span className="text-xs text-red-500">{createError}</span>}
            <button type="submit" className="btn-primary py-2 text-sm" disabled={serverLoading}>
              {serverLoading ? <LoaderSpinner /> : "Создать сервер"}
            </button>
          </form>
        )}

        {showCreateRoom && (
          <form onSubmit={handleCreateRoom} className="mx-3 mb-2 flex flex-col gap-2 rounded-xl border border-[var(--border-color)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                Новая комната
              </span>
              <button
                type="button"
                onClick={() => setShowCreateRoom(false)}
                className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X size={14} />
              </button>
            </div>
            <input
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              placeholder={roomType === "direct" ? "Собеседник (или выберите ниже)" : "Название канала"}
              className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none"
              autoFocus
            />
            {roomType !== "direct" && (
              <input
                value={roomDesc}
                onChange={(e) => setRoomDesc(e.target.value)}
                placeholder="Описание"
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] px-3 py-2 text-sm focus:outline-none"
              />
            )}
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-primary)] p-1">
              {(
                [
                  { value: "group", label: "Группа", icon: Users },
                  { value: "channel", label: "Канал", icon: Megaphone },
                  { value: "direct", label: "Личный", icon: MessageCircle },
                ] as const
              ).map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    setRoomType(value);
                    setSelectedUsers([]);
                  }}
                  className={
                    roomType === value
                      ? "flex items-center justify-center gap-1 rounded-md bg-[var(--brand-primary)] px-2 py-1.5 text-xs font-medium text-white"
                      : "flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                  }
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
            {roomType !== "direct" && (
              <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  className="accent-[var(--brand-primary)]"
                />
                Приватная
              </label>
            )}
            {users.length > 0 && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                  {roomType === "direct" ? "Выберите собеседника" : "Добавить участников"}
                </div>
                <div className="max-h-36 space-y-0.5 overflow-y-auto scrollbar-thin">
                  {users.map((u) => {
                    const checked = selectedUsers.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
                      >
                        <input
                          type={roomType === "direct" ? "radio" : "checkbox"}
                          checked={checked}
                          onChange={() => toggleUser(u.id)}
                          className="accent-[var(--brand-primary)]"
                        />
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-brand-400 to-brand-600">
                          {u.avatar ? (
                            <img src={mediaUrl(u.avatar)} alt={u.username} className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[9px] font-bold text-white">{u.username.slice(0, 2).toUpperCase()}</span>
                          )}
                        </span>
                        <span className="truncate">{u.username}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
            {createError && <span className="text-xs text-red-500">{createError}</span>}
            <button type="submit" className="btn-primary py-2 text-sm" disabled={createLoading}>
              {createLoading ? <LoaderSpinner /> : "Создать"}
            </button>
          </form>
        )}
            </div>
          </div>
        )}

        {/* ServerRail is `hidden md:flex`, so below the md breakpoint there was
            no way to reach a server at all: the create button was shown but the
            server it created could never be selected or listed. This strip is
            the mobile equivalent of the rail. */}
        <div className="flex shrink-0 gap-1.5 overflow-x-auto scrollbar-thin px-3 pb-2 md:hidden">
          <button
            onClick={() => selectContext("home")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
              activeId === "home"
                ? "border-[var(--brand-primary)] bg-[var(--brand-light)] text-[var(--brand-primary)]"
                : "border-[var(--border-color)] text-[var(--text-secondary)]"
            )}
          >
            <Home size={13} />
            Личные
          </button>
          {servers.map((s) => (
            <button
              key={s.id}
              onClick={() => selectContext(s.id)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
                activeId === s.id
                  ? "border-[var(--brand-primary)] bg-[var(--brand-light)] text-[var(--brand-primary)]"
                  : "border-[var(--border-color)] text-[var(--text-secondary)]"
              )}
            >
              {s.name}
              {unreadCounts[s.id] ? (
                <span className="ml-0.5 rounded-full bg-[var(--brand-primary)] px-1.5 text-[10px] font-bold text-white">
                  {unreadCounts[s.id]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          onClick={openCreateServer}
          className="mx-3 mb-1 flex items-center gap-2 rounded-lg border border-dashed border-emerald-500/50 px-3 py-2 text-sm text-emerald-500 transition-colors hover:border-emerald-500 hover:bg-emerald-500/10 md:hidden"
        >
          <Plus size={14} />
          Создать сервер
        </button>

        <button
          onClick={openCreateRoom}
          className="mx-3 mb-1 flex items-center gap-2 rounded-lg border border-dashed border-[var(--border-color)] px-3 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:border-[var(--brand-primary)] hover:text-[var(--brand-primary)]"
        >
          <Plus size={14} />
          {activeId === "home" ? "Начать разговор" : "Создать канал"}
        </button>
        {directError && (
          <p className="mx-3 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {directError}
          </p>
        )}
        {activeId === "home" && (
          <>
            <div className="flex shrink-0 items-center gap-2 px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              <BookUser size={13} />
              Контакты
            </div>
            <div className="mx-2 mb-2 flex shrink-0 gap-2 overflow-x-auto scrollbar-thin px-1">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => openDirect(u)}
                  title={`Написать ${u.username}`}
                  className="flex shrink-0 flex-col items-center gap-1"
                >
                  <div className="relative">
                    {u.avatar ? (
                      <img
                        src={mediaUrl(u.avatar)}
                        alt={u.username}
                        className="h-11 w-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                        {u.username.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <span
                      className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[var(--bg-primary)]",
                        onlineUsers.some((x) => x.username === u.username) || u.is_ai ? "bg-emerald-500" : "bg-gray-400"
                      )}
                    />
                  </div>
                  <span className="max-w-[64px] truncate text-[10px] text-[var(--text-secondary)]">
                    {u.username}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="flex shrink-0 items-center gap-2 px-5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Users size={13} />
          {activeId === "home"
            ? "Сообщения"
            : `Каналы · ${servers.find((s) => s.id === activeId)?.member_count ?? 0} участников`}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin px-2 pb-2">
          {filteredRooms.length === 0 ? (
            <div className="px-3 py-8 text-center text-sm text-[var(--text-muted)]">
              {search
                ? "Ничего не найдено"
                : activeId === "home"
                  ? "Начните разговор с контактами"
                  : "Каналов пока нет"}
            </div>
          ) : (
            filteredRooms.map((room) => {
              const isChannel = room.room_type === "channel" || room.room_type === "group";
              const isDirect = room.room_type === "direct";
              const isActive = activeRoom?.id === room.id;
              return (
                <button
                  key={room.id}
                  onClick={() => {
                    setActiveRoom(room);
                    setSidebarOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isActive ? "bg-[var(--brand-light)]" : "hover:bg-[var(--bg-secondary)]"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold",
                      isDirect && "rounded-full",
                      isDirect
                        ? "bg-gradient-to-br from-brand-400 to-brand-700 text-white"
                        : "bg-gradient-to-br from-brand-400 to-brand-600 text-white"
                    )}
                  >
                    {isDirect ? (
                      (() => {
                        const peer = users.find(
                          (u) => u.id === room.peer_id || u.username === directTitle(room)
                        );
                        return peer?.avatar ? (
                          <img src={mediaUrl(peer.avatar)} alt={peer.username} className="h-full w-full object-cover" />
                        ) : (
                          <MessageCircle size={16} />
                        );
                      })()
                    ) : isChannel ? (
                      <span aria-hidden>#</span>
                    ) : (
                      getInitials(room.name)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex items-center gap-1 truncate text-sm",
                        isActive ? "font-medium text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                      )}
                    >
                      {!isDirect && (
                        <span className={isActive ? "text-[var(--brand-primary)]" : "text-[var(--text-muted)]"}>#</span>
                      )}
                      <span className="truncate">
                        {isDirect ? directTitle(room) : room.name}
                      </span>
                    </div>
                    <div className="truncate text-xs text-[var(--text-muted)]">
                      {room.last_message
                        ? `${room.last_message.username}: ${room.last_message.text}`
                        : room.description || "Нет сообщений"}
                    </div>
                  </div>
                  {!!room.unread_count && (
                    <span
                      className={cn(
                        "flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold text-white",
                        isActive
                          ? "animate-pulse bg-red-500 shadow-sm ring-1 ring-white/40"
                          : "bg-[var(--brand-primary)]"
                      )}
                    >
                      {room.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="relative border-t border-[var(--border-color)] p-2">
          <button
            onClick={openProfile}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--bg-secondary)]"
          >
            <div className="relative">
              {user?.avatar ? (
                <img
                  src={mediaUrl(user.avatar)}
                  alt={user.username ?? ""}
                  className="h-8 w-8 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-bold text-white">
                  {getInitials(user?.username ?? "Albus")}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-[var(--bg-primary)]" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-sm font-medium">{user?.username}</div>
              <div className="text-xs text-emerald-500">В сети</div>
            </div>
            <ChevronDown size={15} className="text-[var(--text-muted)]" />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setProfileOpen(false)} />
              <div className="absolute bottom-full left-2 z-40 mb-2 w-64 rounded-xl border border-[var(--border-color)] bg-[var(--bg-primary)] p-3 shadow-xl">
                <div className="flex items-center gap-3">
                  <label className="relative cursor-pointer">
                    <img
                      src={user?.avatar ? mediaUrl(user.avatar) : undefined}
                      alt={user?.username ?? ""}
                      className={cn(
                        "h-12 w-12 rounded-full object-cover",
                        !user?.avatar && "hidden"
                      )}
                    />
                    {!user?.avatar && (
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white">
                        {getInitials(user?.username ?? "Albus")}
                      </div>
                    )}
                    <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[9px] font-semibold text-white md:opacity-0 md:transition-opacity md:hover:opacity-100">
                      Сменить
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAvatarUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{user?.username}</div>
                    <div className="truncate text-xs text-[var(--text-muted)]">{user?.email}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  <label className="text-xs font-medium text-[var(--text-muted)]">Статус</label>
                  <input
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    placeholder="Ваш статус"
                    className="input-base"
                  />
                  <label className="text-xs font-medium text-[var(--text-muted)]">Дата рождения</label>
                  <input
                    type="date"
                    value={birthDraft}
                    onChange={(e) => setBirthDraft(e.target.value)}
                    className="input-base"
                  />
                  <label className="text-xs font-medium text-[var(--text-muted)]">
                    Кто может писать мне
                  </label>
                  <select
                    value={privacyDraft}
                    onChange={(e) => setPrivacyDraft(e.target.value as User["message_privacy"])}
                    className="input-base"
                  >
                    <option value="everyone">Все</option>
                    <option value="contacts">Только контакты</option>
                    <option value="nobody">Никто</option>
                  </select>
                  {profileMsg && (
                    <span className="text-xs text-emerald-500">{profileMsg}</span>
                  )}
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileSaving}
                    className="btn-primary py-1.5 text-sm"
                  >
                    {profileSaving ? "Сохранение..." : "Сохранить"}
                  </button>
                </div>

                <div className="my-2 h-px bg-[var(--border-color)]" />
                <button
                  onClick={() => setBugReportOpen(true)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <Bug size={15} />
                  Сообщить о проблеме
                </button>
                <Link
                  href="/terms"
                  target="_blank"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <FileText size={15} />
                  Правила использования
                </Link>
<Link
                  href="/privacy"
                  target="_blank"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <ShieldCheck size={15} />
                  Политика обработки персональных данных
                </Link>
                <Link
                  href="/cookies"
                  target="_blank"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  <Cookie size={15} />
                  Политика использования cookie
                </Link>
                <button
                  onClick={() => {
                    setDeleteOpen(true);
                    setDeleteError("");
                    setDeletePassword("");
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Trash2 size={15} />
                  Удалить учётную запись
                </button>
                <button
                  onClick={toggleTheme}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {themeDark ? <Sun size={15} /> : <Moon size={15} />}
                  {themeDark ? "Светлая тема" : "Тёмная тема"}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/30"
                >
                  <LogOut size={15} />
                  Выйти
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {bugReportOpen && <BugReportDialog onClose={() => setBugReportOpen(false)} />}

      {serverRenameOpen && currentServer && (
        <RenameDialog
          title="Переименовать сервер"
          label="Название сервера"
          initialName={currentServer.name}
          initialDescription={currentServer.description}
          path={`/chat/servers/${currentServer.id}/`}
          onClose={() => setServerRenameOpen(false)}
          onRenamed={(data) => {
            updateServer(currentServer.id, data);
            writeCache(CACHE_KEYS.servers, servers.map((s) => (s.id === currentServer.id ? { ...s, ...data } : s)));
          }}
        />
      )}

      {deleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="glass-strong w-full max-w-sm rounded-2xl p-5 shadow-lg">
            <h3 className="text-base font-semibold">Удалить учётную запись?</h3>
            <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              Профиль, аватар и статус будут удалены. Ваши сообщения останутся в
              чатах, но авторство станет анонимным — это предусмотрено политикой
              обработки персональных данных.
            </p>
            <input
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Подтвердите пароль"
              className="input-base mt-4"
              autoComplete="current-password"
            />
            {deleteError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="btn-ghost flex-1"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteBusy || !deletePassword}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {deleteBusy ? "Удаляем…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoaderSpinner() {
  return (
    <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
  );
}