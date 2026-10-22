"use client";

import { useCallback, useEffect, useState } from "react";
import { BellOff, BellRing, Loader2 } from "lucide-react";

import {
  disablePush,
  enablePush,
  isIos,
  isPushSupported,
  isRunningAsPwa,
  pushCapabilities,
  pushPermission,
  type PushState,
} from "@/lib/push";

const LABELS: Record<PushState, string> = {
  unsupported: "Уведомления не поддерживаются",
  denied: "Уведомления заблокированы в браузере",
  prompt: "Включить уведомления",
  subscribed: "Выключить уведомления",
  error: "Не удалось включить уведомления",
};

/**
 * Переключатель push-уведомлений в меню профиля.
 *
 * На iPhone web-push работает только после добавления Albus на домашний экран,
 * поэтому там показывается отдельная подсказка вместо молчаливого отказа.
 */
export function PushButton() {
  const [state, setState] = useState<PushState>("prompt");
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!isPushSupported()) {
      setState("unsupported");
      setChecked(true);
      return;
    }
    const permission = pushPermission();
    if (permission === "denied") {
      setState("denied");
      setChecked(true);
      return;
    }
    // "default" — браузер ещё не спрашивал разрешение
    if (permission === "default") {
      setState("prompt");
      setChecked(true);
      return;
    }
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription =
        registration?.pushManager
          ? await registration.pushManager.getSubscription()
          : null;
      setState(subscription ? "subscribed" : "prompt");
    } catch {
      setState("error");
    } finally {
      setChecked(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (state === "subscribed") {
        await disablePush();
        setState("prompt");
      } else {
        setState(await enablePush());
      }
    } finally {
      setBusy(false);
    }
  };

  if (!checked) {
    return (
      <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-muted)]">
        <Loader2 size={15} className="animate-spin" />
        Проверяем уведомления…
      </div>
    );
  }

  const disabled = state === "unsupported" || state === "denied";
  const asPwa = isRunningAsPwa();
  const showIosHint = isIos() && (!asPwa || state === "unsupported");
  const caps = pushCapabilities();

  return (
    <div>
      <button
        onClick={() => void onClick()}
        disabled={disabled || busy}
        className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? (
          <Loader2 size={15} className="animate-spin" />
        ) : state === "subscribed" ? (
          <BellOff size={15} />
        ) : (
          <BellRing size={15} />
        )}
        {LABELS[state]}
      </button>

      {showIosHint && (
        <p className="mx-2 mb-1 mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
          {!asPwa
            ? "На iPhone уведомления приходят, только если Albus добавлен на домашний экран: откройте сайт в Safari и выберите «На экран „Домой“»."
            : `iOS не дала доступ к уведомлениям. Удалите иконку Albus и добавьте заново через Safari: «Поделиться» → «На экран „Домой“», затем откройте Albus с иконки. Диагностика: Notification — ${caps.notification ? "да" : "нет"}, ServiceWorker — ${caps.serviceWorker ? "да" : "нет"}, PushManager — ${caps.pushManager ? "да" : "нет"}.`}
        </p>
      )}
    </div>
  );
}