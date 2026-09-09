"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord, type UnknownRecord } from "@/lib/payload";

// Task 8 (8 Sept, D127): one goal's full detail — stage, blocker, payer,
// outcome at the top; a chronological action timeline below. Read-only.

type Blocker =
  | { kind: "owner_question"; question?: string; since?: string }
  | { kind: "awaiting_reply"; people?: string[]; since?: string }
  | { kind: "plan_approval"; since?: string }
  | { kind: "topup"; balance?: number }
  | null;

type Action = { at?: string; kind?: string; detail?: string | null; ref_id?: string | number | null };

// Task 4 (9 Sept): the plan is a structured object.
type PlanShape = {
  solved_when?: string | null;
  routes?: { name?: string; status?: string }[];
  people_to_involve?: { name?: string; route?: string }[];
  never_contact?: { name?: string }[];
};

type Goal = {
  id: number | string;
  title?: string | null;
  status?: string | null;
  brief?: string | null;
  stage?: string | null;
  created_at?: string | null;
  last_activity_at?: string | null;
  next_wake_at?: string | null;
  thread_id?: number | string | null;
  plan?: PlanShape | null;
  plan_proposed?: PlanShape | null;
  plan_version?: number | null;
  plan_approved_at?: string | null;
  payer?: { user_id?: number | string; name?: string | null; balance?: number | null } | null;
  blocker?: Blocker;
  outcome?: {
    state?: string; closed_reason?: string | null; closed_at?: string | null;
    asks_worked?: number | null; asks_did_not_work?: number | null;
  } | null;
  actions?: Action[];
};

const STAGE_LABEL: Record<string, string> = { waiting_topup: "ტოპ-აპის მოლოდინში" };

// 14-day test table (§3): fixed column order, Georgian headers, booleans as
// ✓/— marks. silent:true rows are the failed test days and get highlighted.
const DAY_COLUMNS: { key: string; label: string; bool?: boolean }[] = [
  { key: "day", label: "დღე" },
  { key: "asks_sent", label: "კითხვები გავიდა" },
  { key: "replies_in", label: "პასუხები მოვიდა" },
  { key: "circle_widened", label: "წრე გაფართოვდა", bool: true },
  { key: "method_changed", label: "მეთოდი შეიცვალა", bool: true },
  { key: "status_lines", label: "სტატუსი მომხმარებელს" },
  { key: "silent", label: "ჩუმი დღე", bool: true },
];

const ACTION_LABEL: Record<string, string> = {
  goal_created: "მიზანი შეიქმნა",
  plan_approved: "გეგმა დამტკიცდა",
  question_to_owner: "კითხვა მფლობელს",
  question_defaulted: "კითხვა ავტომ. შეივსო",
  circle_widened: "წრე გაფართოვდა",
  method_change_proposed: "მეთოდის ცვლილება შეთავაზდა",
  ask_sent: "კითხვა გაიგზავნა",
  follow_up_sent: "შეხსენება გაიგზავნა",
  relay_sent: "გადაგზავნა",
  answer_received: "პასუხი მიღებულია",
  answer_automatic: "ავტომატური პასუხი",
  wake: "გაღვიძება",
  weekly_summary: "კვირის შეჯამება",
  debrief_worked: "debrief: გამოვიდა",
  debrief_did_not_work: "debrief: არ გამოვიდა",
  closed: "დაიხურა",
};

const OUTCOME_LABEL: Record<string, string> = {
  open: "ღია", solved: "გადაწყდა", stopped: "შეჩერდა", paused: "დაპაუზდა",
};

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function blockerText(b: Blocker): string {
  if (!b) return "—";
  switch (b.kind) {
    case "owner_question": return `მფლობელის პასუხს ელოდება${b.question ? `: ${b.question}` : ""}`;
    case "awaiting_reply": return `პასუხს ელოდება: ${(b.people ?? []).join(", ") || "—"}`;
    case "plan_approval": return "გეგმა დასამტკიცებელია";
    case "topup": return `ტოკენები ამოიწურა (ბალანსი ${b.balance ?? 0})`;
    default: return "—";
  }
}

export default function AdminGoalDetailPage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const taskId = String(params.id);
  const userId = search.get("user_id") ?? "";

  const [goal, setGoal] = useState<Goal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  // Task extra (8 Sept): the 14-day test table, GET /admin/goals/:id/days.
  const [tab, setTab] = useState<"detail" | "days">("detail");
  const [days, setDays] = useState<{ rows: UnknownRecord[]; silent: number | null; active: number | null; from: string | null; to: string | null } | null>(null);
  const [daysError, setDaysError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setNotFound(false);
    setLoading(true);
    try {
      const q = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
      const res = await apiFetch<unknown>(`/admin/goals/${encodeURIComponent(taskId)}${q}`, { admin: true });
      const data = unwrapData(res) as { goal?: Goal } | Goal;
      const g = (data as { goal?: Goal }).goal ?? (data as Goal);
      setGoal(g);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      if (err instanceof ApiError && err.status === 404) { setNotFound(true); return; }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }, [router, taskId, userId]);

  useEffect(() => { load(); }, [load]);

  const loadDays = useCallback(async () => {
    if (days) return;
    setDaysError(null);
    try {
      const q = new URLSearchParams({ days: "14", ...(userId ? { user_id: userId } : {}) });
      const res = await apiFetch<unknown>(`/admin/goals/${encodeURIComponent(taskId)}/days?${q}`, { admin: true });
      const d = unwrapData(res);
      const body = isRecord(d) ? d : {};
      setDays({
        rows: recordItems(pickArray(d, ["days"])),
        silent: typeof body.silent_days === "number" ? body.silent_days : null,
        active: typeof body.active_days === "number" ? body.active_days : null,
        from: typeof body.from === "string" ? body.from : null,
        to: typeof body.to === "string" ? body.to : null,
      });
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) { router.replace("/admin/login"); return; }
      setDaysError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    }
  }, [days, taskId, userId, router]);

  useEffect(() => { if (tab === "days") loadDays(); }, [tab, loadDays]);

  const backHref = `/admin/goals${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href={backHref} className="text-sm text-gray-400 hover:text-gray-600 transition">← მიზნები</a>
        <h1 className="text-lg font-bold text-[#23261F]">მიზანი #{taskId}</h1>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
        <div className="flex gap-2">
          {(["detail", "days"] as const).map((tk) => (
            <button
              key={tk}
              type="button"
              onClick={() => setTab(tk)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === tk ? "bg-[#23261F] text-white" : "border border-gray-200 text-[#23261F] hover:bg-gray-100"
              }`}
            >
              {tk === "detail" ? "დეტალები" : "14 დღე"}
            </button>
          ))}
        </div>

        {tab === "days" ? (
          daysError ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{daysError}</div>
          ) : !days ? (
            <div className="flex justify-center py-12"><span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" /></div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-gray-500">
                {days.from && days.to ? `${days.from} — ${days.to} · ` : ""}აქტიური დღეები: {days.active ?? "—"} · ჩუმი: {days.silent ?? "—"}
              </p>
              {days.rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">მონაცემი არ არის</p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-gray-100 text-gray-500">
                      {DAY_COLUMNS.map((col) => (
                        <th key={col.key} className="whitespace-nowrap px-4 py-2.5 font-semibold">{col.label}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {days.rows.map((row, i) => {
                        const silent = row.silent === true;
                        return (
                          <tr
                            key={i}
                            className="border-b border-gray-50 last:border-0"
                            // silent day = the test failed that day; call it out.
                            style={silent ? { background: "#FEF2F2", color: "#B91C1C" } : undefined}
                          >
                            {DAY_COLUMNS.map((col) => {
                              const v = row[col.key];
                              return (
                                <td key={col.key} className="whitespace-nowrap px-4 py-2.5">
                                  {col.bool
                                    ? (v === true ? "✓" : "—")
                                    : v == null ? "—" : String(v)}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        ) : loading ? (
          <div className="flex justify-center py-12"><span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" /></div>
        ) : notFound ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">მიზანი ვერ მოიძებნა ან სხვისია</div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>
        ) : goal ? (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#23261F]">{goal.title || goal.brief || "—"}</h2>
                {goal.status && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{goal.status}</span>}
                {goal.stage && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${goal.stage === "waiting_topup" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                    {STAGE_LABEL[goal.stage] ?? goal.stage}
                  </span>
                )}
              </div>

              {goal.blocker && (
                <Field label="ბლოკერი" value={blockerText(goal.blocker)} accent />
              )}
              {goal.payer && (
                <Field label="ვინ იხდის" value={`${goal.payer.name ?? "—"}${goal.payer.user_id != null ? ` (#${goal.payer.user_id})` : ""}${goal.payer.balance != null ? ` · ბალანსი ${goal.payer.balance}` : ""}`} />
              )}
              {goal.outcome && (
                <Field
                  label="შედეგი"
                  value={`${OUTCOME_LABEL[goal.outcome.state ?? ""] ?? goal.outcome.state ?? "—"}${goal.outcome.closed_reason ? ` — ${goal.outcome.closed_reason}` : ""}${goal.outcome.asks_worked != null || goal.outcome.asks_did_not_work != null ? ` · გამოვიდა ${goal.outcome.asks_worked ?? 0} / ვერ ${goal.outcome.asks_did_not_work ?? 0}` : ""}`}
                />
              )}
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
                {goal.created_at && <span>შექმნა {fmt(goal.created_at)}</span>}
                {goal.last_activity_at && <span>ბოლო აქტ. {fmt(goal.last_activity_at)}</span>}
                {goal.next_wake_at && <span>შემდეგი გაღვიძება {fmt(goal.next_wake_at)}</span>}
                {goal.plan_version != null && <span>გეგმა v{goal.plan_version}</span>}
              </div>
            </div>

            {(goal.plan || goal.plan_proposed) && (
              <PlanBlock plan={goal.plan ?? goal.plan_proposed!} approved={!!goal.plan} version={goal.plan_version ?? null} />
            )}

            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">ტაიმლაინი</p>
              {Array.isArray(goal.actions) && goal.actions.length > 0 ? (
                <ol className="flex flex-col gap-3">
                  {goal.actions.map((a, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#23261F]" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="text-sm font-semibold text-[#23261F]">{ACTION_LABEL[a.kind ?? ""] ?? a.kind ?? "—"}</span>
                          <span className="text-xs text-gray-400">{fmt(a.at)}</span>
                        </div>
                        {a.detail && <p className="text-xs text-gray-600 whitespace-pre-wrap break-words">{a.detail}</p>}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-gray-400">ქმედება ჯერ არ არის</p>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function PlanBlock({ plan, approved, version }: { plan: PlanShape; approved: boolean; version: number | null }) {
  const routes = plan.routes ?? [];
  const people = plan.people_to_involve ?? [];
  const never = plan.never_contact ?? [];
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">გეგმა</p>
        {version != null && <span className="text-xs text-gray-400">v{version}</span>}
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${approved ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
          {approved ? "დამტკიცებული" : "დასამტკიცებელი"}
        </span>
      </div>
      {plan.solved_when && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">როდის ჩაითვლება გადაწყვეტილად</p>
          <p className="mt-0.5 text-sm text-gray-700 whitespace-pre-wrap">{plan.solved_when}</p>
        </div>
      )}
      {routes.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">გზები</p>
          <div className="mt-1 flex flex-col gap-1">
            {routes.map((r, i) => (
              <p key={i} className="text-sm text-gray-700">{r.name ?? "—"}{r.status ? <span className="text-xs text-gray-400"> · {r.status}</span> : null}</p>
            ))}
          </div>
        </div>
      )}
      {people.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">ვის ჩავრთავთ</p>
          <div className="mt-1 flex flex-col gap-1">
            {people.map((p, i) => (
              <p key={i} className="text-sm text-gray-700">{p.name ?? "—"}{p.route ? <span className="text-xs text-gray-400"> · {p.route}</span> : null}</p>
            ))}
          </div>
        </div>
      )}
      {never.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">არასდროს დავუკავშირდეთ</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {never.map((n, i) => (
              <span key={i} className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-600">{n.name ?? "—"}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${accent ? "bg-amber-50" : "bg-gray-50"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm ${accent ? "text-amber-800" : "text-gray-700"}`}>{value}</p>
    </div>
  );
}
