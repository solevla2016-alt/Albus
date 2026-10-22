"use client";

import { apiFetch } from "./api";

export type PushCapabilities = {
  serviceWorker: boolean;
  notification: boolean;
  pushManager: boolean;
};

/** Что именно доступно в текущем контексте — для диагностики. */
export function pushCapabilities(): PushCapabilities {
  if (typeof window === "undefined") {
    return { serviceWorker: false, notification: false, pushManager: false };
  }
  return {
    serviceWorker: "serviceWorker" in navigator,
    notification: "Notification" in window,
    pushManager: "PushManager" in window,
  };
}

/**
 * Можно ли попробовать включить web-push.
 *
 * На iOS `Notification` появляется только у приложения с домашнего экрана —
 * это и есть проверка установки. Глобальный конструктор `PushManager`
 * проверять нельзя: Safari может не выставлять его в window, хотя менеджер
 * push есть у зарегистрированного service worker.
 */
export function isPushSupported(): boolean {
  const caps = pushCapabilities();
  return caps.serviceWorker && caps.notification;
}

export type PushState =
  | "unsupported"
  | "denied"
  | "prompt"
  | "subscribed"
  | "error";

export function pushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}
/** true на iPhone, когда Albus добавлен на домашний экран.

    На iOS web-push работает только в этом режиме, поэтому без него кнопка
    уведомлений не поможет — лучше сразу сказать об этом пользователю.
*/
export function isRunningAsPwa(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(nav.standalone) || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIos(): boolean {
  return typeof window !== "undefined" && /iP(hone|ad|od)/.test(window.navigator.userAgent);
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

async function fetchPublicKey(): Promise<string | null> {
  try {
    const data = await apiFetch<{ publicKey?: string }>(`/auth/push/vapid-key/`);
    return data.publicKey || null;
  } catch {
    return null;
  }
}

/** Включает уведомления: регистрирует воркер и отправляет подписку на сервер. */
export async function enablePush(): Promise<PushState> {
  if (!isPushSupported()) return "unsupported";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const publicKey = await fetchPublicKey();
    if (!publicKey) return "error";

    await navigator.serviceWorker.register("/sw.js");
    const registration = await navigator.serviceWorker.ready;
    if (!registration.pushManager) return "unsupported";

    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      }));

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys) return "error";

    await apiFetch("/auth/push/subscribe/", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
        user_agent: navigator.userAgent.slice(0, 300),
      }),
    });
    return "subscribed";
  } catch {
    return "error";
  }
}

/** Выключает уведомления и удаляет подписку на сервере. */
export async function disablePush(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration?.pushManager) return;
    const subscription = await registration.pushManager.getSubscription();
    const endpoint = subscription?.endpoint;
    if (endpoint) {
      await apiFetch("/auth/push/unsubscribe/", {
        method: "POST",
        body: JSON.stringify({ endpoint }),
      });
      await subscription.unsubscribe();
    }
  } catch {
    // не удалось отписаться — уведомления всё равно можно выключить в браузере
  }
}
