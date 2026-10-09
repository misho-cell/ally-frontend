"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, pushState } from "@/lib/push";

// D698 (9 Oct, the new design): no notification switches anywhere. One block
// in the profile says whether this phone will be told, and offers the one
// action that changes it. The header button stays for people who never open
// the profile; this is the place that also says "it is on", which the header
// button cannot, because it disappears once push works.
//
// Quiet hours and the evening-card hour are in the design as editable fields.
// They are fixed on the server today (23:00 to 09:30, 19:00) with no per-person
// setting, so they are not drawn here: a field that cannot be saved is a lie,
// and the numbers are the server's to state, not ours.

const L = {
  en: {
    title: "Notifications",
    sub: "So you hear when someone answers, or when I need your answer.",
    on: "On for this device",
    enable: "Turn on notifications",
    blocked: "Blocked in the browser. Allow them in the browser's settings.",
    needsPwa: "Add the app to your home screen first, then turn them on here.",
    unsupported: "This browser cannot show notifications.",
    failed: "Could not turn them on",
  },
  ka: {
    title: "შეტყობინებები",
    sub: "ასე გაიგებ, როცა ვინმე გიპასუხებს ან შენი პასუხი დამჭირდება.",
    on: "ამ მოწყობილობაზე ჩართულია",
    enable: "შეტყობინებების ჩართვა",
    blocked: "ბრაუზერში დაბლოკილია. ჩართე ბრაუზერის პარამეტრებში.",
    needsPwa: "ჯერ დაამატე აპი მთავარ ეკრანზე, მერე აქ ჩართე.",
    unsupported: "ეს ბრაუზერი შეტყობინებებს ვერ აჩვენებს.",
    failed: "ჩართვა ვერ მოხერხდა",
  },
};

type Status = "checking" | "idle" | "loading" | "granted" | "denied" | "needs-pwa" | "unsupported" | "failed";

export default function NotificationsCard() {
  const s = L[getLocale()];
  const [status, setStatus] = useState<Status>("checking");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const state = pushState();
      if (state === "granted") {
        const r = await ensurePushSubscription(false);
        if (!alive) return;
        if (r.state === "subscribed") setStatus("granted");
        else if (r.state === "failed") { setStatus("failed"); setReason(r.reason); }
        else setStatus("idle");
        return;
      }
      if (alive) setStatus(state === "unasked" ? "idle" : state);
    })();
    return () => { alive = false; };
  }, []);

  async function enable() {
    setStatus("loading");
    setReason(null);
    const r = await ensurePushSubscription(true);
    if (r.state === "subscribed") { setStatus("granted"); return; }
    if (r.state === "failed") { setStatus("failed"); setReason(r.reason); return; }
    setStatus(r.state === "unasked" ? "idle" : r.state);
  }

  const note =
    status === "granted" ? s.on :
    status === "denied" ? s.blocked :
    status === "needs-pwa" ? s.needsPwa :
    status === "unsupported" ? s.unsupported :
    status === "failed" ? `${s.failed}${reason ? ` (${reason})` : ""}` :
    null;

  return (
    <div className="card flex flex-col gap-3">
      <div>
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
        <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{s.sub}</p>
      </div>
      {note && (
        <p
          className="flex items-center gap-2"
          style={{ fontSize: "13px", fontWeight: 500, color: status === "failed" ? "var(--danger)" : status === "granted" ? "var(--accent-strong)" : "var(--ink-soft)" }}
        >
          {status === "granted" && <span className="rounded-full" style={{ width: 8, height: 8, background: "var(--accent)" }} />}
          {note}
        </p>
      )}
      {(status === "idle" || status === "loading" || status === "failed") && (
        <button type="button" className="btn-primary self-start" onClick={enable} disabled={status === "loading"}>
          {s.enable}
        </button>
      )}
    </div>
  );
}
