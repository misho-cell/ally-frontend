"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { isRecord, pickArray, recordItems, unwrapData } from "@/lib/payload";

// Row 40 (21 Sept). The campaigns were readable only as a raw table in Lab —
// columns of keys, one row per campaign, and nothing saying who is being
// asked about, why this one is sitting where it is, or who is doing the
// asking. All of that was already in the payload.
//
// All four things asked for are here now. The fourth, the circle an inviter
// and a target share, arrived on 22 Sept — on the inviter, not the campaign,
// because the count belongs to the pair.

type Inviter = {
  name?: string | null;
  state?: string | null;
  asked_at?: string | null;
  scheduled_ask_at?: string | null;
  // 22 Sept: how many people this inviter and the target have in common. It
  // sits on the PAIR, not the campaign, so one target with two inviters has
  // two different numbers.
  //
  // The key is ABSENT when the count could not be taken — never zero. "you
  // have nobody in common" and "I could not count" are different answers and
  // a screen that draws them the same invents a fact. So this is read with
  // `in`, not with a falsy check.
  shared_circle?: number;
};

type Campaign = {
  id?: number | string | null;
  target_label?: string | null;
  city?: string | null;
  target_phone?: string | null;
  // A ready Georgian sentence, not a code — printed as it arrives.
  state_reason?: string | null;
  status?: string | null;
  closed_reason?: string | null;
  closed_at?: string | null;
  inviters?: Inviter[];
  // These came as STRINGS until 22 Sept (Postgres COUNT is a bigint), which
  // made "12" > "9" false and any sort read backwards. They are numbers now;
  // count() stays because it costs nothing and an old deployment still works.
  participant_count?: number | string | null;
  asked_count?: number | string | null;
  next_ask_due_at?: string | null;
};

function count(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminCampaignsPage() {
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [dial, setDial] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // `stillWanted` lets the caller say the answer is no longer needed — the
  // screen was left, or a newer load has started. Without it the guard in the
  // effect would only look like protection while this function wrote state
  // into an unmounted screen anyway.
  const load = useCallback(async (stillWanted: () => boolean = () => true) => {
    // The previous error is cleared on success rather than on the way in.
    // Clearing first would blank the explanation the moment a retry starts and
    // leave nothing behind if the retry fails the same way — and a setState
    // before the first await runs synchronously inside the effect.
    try {
      const res = await apiFetch<unknown>("/admin/chorus/campaigns", { admin: true });
      const body = unwrapData(res);
      if (!stillWanted()) return;
      setCampaigns(recordItems(pickArray(body, ["campaigns"])) as Campaign[]);
      const d = isRecord(body) ? body.current_dial : null;
      setDial(d == null ? null : String(d));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      if (!stillWanted()) return;
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setCampaigns([]);
    }
  }, [router]);

  useEffect(() => {
    // The guard is not ceremony: this component can be left before the
    // request returns, and writing state into an unmounted screen is how a
    // stale error ends up on the next one somebody opens.
    let alive = true;
    // The rule cannot see across the function boundary and assumes load()
    // sets state synchronously. It does not: nothing is written before the
    // first await, and every write after it is behind the liveness check
    // above. Narrowed to this line rather than the file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => alive);
    return () => { alive = false; };
  }, [load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">კამპანიები</h1>
          {dial && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">სიხშირე: {dial}</span>}
        </div>
        <button type="button" onClick={() => load()} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">
          განახლება
        </button>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {campaigns === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : campaigns.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">კამპანია არ არის</p>
        ) : (
          <div className="flex flex-col gap-3">
            {campaigns.map((c, i) => {
              const inviters = c.inviters ?? [];
              const asked = count(c.asked_count);
              const participants = count(c.participant_count);
              return (
                <div key={c.id ?? i} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  {/* WHO */}
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="text-sm font-bold text-[#23261F]">{c.target_label || "სახელი უცნობია"}</h2>
                    {c.city && <span className="text-xs text-gray-500">{c.city}</span>}
                    {c.target_phone && (
                      <span className="font-mono text-xs text-gray-400">…{c.target_phone.slice(-4)}</span>
                    )}
                    {asked != null && participants != null && (
                      <span className="ml-auto text-xs text-gray-500">{asked} / {participants} ნაკითხი</span>
                    )}
                  </div>

                  {/* WHY — the server's own sentence, printed as it arrives. */}
                  <p className="mt-2 text-sm text-gray-600">
                    {c.state_reason || c.closed_reason || c.status || "მიზეზი არ მოსულა"}
                  </p>

                  {c.next_ask_due_at && (
                    <p className="mt-1 text-xs text-gray-400">შემდეგი კითხვა: {fmt(c.next_ask_due_at)}</p>
                  )}

                  {/* WHO ASKS */}
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    {inviters.length === 0 ? (
                      // An empty list is a fact about this campaign, not a
                      // blank: it is exactly why nothing is being sent.
                      <p className="text-xs text-gray-400">მომწვევი არ არის</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {inviters.map((inv, j) => (
                          <div key={j} className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-semibold text-[#23261F]">{inv.name || "უსახელო ანგარიში"}</span>
                            {inv.state && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">{inv.state}</span>}
                            {/* Absent key and zero say different things, so
                                they are drawn differently. */}
                            {"shared_circle" in inv ? (
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
                                {inv.shared_circle === 0 ? "საერთო არავინ" : `${inv.shared_circle} საერთო`}
                              </span>
                            ) : (
                              <span className="text-gray-400" title="ამ წყვილზე დათვლა ვერ მოხერხდა">
                                საერთო ვერ დაითვალა
                              </span>
                            )}
                            <span className="ml-auto text-gray-400">
                              {inv.asked_at
                                ? `იკითხა ${fmt(inv.asked_at)}`
                                : inv.scheduled_ask_at
                                  ? `დაგეგმილია ${fmt(inv.scheduled_ask_at)}`
                                  : "ჯერ არ დაგეგმილა"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
