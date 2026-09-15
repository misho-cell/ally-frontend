"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";

// [20] Automatic research (15 Sept): GET /admin/research-findings[?phone=…].
//
// The rule this screen exists to hold: a step we never ran and a step that
// ran and found nothing are DIFFERENT FACTS about a real person. So
// not_attempted rows sit in the same list as the rest, at the same weight —
// not hidden, not pushed below, not filed under "other". A screen that shows
// only what was found quietly turns "we never looked" into "we looked and
// there is nothing", and someone will believe it.
//
// status.on === false is stated at the top, because otherwise an empty screen
// reads as a failure rather than as a switch that is off.

type Finding = { url?: string | null; title?: string | null; snippet?: string | null };

type Step = {
  source?: string | null;
  query?: string | null;
  status?: string | null;
  note?: string | null;
  ran_at?: string | null;
  findings?: Finding[];
};

type Status = {
  on?: boolean | null;
  searches_today?: number | null;
  daily_budget?: number | null;
  people_researched?: number | null;
  findings?: number | null;
  last_run?: string | null;
};

const SOURCE_LABEL: Record<string, string> = {
  web: "ვები",
  linkedin: "LinkedIn",
  register: "რეესტრი",
  roster: "როსტერი",
};

// Four outcomes, four readings. "ვნახეთ, არაფერია" and "ვერ გავუშვით" must
// never look alike.
const STATUS_LABEL: Record<string, string> = {
  found: "ნაპოვნია",
  nothing: "ვნახეთ, არაფერია",
  not_attempted: "ვერ გავუშვით",
  error: "შეცდომა",
};
const STATUS_CLS: Record<string, string> = {
  found: "bg-green-50 text-green-700",
  nothing: "bg-gray-100 text-gray-500",
  not_attempted: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-600",
};
const CARD_CLS: Record<string, string> = {
  found: "border-gray-200",
  nothing: "border-gray-200",
  not_attempted: "border-amber-200",
  error: "border-red-200",
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

export default function AdminResearchFindingsPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const q = phone.trim() ? `?phone=${encodeURIComponent(phone.trim())}` : "";
      const res = await apiFetch<unknown>(`/admin/research-findings${q}`, { admin: true });
      const d = unwrapData(res);
      const body = isRecord(d) ? d : {};
      setStatus(isRecord(body.status) ? (body.status as Status) : null);
      setSteps(recordItems(pickArray(body, ["steps"])) as Step[]);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setSteps([]);
    } finally {
      setLoading(false);
    }
  }, [router, phone]);

  useEffect(() => { load(); }, [load]);

  const off = status?.on === false;
  // 15 Sept: on with no run yet is a THIRD state. "we looked and found
  // nothing" and "it has not started" are different facts, and an empty list
  // under a switch that reads as on says the first while meaning the second.
  const neverRan = status?.on === true && status?.last_run == null;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">ავტომატური კვლევა</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setPhone(input); }} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="+995…"
            className="w-44 rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
          />
          <button type="submit" className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90">
            ძებნა
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col gap-4">
        {off && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            ავტომატური კვლევა გამორთულია. ცარიელი სია ამ მიზეზითაა, არა ხარვეზის გამო.
          </div>
        )}

        {neverRan && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
            ჩართულია, პირველ გაშვებას ელოდება. ჯერ არაფერი შეგვისწავლია.
          </div>
        )}

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {status && (
          <div className="grid grid-cols-2 gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-4">
            <Kpi value={`${status.searches_today ?? "—"} / ${status.daily_budget ?? "—"}`} label="ძებნა დღეს" />
            <Kpi value={status.people_researched != null ? String(status.people_researched) : "—"} label="შესწავლილი ადამიანი" />
            <Kpi value={status.findings != null ? String(status.findings) : "—"} label="ნაპოვნი" />
            <Kpi value={fmt(status.last_run)} label="ბოლო გაშვება" />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : !phone.trim() ? (
          <p className="py-8 text-center text-sm text-gray-400">ნაბიჯების სანახავად შეიყვანე ტელეფონი</p>
        ) : steps.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">ამ ნომერზე ნაბიჯი არ არის</p>
        ) : (
          <div className="flex flex-col gap-3">
            {steps.map((s, i) => {
              const st = s.status ?? "";
              const found = s.findings ?? [];
              return (
                <div key={i} className={`rounded-2xl border bg-white p-5 shadow-sm ${CARD_CLS[st] ?? "border-gray-200"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-600">
                      {SOURCE_LABEL[s.source ?? ""] ?? s.source ?? "?"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_CLS[st] ?? "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[st] ?? st ?? "?"}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{fmt(s.ran_at)}</span>
                  </div>

                  {s.query && <p className="mt-2 font-mono text-xs text-gray-500 break-words">{s.query}</p>}

                  {/* The reason a step never ran is the whole point of showing
                      it, so it is stated, not tucked into a tooltip. */}
                  {s.note && (
                    <p className={`mt-2 text-sm ${st === "not_attempted" ? "text-amber-800" : st === "error" ? "text-red-600" : "text-gray-500"}`}>
                      {s.note}
                    </p>
                  )}

                  {found.length > 0 && (
                    <div className="mt-3 flex flex-col gap-2 border-t border-gray-100 pt-3">
                      {found.map((f, j) => (
                        <div key={j}>
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-blue-700 hover:underline break-words">
                              {f.title || f.url}
                            </a>
                          ) : (
                            <p className="text-sm font-semibold text-[#23261F]">{f.title || "—"}</p>
                          )}
                          {f.snippet && <p className="mt-0.5 text-xs text-gray-500 break-words">{f.snippet}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-lg font-bold text-[#23261F]">{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}
