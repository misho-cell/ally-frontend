"use client";

import { useEffect } from "react";
import { ensurePushSubscription } from "@/lib/push";

// Row 101 (24 Sept, evening). The server cannot tell a dead push registration
// from a live one: Apple and Google accept a push to an address whose browser
// no longer exists and answer "delivered", and fourteen days of delivery logs
// show failed = 0 on every endpoint including ones that had visibly stopped
// existing. A row only dies on a 404 or 410 and those never come.
//
// So the only thing that can prove a browser is still there is the browser
// turning up. Re-posting the subscription it already holds is what does that:
// the row does not change, only its last_seen_at moves, and then "this
// endpoint has not appeared for a month while the same person's other one
// appeared yesterday" becomes a fact the backend can delete on.
//
// That already happened on the chat screens. It is here instead so that it
// means what it says: the app opening, not the app opening on one particular
// page. Somebody who lands on /updates from a notification, or on /profile,
// was invisible — and those are exactly the people whose phones this is
// about. Mounting it at the root costs one request per load and nothing else.
//
// It never prompts. `false` means it registers what exists and asks nobody
// anything; the asking belongs to PushPrompt, where a person can see why.
// 27 Sept. It fired on mount and nowhere else, which means on a full page
// load — and an installed app on a phone is almost never loaded. People leave
// it open and come back to it, which raises `visibilitychange` and not a load.
//
// The backend's measurement is what showed this: one account made thirteen
// chat calls across a whole day and never once reported a state. A tab opened
// before this shipped keeps running the old bundle forever, and even after
// this ships, a session that stays open reports once and then goes quiet for
// as long as the person keeps using it. The population we most need to hear
// from — people who live in the app on a phone — is exactly the population
// that reloads least.
//
// The same hole applied to the subscription claim behind row 101: a
// long-lived session never re-claimed its endpoint either, so "this endpoint
// has not been seen for a month" could have meant "this person never closed
// the app".
//
// So it also runs when the app comes back to the foreground, throttled: the
// question is "is this person still here and what can their browser do",
// which cannot change several times a minute.
const MIN_GAP_MS = 5 * 60 * 1000;

export default function PushHeartbeat() {
  useEffect(() => {
    let last = 0;
    const beat = () => {
      const now = Date.now();
      if (now - last < MIN_GAP_MS) return;
      last = now;
      void ensurePushSubscription(false);
    };
    beat();
    const onVisible = () => { if (!document.hidden) beat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);
  return null;
}
