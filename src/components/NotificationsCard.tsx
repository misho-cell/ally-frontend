"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, pushState } from "@/lib/push";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";

// D698 (9 Oct, the new design): no notification switches anywhere. One block
// in the profile says whether this phone will be told, and offers the one
// action that changes it. The header button stays for people who never open
// the profile; this is the place that also says "it is on", which the header
// button cannot, because it disappears once push works.
//
// Quiet hours are in the design as an editable field. They are fixed on the
// server (23:00 to 09:30) with no per-person setting, so they are not drawn
// here: a field that cannot be saved is a lie.
//
// The evening-card hour IS a per-person setting since the backend's 10 Oct
// 07:20Z (GET/PUT /evening-card/hour, a whole hour 8 to 22 in the person's
// own zone). The picker shows only once the server has said the current
// hour; a server without the route draws no picker rather than a 19:00 of
// ours that would not be saved.

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
    eveningHour: "Evening summary time",
    hourSaved: "Saved. It applies from the next card.",
    hourFailed: "Could not save it.",
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
    eveningHour: "საღამოს ბარათის საათი",
    hourSaved: "შენახულია. შემდეგი ბარათიდან შეიცვლება.",
    hourFailed: "ვერ შეინახა.",
  },
};

// The server's bounds (8 to 22), so the picker cannot offer an hour it refuses.
const HOURS = Array.from({ length: 15 }, (_, i) => 8 + i);

type Status = "checking" | "idle" | "loading" | "granted" | "denied" | "needs-pwa" | "unsupported" | "failed";

export default function NotificationsCard() {
  const s = L[getLocale()];
  const [status, setStatus] = useState<Status>("checking");
  const [reason, setReason] = useState<string | null>(null);
  // null = not known (loading, or a server without the route): no picker.
  const [hour, setHour] = useState<number | null>(null);
  const [hourBusy, setHourBusy] = useState(false);
  const [hourNote, setHourNote] = useState<{ ok: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/evening-card/hour")
      .then((raw) => {
        const d = unwrapData(raw);
        if (alive && isRecord(d) && typeof d.hour === "number" && Number.isInteger(d.hour)) setHour(d.hour);
      })
      .catch(() => { /* no picker */ });
    return () => { alive = false; };
  }, []);

  async function saveHour(next: number) {
    if (hourBusy || next === hour) return;
    const before = hour;
    setHour(next);
    setHourBusy(true);
    setHourNote(null);
    try {
      const d = unwrapData(await apiFetch<unknown>("/evening-card/hour", { method: "PUT", body: { hour: next } }));
      // The stored value is the server's answer, not the one we asked for.
      if (isRecord(d) && typeof d.hour === "number") setHour(d.hour);
      setHourNote({ ok: true });
    } catch {
      setHour(before);
      setHourNote({ ok: false });
    } finally {
      setHourBusy(false);
    }
  }

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
      {hour != null && (
        <div className="flex flex-col gap-1.5 pt-1" style={{ borderTop: "1px solid var(--skeleton)" }}>
          <label className="flex items-center justify-between gap-3 pt-2">
            <span style={{ fontSize: "13.5px", fontWeight: 500, color: "var(--ink)" }}>{s.eveningHour}</span>
            {/* 16px: a smaller focused field makes iOS Safari zoom the page. */}
            <select
              value={hour}
              disabled={hourBusy}
              onChange={(e) => void saveHour(Number(e.target.value))}
              style={{ fontSize: 16, padding: "6px 10px", borderRadius: 10, border: "1px solid var(--cta-border)", background: "#FFFFFF", color: "var(--ink)" }}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{`${String(h).padStart(2, "0")}:00`}</option>
              ))}
            </select>
          </label>
          {hourNote && (
            <p role="status" style={{ fontSize: "12.5px", color: hourNote.ok ? "var(--ink-soft)" : "var(--danger)" }}>
              {hourNote.ok ? s.hourSaved : s.hourFailed}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
