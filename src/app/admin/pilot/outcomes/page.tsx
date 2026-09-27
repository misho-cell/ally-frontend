"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";

// Row 274 (27 Sept). What the pilot actually produced, from
// GET /admin/pilot/outcomes?days=N.
//
// This row exists because of one reading: the tester saw started_a_goal = 0
// next to 93 open goals and said, correctly, that it was impossible. The
// number was TRUE. It was unreadable, and that is its own defect — the two
// figures answer different questions and nothing on the page said so.
//
// So the server's own scope sentences are rendered NEXT TO the numbers they
// bound, in the same block, at a size somebody reads. Not a tooltip: a
// tooltip is a place to put something you have decided nobody needs, and the
// whole history of this row says they need it.

type Scope = {
  started_a_goal?: string | null;
  goals?: string | null;
  people_with_any_goal?: number | null;
};

type Outcomes = {
  from?: string | null;
  to?: string | null;
  joined?: number | null;
  started_a_goal?: number | null;
  only_ever_helped?: number | null;
  scope?: Scope;
  goals?: Record<string, number | null | undefined>;
  first_answer?: { definition?: string | null; goals_measured?: number | null; median_minutes?: number | null };
  paid?: Record<string, number | string | null | undefined>;
  brought_others?: Record<string, number | null | undefined>;
  chain_cost?: Record<string, number | string | null | undefined>;
  asks?: Record<string, number | string | null | undefined>;
  not_measurable?: unknown;
};

const RANGES = [7, 14, 30] as const;

// A number that did not arrive is not zero, and on this page in particular:
// the entire row began with a zero that meant something else.
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function text(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function Figure({ label, value, note }: { label: string; value: unknown; note?: string | null }) {
  const n = num(value);
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-[#23261F]">
        {n == null ? <span className="text-gray-300" title="ეს რიცხვი არ მოსულა">—</span> : n}
      </div>
      {/* The server's sentence, printed where the number is, in the same
          breath. This is the fix for this row and not an ornament. */}
      {note && <p className="mt-1 text-[11px] leading-snug text-gray-500">{note}</p>}
    </div>
  );
}

function Block({ title, children, caveat }: { title: string; children: React.ReactNode; caveat?: string | null }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <h2 className="mb-2 text-sm font-bold text-[#23261F]">{title}</h2>
      {caveat && (
        <p className="mb-3 rounded-lg px-3 py-2 text-xs leading-snug"
           style={{ background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }}>
          {caveat}
        </p>
      )}
      {children}
    </section>
  );
}

function pairs(src: Record<string, unknown> | undefined, labels: Record<string, string>) {
  return Object.entries(labels).map(([key, label]) => ({ key, label, value: src?.[key] }));
}

export default function AdminPilotOutcomesPage() {
  const router = useRouter();
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<Outcomes | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (n: number, stillWanted: () => boolean = () => true) => {
    try {
      const res = await apiFetch<unknown>(`/admin/pilot/outcomes?days=${n}`, { admin: true });
      const body = unwrapData(res);
      if (!stillWanted()) return;
      setData(isRecord(body) ? (body as Outcomes) : {});
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!stillWanted()) return;
      setError(
        err instanceof ApiError && err.status === 403
          ? "ამ ანგარიშს პილოტის კითხვის უფლება არ აქვს"
          : err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა"
      );
      setData({});
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    // The rule cannot see across the function boundary and assumes load()
    // sets state synchronously. It does not: nothing is written before the
    // first await, and every write after it is behind the liveness check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days, () => alive);
    return () => { alive = false; };
  }, [load, days]);

  const scope = data?.scope ?? {};
  const first = data?.first_answer ?? {};
  // The list of things this page cannot measure. Rendered in full, at the
  // top, because a caveat nobody meets is a caveat that does not exist.
  const cannotMeasure = Array.isArray(data?.not_measurable)
    ? (data.not_measurable as unknown[]).map(text).filter((t): t is string => t != null)
    : [];
  const declinesSince = text(data?.asks?.declines_recorded_since);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">პილოტმა რა მოიტანა</h1>
          {data?.from && data?.to && (
            <span className="text-xs text-gray-500">{data.from} - {data.to}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setData(null); setDays(n); }}
              className="rounded-xl border px-3 py-1.5 text-sm transition"
              style={{
                borderColor: n === days ? "#23261F" : "#e5e7eb",
                color: n === days ? "#23261F" : "#6b7280",
                fontWeight: n === days ? 600 : 400,
              }}
            >
              {n} დღე
            </button>
          ))}
        </div>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {data === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : (
          <>
            {cannotMeasure.length > 0 && (
              <div className="rounded-xl px-4 py-3 text-sm"
                   style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>
                <div className="mb-1 font-semibold">რისი გაზომვაც ამ გვერდს არ შეუძლია</div>
                {cannotMeasure.map((t) => <p key={t} className="text-xs leading-snug">{t}</p>)}
              </div>
            )}

            <Block title="ვინ შემოვიდა ამ პერიოდში">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Figure label="შემოვიდა" value={data.joined} />
                {/* The number that started this row, with the sentence that
                    makes it readable attached to it. */}
                <Figure label="მიზანი დაიწყო" value={data.started_a_goal} note={text(scope.started_a_goal)} />
                <Figure label="მხოლოდ სხვას დაეხმარა" value={data.only_ever_helped} />
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-3">
                <Figure
                  label="მიზანი ოდესმე ჰქონია (ყველა პერიოდი)"
                  value={scope.people_with_any_goal}
                  note="ეს არ არის ამ პერიოდზე შეზღუდული. სწორედ ამიტომ შეიძლება იყოს დიდი მაშინაც, როცა მარცხნივ ნულია."
                />
              </div>
            </Block>

            <Block title="მიზნები" caveat={text(scope.goals)}>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {pairs(data.goals, {
                  resolved: "გადაწყვეტილი",
                  stopped: "შეჩერებული",
                  open: "ღია",
                  paused: "პაუზაზე",
                  waiting_on_a_reply: "პასუხს ელოდება",
                }).map((p) => <Figure key={p.key} label={p.label} value={p.value} />)}
              </div>
            </Block>

            <Block title="პირველი პასუხი" caveat={text(first.definition)}>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Figure label="გაზომილი მიზანი" value={first.goals_measured} />
                <Figure label="მედიანა, წუთი" value={first.median_minutes} />
              </div>
            </Block>

            <Block
              title="კითხვები"
              /* Two bounds, both of which change what a zero here means, and
                 one of which the backend asked for by name. */
              caveat={
                `ეს ბლოკი ბოლო ${days} დღეს ითვლის, „პირველი პასუხი" კი პერიოდით შეზღუდული არ არის. ორი რიცხვის სხვაობა ამით აიხსნება და არა შეცდომით.` +
                (declinesSince
                  ? ` უარები ჩაიწერება მხოლოდ ${declinesSince}-დან: მანამდე არც უარი და არც თანხმობა არ ინახებოდა, ანუ ნული აქ ნიშნავს „ღილაკი არ გვქონდა" და არა „არავინ ამბობს უარს".`
                  : "")
              }
            >
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {pairs(data.asks, {
                  answered: "ნაპასუხები",
                  declined: "უარი თქვეს",
                  never_answered: "უპასუხოდ დარჩა",
                }).map((p) => <Figure key={p.key} label={p.label} value={p.value} />)}
              </div>
            </Block>

            <Block title="ვინ მოიყვანა სხვები">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {pairs(data.brought_others, {
                  people_who_invited_somebody: "ვიღაც მოიწვია",
                  their_invitees: "მოწვეული",
                  invitees_who_opened_netai: "მათგან გახსნა",
                  invitees_who_started_a_goal: "მიზანი დაიწყო",
                  invitees_who_paid: "გადაიხადა",
                }).map((p) => <Figure key={p.key} label={p.label} value={p.value} />)}
              </div>
            </Block>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Block title="გადახდები">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {pairs(data.paid, {
                    people_who_paid_once: "ერთხელ",
                    people_who_paid_twice: "ორჯერ",
                    people_who_paid_three_times: "სამჯერ",
                  }).map((p) => <Figure key={p.key} label={p.label} value={p.value} />)}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  {text(data.paid?.latest_payment)
                    ? `ბოლო გადახდა: ${text(data.paid?.latest_payment)}`
                    : "ბოლო გადახდის დრო არ მოსულა"}
                </p>
              </Block>

              <Block title="ჯაჭვის ფასი">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {pairs(data.chain_cost, {
                    askers_charged: "მკითხავს ჩამოეჭრა",
                    helpers_charged: "დამხმარეს ჩამოეჭრა",
                  }).map((p) => <Figure key={p.key} label={p.label} value={p.value} />)}
                </div>
                <p className="mt-2 text-[11px] text-gray-500">
                  {text(data.chain_cost?.helper_last_charged)
                    ? `დამხმარეს ბოლოს ჩამოეჭრა: ${text(data.chain_cost?.helper_last_charged)}`
                    : "დამხმარეს ჩამოჭრის დრო არ მოსულა"}
                </p>
              </Block>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
