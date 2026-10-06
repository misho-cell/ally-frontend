"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// #826 (4 Oct). Tapping a push opened the app and left it on whatever it had
// been showing. The push carries the right `url` and the worker asks the
// window to go there, but `client.navigate` in a standalone PWA can reject,
// or resolve having done nothing at all — while the system focuses the
// window regardless. The app comes up, the conversation does not, and
// nothing anywhere reports a failure.
//
// The running page can route itself, so the worker also sends it the
// address. This listens for that.
//
// It uses the app's own router rather than assigning location, because this
// page IS the app: a full load would throw away the thread list, the open
// stream and everything in memory, to arrive at a screen the client could
// have drawn immediately.
export default function PushRouter() {
  const router = useRouter();

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; url?: unknown } | null;
      if (!data || data.type !== "netai:open") return;
      const url = typeof data.url === "string" ? data.url : "";
      if (!ownPath(url)) return;
      // The note left for a cold start is spent: this page got the message.
      void takePendingOpen();
      router.push(url);
    };

    // #1816 (6 Oct). When the tap had to start the app, no page was there to
    // receive the message, and the app could come up on its start page. The
    // worker leaves the address in the cache for exactly this; take it once.
    const checkPending = () => {
      void takePendingOpen().then((url) => {
        if (url && url !== window.location.pathname) router.push(url);
      });
    };
    checkPending();
    const onVisible = () => {
      if (document.visibilityState === "visible") checkPending();
    };
    document.addEventListener("visibilitychange", onVisible);

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", onMessage);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}

// Only our own paths. A message is a message whoever sent it, and an absolute
// address here would be an open redirect driven by whatever can reach this
// page.
function ownPath(url: string): boolean {
  return url.startsWith("/") && !url.startsWith("//");
}

// A note older than this is not from the tap that opened the app; it is
// left over from one that was already handled some other way, and following
// it would throw somebody somewhere they did not ask to go.
const PENDING_MAX_AGE_MS = 60_000;

// Reads the note and removes it in the same step, so it is followed once.
async function takePendingOpen(): Promise<string | null> {
  try {
    if (!("caches" in window)) return null;
    const cache = await caches.open("netai-push-log");
    const res = await cache.match("/__push-open");
    if (!res) return null;
    await cache.delete("/__push-open");
    const data = (await res.json()) as { url?: unknown; at?: unknown };
    const url = typeof data.url === "string" ? data.url : "";
    const at = typeof data.at === "number" ? data.at : 0;
    if (!ownPath(url) || Date.now() - at > PENDING_MAX_AGE_MS) return null;
    return url;
  } catch {
    return null;
  }
}
