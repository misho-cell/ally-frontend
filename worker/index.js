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
// #859 (4 Oct). Twenty pushes reached Google with 201, the endpoint
// re-registered at 15:02 so it was live, and the founder's locked phone
// showed nothing. Two stories fit that and they need different fixes: this
// handler ran and the phone did not draw, or this handler never ran.
//
// Nothing on either side can currently tell them apart, which is why the
// question has been open all day. So the worker writes down that it ran.
// The Cache API is used because it is the one store both a service worker
// and a page can reach without a connection, a login or a server route: the
// phone can be locked, offline and logged out and the note still survives
// for somebody to read later on the diagnostics screen.
//
// It records the fact and the time, never the message. A notification's text
// is somebody's private business and this is a debugging note.
const LOG_CACHE = "netai-push-log";
const LOG_URL = "/__push-log";
const LOG_KEEP = 20;

async function noteEvent(entry) {
  try {
    const cache = await caches.open(LOG_CACHE);
    let rows = [];
    const prev = await cache.match(LOG_URL);
    if (prev) {
      try {
        const parsed = await prev.json();
        if (Array.isArray(parsed)) rows = parsed;
      } catch {
        // A note we cannot read is not worth keeping. Starting again loses
        // old entries and keeps the new one, which is the useful direction.
      }
    }
    rows.push({ at: new Date().toISOString(), ...entry });
    await cache.put(
      LOG_URL,
      new Response(JSON.stringify(rows.slice(-LOG_KEEP)), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch {
    // Writing the note must never be the reason the notification fails.
  }
}

// #7724 (25 Oct): the server's 201 says only that Apple or Google took the
// push. Each push now carries a `receipt`, and the worker reports it back
// once the notification is drawn and again when it is tapped, with no login.
// The address is the build's own API (inlined at build time, as in the app).
// A receipt that is not 32 hex characters is not sent, and a failed report is
// swallowed: it must never stand between the person and the notification.
const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

function receiptOf(value) {
  return typeof value === "string" && /^[0-9a-f]{32}$/i.test(value) ? value : null;
}

function sendReceipt(receipt, kind) {
  if (!receipt) return Promise.resolve();
  return fetch(`${API_BASE}/notifications/receipt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receipt, event: kind }),
  }).catch(() => {});
}

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

  // #4658 retest (Lika, 17 Oct): an introduction-request push opened home.
  // When the payload names its conversation but no usable address, that
  // conversation is where the tap goes.
  const tid = data.thread_id ?? data.threadId;
  const url =
    typeof data.url === "string" && data.url.length > 0 && data.url !== "/chat"
      ? data.url
      : tid != null && String(tid).trim()
      ? `/chat/${encodeURIComponent(String(tid))}`
      : typeof data.url === "string" && data.url.length > 0
      ? data.url
      : "/chat";

  // Written before the notification is drawn, so that a failure to DRAW
  // still leaves evidence that the handler ran. Written after is evidence of
  // the wrong thing.
  event.waitUntil(
    noteEvent({ kind: "push", hasData: Boolean(event.data), parseError: Boolean(parseError) })
  );

  const receipt = receiptOf(data.receipt);
  event.waitUntil(rememberLastPush(url, receipt));

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        data: { url, receipt },
      })
      // Even the display call gets a fallback: if the options are refused for
      // any reason, a bare notification is still better than silence, both
      // for the person and for the subscription's standing with iOS.
      .catch(() =>
        self.registration.showNotification("Netai", { body: "გახსენი აპი", data: { url, receipt } })
      )
      // "received" means drawn, so it is reported only after the draw.
      .then(() => sendReceipt(receipt, "received"))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clickData(event.notification.data).then(({ url, receipt, recovered }) => Promise.all([
    noteEvent({ kind: "click", url, recovered }),
    sendReceipt(receiptOf(receipt), "clicked"),
    openFor(url),
  ])));
});

// #7724 (27 Oct). A tap opened the home, and no click receipt has ever
// arrived from any account, while "received" receipts do. Both are what a
// notification whose `data` did not survive to the click would look like:
// the address falls back to /chat and the receipt is absent. Whether iOS
// drops it is not something I could see, so the last push's address and
// receipt are also kept in the cache, and a click with nothing on it uses
// those. The diagnostics card records `recovered` so a phone can say which.
const LAST_PUSH_URL = "/__push-last";

async function rememberLastPush(url, receipt) {
  try {
    const cache = await caches.open(LOG_CACHE);
    await cache.put(LAST_PUSH_URL, new Response(JSON.stringify({ url, receipt, at: Date.now() }), {
      headers: { "Content-Type": "application/json" },
    }));
  } catch {
    // The click then works from the notification's own data, as before.
  }
}

async function clickData(data) {
  if (data && typeof data.url === "string" && data.url) {
    return { url: data.url, receipt: data.receipt, recovered: false };
  }
  try {
    const cache = await caches.open(LOG_CACHE);
    const res = await cache.match(LAST_PUSH_URL);
    const kept = res ? await res.json() : null;
    if (kept && typeof kept.url === "string" && kept.url) {
      return { url: kept.url, receipt: kept.receipt, recovered: true };
    }
  } catch {
    // fall through
  }
  return { url: "/chat", receipt: null, recovered: false };
}

function openFor(url) {
  return (
    // #1816 (6 Oct, Ninia): the tap still opened the app and not the
    // conversation. Both paths below need a page that is already running.
    // When the app was closed, openWindow is all there is, and a standalone
    // PWA may start at its own start page instead of the address asked for.
    // So the address is also left where the page can find it as it starts
    // (PushRouter reads it once and removes it). Written first, so a page
    // that comes up quickly cannot look before it is there.
    leavePendingOpen(url).then(() => clients
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
        //
        // #826 (4 Oct): that was still not enough. Giorgi tapped a push and
        // the app came up on whatever it had been showing. `client.navigate`
        // is the part that does not hold: in a standalone PWA it can reject,
        // or resolve having done nothing, and either way the window is
        // focused by the system anyway — so the app opens and the
        // conversation does not. A promise that quietly does nothing is the
        // hardest kind to notice.
        //
        // So the page is told as well. It is already running, it owns the
        // router, and routing is a thing it can simply do. navigate is still
        // tried, because when it works it is the cleaner path and it also
        // covers a page too old to understand the message; the message is
        // what makes the outcome certain rather than hoped for.
        const target = clientList.find((c) => "focus" in c);
        if (!target) return clients.openWindow(url);

        const tell = () => {
          try {
            target.postMessage({ type: "netai:open", url });
          } catch {
            // An older page, or one that is not listening. navigate below is
            // the fallback, which is the behaviour it had before today.
          }
        };

        if ("navigate" in target) {
          return target
            .navigate(url)
            .then((c) => { const w = c ?? target; tell(); return w.focus(); })
            .catch(() => { tell(); return target.focus(); });
        }
        tell();
        return target.focus();
      }))
  );
}

const OPEN_URL = "/__push-open";

async function leavePendingOpen(url) {
  try {
    const cache = await caches.open(LOG_CACHE);
    await cache.put(
      OPEN_URL,
      new Response(JSON.stringify({ url, at: Date.now() }), {
        headers: { "Content-Type": "application/json" },
      })
    );
  } catch {
    // Without the note the live-page paths still work, as they did before.
  }
}
