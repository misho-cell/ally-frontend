"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { isRecord, pickArray, recordItems, unwrapData } from "@/lib/payload";

// Row 256 (24 Sept). The pilot's results over time, from
// GET /admin/pilot/report?days=N.
//
// Built from a live payload the backend pulled rather than from a described
// shape, which is why the field names here are the real ones. Pulling it also
// caught the worst number on the screen before it reached anyone: `paying`
// used to mean "the subscription_status column says active", and that column
// is written by the admin grant route as well as by Stripe. Fifteen people
// read as paying; at most four had ever been billed. It is Stripe-backed now
// and `access_granted_by_hand` is its sibling. They are drawn apart here,
// because a hand-granted account is a person using the product and is not
// revenue, and one number that means both is how a pilot gets reported as
// four times healthier than it is.

type DayRow = {
  day?: string | null;
  goals_opened?: number | null;
  goals_finished?: number | null;
  goals_stopped?: number | null;
  goals_closed_without_an_outcome?: number | null;
  asks_sent?: number | null;
  asks_answered?: number | null;
};

type Asks = {
  sent?: number | null;
  answered?: number | null;
  // Three separate numbers on purpose. "Sent minus answered" would file every
  // question younger than its reply as a failure.
  ignored?: number | null;
  waiting?: number | null;
  cancelled?: number | null;
};

type People = {
  registered?: number | null;
  past_day_20?: number | null;
  past_day_20_paying?: number | null;
  paying?: number | null;
  access_granted_by_hand?: number | null;
  newest_registration?: string | null;
};

type Side = {
  // How many people the movement came from. Deliberately NOT on the day or
  // week rows: distinct counts do not sum, and adding "people active" across
  // seven days counts one person seven times. "159 goals last week" means
  // nothing without this; it was three people.
  active_people_in_window?: number | null;
  days?: DayRow[];
  weeks?: DayRow[];
  asks?: Asks;
  people?: People;
};

type Report = {
  from?: string | null;
  to?: string | null;
  // A whole sentence from the server, not a label. Printed as it arrives.
  population?: string | null;
  // The first day on which any closure could be dated at all. A DATE, not a
  // count, and null is its most important value — see the banner below.
  closures_dated_since?: string | null;
  real?: Side;
  seats?: Side;
};

const RANGES = [7, 14, 30] as const;

function side(v: unknown): Side {
  return isRecord(v) ? (v as Side) : {};
}

// A number that did not arrive is not zero. Every count on this screen goes
// through here so that an absent field prints as absent.
function num(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function Cell({ v }: { v: number | null | undefined }) {
  const n = num(v);
  return n == null
    ? <span className="text-gray-300" title="ეს რიცხვი არ მოსულა">—</span>
    : <>{n}</>;
}

function Stat({ label, value, note }: { label: string; value: number | null | undefined; note?: string }) {
  const n = num(value);
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-bold text-[#23261F]">
        {n == null ? <span className="text-gray-300">—</span> : n}
      </div>
      {note && <div className="text-[11px] text-gray-400">{note}</div>}
    </div>
  );
}

function Rows({ title, rows }: { title: string; rows: DayRow[] }) {
  if (rows.length === 0) {
    return <p className="py-3 text-sm text-gray-400">{title}: მწკრივები არ მოსულა</p>;
  }
  return (
    <div className="overflow-x-auto">
      <div className="mb-1 text-xs font-semibold text-gray-500">{title}</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-gray-400">
            <th className="py-1 pr-3 font-medium">თარიღი</th>
            <th className="py-1 pr-3 font-medium">გახსნილი</th>
            <th className="py-1 pr-3 font-medium">დასრულებული</th>
            <th className="py-1 pr-3 font-medium">შეჩერებული</th>
            <th className="py-1 pr-3 font-medium">უშედეგოდ დახურული</th>
            <th className="py-1 pr-3 font-medium">კითხვა გაგზავნილი</th>
            <th className="py-1 font-medium">კითხვა ნაპასუხები</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.day ?? i} className="border-t border-gray-100">
              <td className="py-1 pr-3 text-gray-600">{r.day ?? "—"}</td>
              <td className="py-1 pr-3"><Cell v={r.goals_opened} /></td>
              <td className="py-1 pr-3"><Cell v={r.goals_finished} /></td>
              <td className="py-1 pr-3"><Cell v={r.goals_stopped} /></td>
              <td className="py-1 pr-3"><Cell v={r.goals_closed_without_an_outcome} /></td>
              <td className="py-1 pr-3"><Cell v={r.asks_sent} /></td>
              <td className="py-1"><Cell v={r.asks_answered} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SidePanel({ title, subtitle, data }: { title: string; subtitle: string; data: Side }) {
  const asks = data.asks ?? {};
  const people = data.people ?? {};
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div>
        <h2 className="text-sm font-bold text-[#23261F]">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>

      {/* First, because every number below is meaningless without it. */}
      <Stat
        label="აქტიური ადამიანი ამ პერიოდში"
        value={data.active_people_in_window}
        note="ეს რიცხვი დღეებზე არ ჯამდება: ერთი ადამიანი შვიდჯერ დაითვლებოდა"
      />

      <div>
        <div className="mb-1 text-xs font-semibold text-gray-500">კითხვები</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Stat label="გაგზავნილი" value={asks.sent} />
          <Stat label="ნაპასუხები" value={asks.answered} />
          {/* Three numbers, never one subtraction. */}
          <Stat label="უპასუხოდ" value={asks.ignored} />
          <Stat label="ელოდება" value={asks.waiting} />
          <Stat label="გაუქმებული" value={asks.cancelled} />
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold text-gray-500">ხალხი</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="დარეგისტრირებული" value={people.registered} />
          <Stat label="20 დღეს გადაცილებული" value={people.past_day_20} />
          <Stat label="მათგან იხდის" value={people.past_day_20_paying} note="Stripe-ით დადასტურებული" />
          <Stat label="იხდის" value={people.paying} note="Stripe-ით დადასტურებული" />
          {/* Beside paying, never inside it. */}
          <Stat label="ხელით მიცემული წვდომა" value={people.access_granted_by_hand} note="იყენებს პროდუქტს, შემოსავალი არაა" />
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          {people.newest_registration
            ? `ბოლო რეგისტრაცია: ${people.newest_registration}`
            : "ბოლო რეგისტრაციის დრო არ მოსულა"}
        </p>
      </div>

      <Rows title="დღეები" rows={recordItems(pickArray(data.days ?? [])) as DayRow[]} />
      <Rows title="კვირები" rows={recordItems(pickArray(data.weeks ?? [])) as DayRow[]} />
    </div>
  );
}

export default function AdminPilotReportPage() {
  const router = useRouter();
  const [days, setDays] = useState<number>(7);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (n: number, stillWanted: () => boolean = () => true) => {
    try {
      const res = await apiFetch<unknown>(`/admin/pilot/report?days=${n}`, { admin: true });
      const body = unwrapData(res);
      if (!stillWanted()) return;
      setReport(isRecord(body) ? (body as Report) : {});
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
          : err instanceof ApiError
            ? err.message
            : "ჩატვირთვა ვერ მოხერხდა"
      );
      setReport({});
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    // The rule cannot see across the function boundary and assumes load() sets
    // state synchronously. It does not: nothing is written before the first
    // await, and every write after it is behind the liveness check.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(days, () => alive);
    return () => { alive = false; };
  }, [load, days]);

  // The caveat is loudest exactly when the field is null. A screen that shows
  // it only when there is a date would go quiet in the one case where the
  // solved column is entirely unreadable — 422 goals were closed before the
  // date existed, and every finished/stopped number is therefore zero for
  // reasons that have nothing to do with the pilot.
  const dated = report?.closures_dated_since ?? null;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">პილოტის შედეგები</h1>
          {report?.from && report?.to && (
            <span className="text-xs text-gray-500">{report.from} - {report.to}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => { setReport(null); setDays(n); }}
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

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {report === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : (
          <>
            {/* The server's own sentence about who is counted. Verbatim: the
                rule shipped wrong once because it was paraphrased, and the
                admin flag alone misses 35 of the 45 real users. */}
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
              {report.population || "ვინ ითვლება — სერვერმა არ თქვა"}
            </div>

            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={
                dated
                  ? { background: "#fffbeb", color: "#92400e", border: "1px solid #fde68a" }
                  : { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
              }
            >
              {dated
                ? `დახურვები თარიღდება მხოლოდ ${dated}-დან. ამაზე ადრე დახურული მიზნები ვერცერთ დღეში ვერ ჩანს.`
                : "ვერცერთ დახურვას თარიღი ჯერ არ აქვს. ამიტომ „დასრულებული“, „შეჩერებული“ და „უშედეგოდ დახურული“ ყველა დღეში ნულია — ეს იმას არ ნიშნავს, რომ არაფერი გადაწყდა."}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Side by side, never summed: a seat is a test account and a
                  real person is a real person. */}
              <SidePanel title="ნამდვილი ხალხი" subtitle="სატესტო სავარძლების გარეშე" data={side(report.real)} />
              <SidePanel title="სატესტო სავარძლები" subtitle="ცალკე ითვლება, ნამდვილ ხალხს არასოდეს ემატება" data={side(report.seats)} />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
