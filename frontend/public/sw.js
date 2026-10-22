/* Albus service worker: доставка push-уведомлений.

   Без него браузер не может получить уведомление, когда вкладка закрыта или
   приложение не на переднем плане. */

self.addEventListener("install", () => {
  // Не ждём закрытия старых вкладок: воркер должен заработать сразу.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (err) {
    payload = { title: "Albus", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Albus";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    // Один tag на комнату: новое сообщение заменяет предыдущее уведомление,
    // а не копит десяток баннеров. Звонок живёт под своим tag.
    tag: payload.tag || "albus-push",
    renotify: true,
    data: { url: payload.url || "/chat" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/chat";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (client.url.includes(target) && "focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      })
  );
});