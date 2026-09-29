// Minimal service worker: just enough to receive Web Push notifications and open the
// app when one is tapped. No offline caching — the app needs a live connection anyway.
self.addEventListener("push", (event) => {
  console.log("[sw] push event received, has data:", !!event.data);
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  console.log("[sw] parsed push payload:", title, body, url);
  event.waitUntil(
    self.registration
      .showNotification(title, { body, icon: "/icons/icon-192.png", data: { url } })
      .then(() => console.log("[sw] showNotification resolved"))
      .catch((err) => console.log("[sw] showNotification rejected:", err)),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((c) => new URL(c.url).pathname === url);
      if (existing) return existing.focus();
      return self.clients.openWindow(url);
    }),
  );
});
