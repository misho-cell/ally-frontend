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
export default function PushHeartbeat() {
  useEffect(() => {
    void ensurePushSubscription(false);
  }, []);
  return null;
}
