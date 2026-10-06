"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";

// #387 (3 Oct, Ninia). She pressed „later" on an update, opened the app the
// next day and did not find it. The item was there: the server had held it
// and released it on time. Nothing on screen said so, and the updates link
// is a line of small text at the bottom of the sidebar, so the only way to
// learn that something was waiting was to remember the screen existed.
//
// This could not be built until this morning. `GET /updates` RELEASES and
// marks seen what it counts, so asking it how many are waiting is what makes
// them stop waiting — the one call that knew the number destroyed it. The
// backend added `GET /updates/count` → `{ due, held }`, which reads only.
//
// It shows `due` and not `due + held`: a card being deliberately held back
// until next Tuesday is not something waiting to be read today, and counting
// it would send the person to a screen that has nothing new on it. Held is
// already named on the screen itself.
const MIN_GAP_MS = 60_000;

export default function UpdatesBadge() {
  const [due, setDue] = useState<number | null>(null);
  const last = useRef(0);

  useEffect(() => {
    let alive = true;

    // The route shares /updates' thirty-a-minute limit, so it is read on
    // arrival and when the tab comes back, never on a timer, and never twice
    // inside a minute.
    const read = async () => {
      const now = Date.now();
      if (now - last.current < MIN_GAP_MS) return;
      last.current = now;
      try {
        const res = await apiFetch<unknown>("/updates/count");
        const body = unwrapData(res);
        if (!alive || !isRecord(body)) return;
        // A count we could not read is not zero. It stays null and no badge
        // is drawn, which says nothing rather than saying "nothing waiting".
        // #2080: pinned cards count too, because they are waiting on the
        // person as much as a due one is. An absent `followed` is an older
        // server and adds nothing.
        if (typeof body.due === "number") {
          setDue(body.due + (typeof body.followed === "number" ? body.followed : 0));
        }
      } catch {
        // Silent on purpose: this is a decoration on a link. A person who
        // taps through sees the real list either way.
      }
    };

    void read();
    const onVisible = () => { if (document.visibilityState === "visible") void read(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  if (due == null || due <= 0) return null;
  return (
    <span
      // Not hidden from a screen reader: somebody who cannot see the badge
      // needs the number more than anyone, and "Updates 3" reads correctly.
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        marginLeft: 6,
        borderRadius: 9,
        background: "var(--accent)",
        color: "#FBFAF4",
        font: "600 11px/18px var(--font-system)",
      }}
    >
      {due > 99 ? "99+" : due}
    </span>
  );
}
