"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData } from "@/lib/payload";

// Task 8 (8 Sept, D127): one goal's full detail — stage, blocker, payer,
// outcome at the top; a chronological action timeline below. Read-only.

type Blocker =
  | { kind: "owner_question"; question?: string; since?: string }
  | { kind: "awaiting_reply"; people?: string[]; since?: string }
  | { kind: "plan_approval"; since?: string }
  | { kind: "topup"; balance?: number }
  | null;

type Action = { at?: string; kind?: string; detail?: string | null; ref_id?: string | number | null };

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
  plan?: string | null;
  plan_proposed?: boolean | null;
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

const ACTION_LABEL: Record<string, string> = {
  goal_created: "მიზანი შეიქმნა",
  plan_approved: "გეგმა დამტკიცდა",
  question_to_owner: "კითხვა მფლობელს",
  question_defaulted: "კითხვა ავტომ. შეივსო",
  circle_widened: "წრე გაფართოვდა",
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

  const backHref = `/admin/goals${userId ? `?user_id=${encodeURIComponent(userId)}` : ""}`;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href={backHref} className="text-sm text-gray-400 hover:text-gray-600 transition">← მიზნები</a>
        <h1 className="text-lg font-bold text-[#23261F]">მიზანი #{taskId}</h1>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
        {loading ? (
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

            {goal.plan && (
              <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">გეგმა</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{goal.plan}</p>
              </div>
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

function Field({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl px-3 py-2 ${accent ? "bg-amber-50" : "bg-gray-50"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm ${accent ? "text-amber-800" : "text-gray-700"}`}>{value}</p>
    </div>
  );
}
