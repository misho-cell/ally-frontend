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
      // Only our own paths. A message is a message whoever sent it, and an
      // absolute address here would be an open redirect driven by whatever
      // can reach this page.
      if (!url.startsWith("/") || url.startsWith("//")) return;
      router.push(url);
    };

    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);

  return null;
}
