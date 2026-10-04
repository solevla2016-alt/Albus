const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://127.0.0.1:8000/ws/chat";

function readCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(new RegExp(`(^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[2]) : "";
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "TRACE"]);

/**
 * Django enforces CSRF on every session authenticated write, so the token
 * from the csrftoken cookie has to be echoed back in X-CSRFToken.
 */
export function csrfHeaders(method: string): Record<string, string> {
  if (SAFE_METHODS.has(method.toUpperCase())) return {};
  const token = readCookie("csrftoken");
  return token ? { "X-CSRFToken": token } : {};
}

/** Make sure a csrftoken cookie exists before the first write. */
export async function ensureCsrfToken(): Promise<void> {
  if (typeof document === "undefined") return;
  if (readCookie("csrftoken")) return;
  try {
    await fetch(`${API_BASE}/auth/csrf/`, { credentials: "include" });
  } catch {
    // offline: the write will fail with a network error instead
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...csrfHeaders(options.method ?? "GET"),
      ...(options.headers ?? {}),
    },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(extractErrorMessage(error));
  }

  return res.json();
}

function extractErrorMessage(payload: unknown): string {
  if (typeof payload === "string" && payload) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["error", "message", "detail"]) {
      const value = record[key];
      if (typeof value === "string" && value) return value;
    }

    const messages: string[] = [];
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        messages.push(value.filter((v): v is string => typeof v === "string").join(" "));
      } else if (typeof value === "string") {
        messages.push(value);
      }
    }
    const joined = messages.filter(Boolean).join(" ");
    if (joined) return joined;
  }
  return "Ошибка запроса";
}

export async function uploadFile<T>(
  path: string,
  file: File,
  extra?: Record<string, string>
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  if (extra) {
    Object.entries(extra).forEach(([k, v]) => form.append(k, v));
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? error.message ?? "Ошибка загрузки");
  }
  return res.json();
}

export async function uploadAvatar<T>(file: File): Promise<T> {
  const form = new FormData();
  form.append("avatar", file);
  const res = await fetch(`${API_BASE}/auth/avatar/`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? error.message ?? "Ошибка загрузки аватара");
  }
  return res.json();
}

export async function joinServer<T>(token: string): Promise<T> {
  return apiFetch<T>(`/chat/servers/join/${token}/`, { method: "POST" });
}

export async function getServerInvite<T>(serverId: number): Promise<T> {
  return apiFetch<T>(`/chat/servers/${serverId}/invite/`);
}

const apiOrigin = new URL(API_URL).origin;
const MEDIA_BASE = apiOrigin;

export function mediaUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${MEDIA_BASE}${path}`;
}

export async function deleteMessageApi(roomId: number, messageId: number): Promise<void> {
  const res = await fetch(`${API_BASE}/chat/rooms/${roomId}/messages/${messageId}/`, {
    method: "DELETE",
    credentials: "include",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? error.message ?? "Ошибка удаления сообщения");
  }
}

export async function getRoomBans<T>(roomId: number): Promise<T> {
  return apiFetch<T>(`/chat/rooms/${roomId}/bans/`);
}

export async function banUserApi<T>(roomId: number, username: string, reason = ""): Promise<T> {
  return apiFetch<T>(`/chat/rooms/${roomId}/bans/`, {
    method: "POST",
    body: JSON.stringify({ username, reason }),
  });
}

export async function unbanUserApi<T>(roomId: number, userId: number): Promise<T> {
  return apiFetch<T>(`/chat/rooms/${roomId}/bans/${userId}/`, { method: "DELETE" });
}

export async function setRoleApi<T>(username: string, role: string): Promise<T> {
  return apiFetch<T>(`/auth/set-role/`, {
    method: "POST",
    body: JSON.stringify({ username, role }),
  });
}

/** Удалить контакт: выйти из личного чата, чтобы он исчез из списка. */
export async function deleteContactApi<T>(roomId: number): Promise<T> {
  return apiFetch<T>(`/chat/rooms/${roomId}/leave/`, { method: "POST" });
}

export async function searchMessages<T>(roomId: number, q: string): Promise<T> {
  const res = await fetch(
    `${API_BASE}/chat/rooms/${roomId}/search/?q=${encodeURIComponent(q)}`,
    { credentials: "include" }
  );
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.error ?? error.message ?? "Ошибка поиска");
  }
  return res.json();
}