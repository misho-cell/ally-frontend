"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";

// Row 6 (12 Sept): GET /admin/users/:id/push — which devices hold a
// subscription and what happened to recent deliveries. Until now "sent or
// failed" lived only in the Railway log, so every such question needed log
// access.
//
// Two things this block must not misreport:
//  - user_agent is null on every row created before 12 Sept; unknown is not
//    the same as "no device".
//  - 0 deliveries does NOT mean nothing was sent. Recording started on
//    12 Sept; the server says so in `note`, which is printed as-is.
//  - (14 Sept) skipped is NOT failed. Per-device presence added a third
//    status: a push deliberately withheld because that device is watching
//    right now. Colouring it like a failure would turn the healthy case into
//    an alarm on the one screen meant to tell them apart.

type Subscription = {
  provider?: string | null;
  user_agent?: string | null;
  // Sent from 13 Sept; the stable per-browser key, shown when present.
  device_id?: string | null;
  // Last 12 characters, the same slice the tester's card shows.
  device_id_tail?: string | null;
  // True = this device is watching right now, so a push to it is withheld on
  // purpose. Without it a deliberate skip is indistinguishable from silence.
  live?: boolean | null;
  endpoint_tail?: string | null;
  created_at?: string | null;
};

type Delivery = {
  status?: string | null;
  status_code?: number | null;
  error?: string | null;
  endpoint_tail?: string | null;
  created_at?: string | null;
};

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // A value we cannot parse falls back to the raw string, never to the dash
  // that means "no date". Safari refused Postgres timestamps until 15 Sept,
  // so every real time on an iPhone would have printed as absent — the same
  // class of lie these screens exist to stop. The dash is reserved for null.
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// recording_since arrives as Postgres text ("2026-09-12 21:57:08.551099+00"),
// which Safari will not parse as a Date — a space instead of T and six-digit
// microseconds. Only the day matters on the chip, so take it literally off the
// front of the string rather than round-tripping through Date.
function fmtDay(raw: string): string {
  const day = raw.slice(0, 10);
  const d = new Date(`${day}T00:00:00Z`);
  return isNaN(d.getTime())
    ? day
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
}

// The same reading the tester's own diagnostics card does, from the UA string.
function deviceName(ua?: string | null): string | null {
  if (!ua) return null;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "?";
}

export default function AdminPushBlock({ userId }: { userId: string }) {
  const [subs, setSubs] = useState<Subscription[] | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [counts, setCounts] = useState<{ sent: number | null; skipped: number | null; failed: number | null }>({ sent: null, skipped: null, failed: null });
  const [note, setNote] = useState<string | null>(null);
  // Start of the window the counts cover; absent on older backends.
  const [since, setSince] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/admin/users/${encodeURIComponent(userId)}/push`, { admin: true })
      .then((res) => {
        if (!alive) return;
        const d = unwrapData(res);
        const body = isRecord(d) ? d : {};
        setSubs(recordItems(pickArray(body, ["subscriptions"])) as Subscription[]);
        setDeliveries(recordItems(pickArray(body, ["recent_deliveries"])) as Delivery[]);
        setCounts({
          sent: typeof body.sent_recently === "number" ? body.sent_recently : null,
          skipped: typeof body.skipped_recently === "number" ? body.skipped_recently : null,
          failed: typeof body.failed_recently === "number" ? body.failed_recently : null,
        });
        setNote(typeof body.note === "string" ? body.note : null);
        setSince(
          typeof body.recording_since === "string" ? body.recording_since
          : typeof body.since === "string" ? body.since
          : null,
        );
      })
      .catch((err) => {
        if (!alive) return;
        // Older backend without the route — show nothing rather than an error.
        if (err instanceof ApiError && err.status === 404) { setMissing(true); return; }
        setSubs([]);
      });
    return () => { alive = false; };
  }, [userId]);

  if (missing || !subs) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">შეტყობინებები (push)</h2>

      {subs.length === 0 ? (
        <p className="text-sm text-gray-400">გამოწერა არ არის</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {subs.map((s, i) => {
            const dev = deviceName(s.user_agent);
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">{s.provider ?? "?"}</span>
                {dev ? (
                  <span className="text-[#23261F]">{dev}</span>
                ) : (
                  <span className="text-gray-400" title="ეს ველი 12 სექტემბერს დაემატა, ძველ მწკრივებზე ცარიელია">მოწყობილობა უცნობია</span>
                )}
                {(s.device_id_tail || s.device_id) && (
                  <span className="font-mono text-xs text-gray-400" title={s.device_id ?? undefined}>
                    id …{s.device_id_tail ?? s.device_id!.slice(-12)}
                  </span>
                )}
                {s.live && (
                  <span
                    className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700"
                    title="ახლა უყურებს — push განზრახ არ ეგზავნება"
                  >
                    უყურებს ახლა
                  </span>
                )}
                <span className="font-mono text-xs text-gray-400">{s.endpoint_tail ?? "—"}</span>
                <span className="ml-auto text-xs text-gray-400">{fmt(s.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        {/* 15 Sept: the counts cover only the window in which deliveries were
            RECORDED, which starts long after the oldest subscription was
            created (30 July vs 12 Sept — six weeks with no rows at all). A
            bare "9" next to a July date reads as nine in six weeks. So the
            window is drawn ON the counts, not left to fine print underneath. */}
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">ჩაწერილი მიწოდებები</h3>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
            {since ? `${fmtDay(since)}-დან` : "ჩაწერა ჯერ არ დაწყებულა"}
          </span>
        </div>
        {/* recording_since === null means no delivery was ever recorded, so
            the three counts are UNKNOWN, not zero — the same distinction as
            last_walk: null. Printing 0 here would invent a measurement. */}
        <div className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <span className="text-gray-600">გაიგზავნა: <b className="text-green-700">{since ? counts.sent ?? "—" : "უცნობია"}</b></span>
          <span className="text-gray-600">გამოტოვდა: <b className="text-blue-700">{since ? counts.skipped ?? "—" : "უცნობია"}</b></span>
          <span className="text-gray-600">ჩავარდა: <b className="text-red-600">{since ? counts.failed ?? "—" : "უცნობია"}</b></span>
        </div>
        {/* The server's own sentence about the window. It is the line that
            stops the misreading, so it is readable, not grey fine print. */}
        {note && <p className="mt-1.5 text-xs text-amber-800">{note}</p>}
        <p className="mt-1 text-xs text-gray-400">გამოტოვება ნიშნავს, რომ მოწყობილობა უყურებდა და push განზრახ არ გაიგზავნა. ეს ხარვეზი არ არის.</p>

        {deliveries.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {deliveries.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${
                  d.status === "sent" ? "bg-green-50 text-green-700"
                  : d.status === "skipped" ? "bg-blue-50 text-blue-700"
                  : "bg-red-50 text-red-600"
                }`}>
                  {d.status ?? "?"}{d.status_code != null ? ` ${d.status_code}` : ""}
                </span>
                <span className="font-mono text-gray-400">{d.endpoint_tail ?? "—"}</span>
                {d.error && <span className="text-red-500">{d.error}</span>}
                <span className="ml-auto text-gray-400">{fmt(d.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
