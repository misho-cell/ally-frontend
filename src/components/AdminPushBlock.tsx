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

type Subscription = {
  provider?: string | null;
  user_agent?: string | null;
  // Sent from 13 Sept; the stable per-browser key, shown when present.
  device_id?: string | null;
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
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
  const [counts, setCounts] = useState<{ sent: number | null; failed: number | null }>({ sent: null, failed: null });
  const [note, setNote] = useState<string | null>(null);
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
          failed: typeof body.failed_recently === "number" ? body.failed_recently : null,
        });
        setNote(typeof body.note === "string" ? body.note : null);
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
                {s.device_id && (
                  <span className="font-mono text-xs text-gray-400" title={s.device_id}>id …{s.device_id.slice(-12)}</span>
                )}
                <span className="font-mono text-xs text-gray-400">{s.endpoint_tail ?? "—"}</span>
                <span className="ml-auto text-xs text-gray-400">{fmt(s.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 border-t border-gray-100 pt-3">
        <p className="text-sm text-gray-600">
          გაიგზავნა: <b className="text-[#23261F]">{counts.sent ?? "—"}</b>
          <span className="ml-4">ჩავარდა: <b className="text-[#23261F]">{counts.failed ?? "—"}</b></span>
        </p>
        {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}

        {deliveries.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {deliveries.map((d, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-semibold ${d.status === "sent" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
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
