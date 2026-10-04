/**
 * Small localStorage cache so the app stays usable on a slow or lost
 * connection: the last known rooms, servers, users and per-room message
 * history are shown instantly and revalidated in the background.
 */

const PREFIX = "albus-cache:";

function available(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const probe = `${PREFIX}__probe`;
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

export function readCache<T>(key: string, maxAgeMs = Infinity): T | null {
  if (!available()) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; data: T };
    if (Date.now() - parsed.at > maxAgeMs) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCache(key: string, data: unknown): void {
  if (!available()) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // quota exceeded: drop caches and retry once
    clearCache();
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify({ at: Date.now(), data }));
    } catch {
      // give up silently, caching is best effort
    }
  }
}

export function clearCache(): void {
  if (!available()) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(PREFIX)) keys.push(key);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

export const CACHE_KEYS = {
  rooms: "rooms",
  servers: "servers",
  users: "users",
  history: (roomId: number) => `history:${roomId}`,
} as const;
