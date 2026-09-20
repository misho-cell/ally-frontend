// Push. Two rules here, both learned the hard way.
//
// 1. EVERY push must end in a visible notification. iOS treats a push that
//    shows nothing as a broken subscriber and will eventually stop delivering
//    to that device altogether. So there is no path through this handler that
//    returns without calling showNotification — not a parse failure, not an
//    empty payload, not an unexpected shape.
//
// 2. A failure here must be visible ON THE PHONE. Row 111 (20 Sept): a
//    question from someone's network never appeared on Lika's iPhone while
//    "your answer is ready" arrived on the same phone in the same session.
//    The backend measured the sends — all five reached Apple, no skips, no
//    error codes — and the two payloads differ only in their strings. Until
//    now a payload this code could not read produced silence, which looks
//    exactly like a push that never arrived, and that is the reason three
//    days of evidence could not tell those two cases apart.
//
// Note that `sent` in the backend's table means the push service accepted it,
// not that a phone rang. This end of the wire is the only place that can tell
// the difference, so it should not stay quiet about it.
self.addEventListener("push", (event) => {
  let data = {};
  let parseError = null;

  if (event.data) {
    try {
      data = event.data.json();
    } catch (err) {
      // Not JSON, or not the JSON we expect. Keep the raw text: it is the
      // only description of what actually arrived.
      parseError = err;
      try {
        data = { body: event.data.text() };
      } catch {
        data = {};
      }
    }
  }

  const title =
    typeof data.title === "string" && data.title.length > 0
      ? data.title
      : "Netai";

  // A body that is empty, missing, or of the wrong type says so rather than
  // rendering as a blank notification that looks like a glitch.
  const rawBody = typeof data.body === "string" ? data.body : "";
  const body = rawBody.length > 0
    ? rawBody
    : parseError
      ? "შეტყობინება მოვიდა, მაგრამ ვერ წავიკითხეთ. გახსენი აპი."
      : "გახსენი აპი";

  const url = typeof data.url === "string" && data.url.length > 0 ? data.url : "/chat";

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        data: { url },
      })
      // Even the display call gets a fallback: if the options are refused for
      // any reason, a bare notification is still better than silence, both
      // for the person and for the subscription's standing with iOS.
      .catch(() =>
        self.registration.showNotification("Netai", { body: "გახსენი აპი", data: { url } })
      )
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
