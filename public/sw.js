// Minimal service worker: just enough to receive Web Push notifications and open the
// app when one is tapped. No offline caching — the app needs a live connection anyway.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const { title, body, url } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, { body, icon: "/icons/icon-192.png", data: { url } }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      // Reuse an open tab: take it to the notification's page and bring it forward.
      const existing = clients[0];
      if (existing) {
        try {
          const navigated = await existing.navigate(url);
          return (navigated ?? existing).focus();
        } catch {
          return existing.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
