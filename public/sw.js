// Dugsi service worker: only exists so reminder notifications can be shown on
// every platform (Android requires notifications to come from a worker) and
// so the app can be installed to the home screen. It caches nothing — the
// version checker handles updates.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const scope = self.registration.scope;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(scope));
      if (open) return open.focus();
      return self.clients.openWindow(scope);
    }),
  );
});
