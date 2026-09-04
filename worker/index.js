self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Ally", {
      body: data.body ?? "",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      data: { url: data.url ?? "/chat" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/chat";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // FE-2 (4 Sept): the old code only focused an existing window when
        // its URL already happened to contain the target path, and never
        // navigated it otherwise — so a PWA already open at /chat (the
        // common case, since it stays running in the background) just got
        // refocused on whatever it was already showing, not the thread the
        // push was about. clients.openWindow() is not a reliable fallback
        // here either: a standalone PWA instance already running can make
        // the browser silently refocus that instance instead of actually
        // opening the requested URL. Navigate the first available window
        // client explicitly instead, and only fall back to openWindow when
        // there is truly no window to reuse.
        for (const client of clientList) {
          if ("focus" in client) {
            if ("navigate" in client) {
              return client.navigate(url).then((c) => (c ?? client).focus());
            }
            return client.focus();
          }
        }
        return clients.openWindow(url);
      })
  );
});
