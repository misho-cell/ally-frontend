"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { pickArray, recordItems, unwrapData } from "@/lib/payload";

// Goals (31 Aug): GET /admin/goals — each row is a task/goal with its brief,
// scheduled wake-ups, and any goal_question it's blocked on. Read-only; no
// admin write endpoint exists for this yet.

type Wake = { at: string; reason?: string | null };

type Goal = {
  id: number | string;
  task_id?: number | string;
  user_id?: number | string;
  title?: string | null;
  status?: string | null;
  // Task 8 (8 Sept): stage can now be "waiting_topup" (wallet on, balance 0).
  stage?: string | null;
  // Task 4 (9 Sept): plan is an object (or null); plan_proposed is the
  // not-yet-approved one; plan_version bumps on every proposal.
  plan?: object | null;
  plan_proposed?: object | null;
  plan_version?: number | null;
  brief?: string | null;
  blocked_question?: string | null;
  wakes?: Wake[];
  created_at?: string | null;
  updated_at?: string | null;
};

const STAGE_LABEL: Record<string, string> = {
  waiting_topup: "ტოპ-აპის მოლოდინში",
};

function fmtN(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function normalize(raw: unknown): Goal[] {
  return recordItems(pickArray(unwrapData(raw), ["goals", "rows"])) as unknown as Goal[];
}

export default function AdminGoalsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // Q-43 (8 Sept): the goals list still needs a user-id filter.
  const [userId, setUserId] = useState("");
  const [uidInput, setUidInput] = useState("");

  const load = useCallback(async () => {
    setError(null);
    setGoals(null);
    try {
      const q = userId.trim() ? `?user_id=${encodeURIComponent(userId.trim())}` : "";
      const res = await apiFetch<unknown>(`/admin/goals${q}`, { admin: true });
      setGoals(normalize(res));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setGoals([]);
    }
  }, [router, userId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">მიზნები (goals)</h1>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); setUserId(uidInput); }}
          className="flex items-center gap-2"
        >
          <input
            value={uidInput}
            onChange={(e) => setUidInput(e.target.value)}
            placeholder="user_id"
            className="w-28 rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
          />
          <button type="submit" className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">
            ჩვენება
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col gap-3">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {goals === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : goals.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">მიზნები ვერ მოიძებნა</p>
        ) : (
          goals.map((g) => {
            // Task 15 (10 Sept): rows may carry task_id rather than id — with
            // String(undefined) every row shared the key "undefined" and the
            // expander toggled nothing.
            const id = String(g.id ?? g.task_id);
            const wakes = Array.isArray(g.wakes) ? g.wakes : [];
            return (
              <div key={id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpenId(openId === id ? null : id)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#23261F]">#{id}</span>
                      {g.status && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{g.status}</span>
                      )}
                      {g.stage && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${g.stage === "waiting_topup" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-500"}`}>
                          {STAGE_LABEL[g.stage] ?? g.stage}
                        </span>
                      )}
                      {g.plan ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">გეგმა v{g.plan_version ?? "?"} ✓</span>
                      ) : g.plan_proposed ? (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">გეგმა v{g.plan_version ?? "?"} დასამტკიცებელი</span>
                      ) : null}
                      {g.blocked_question && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">დაბლოკილია კითხვით</span>
                      )}
                      {wakes.length > 0 && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{fmtN(wakes.length)} wake</span>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{g.title || g.brief || "—"}</p>
                  </div>
                  <span className="shrink-0 text-gray-400">{openId === id ? "▾" : "▸"}</span>
                </button>

                {openId === id && (
                  <div className="flex flex-col gap-3 border-t border-gray-100 p-5 text-sm">
                    {g.brief && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Brief</p>
                        <p className="mt-1 whitespace-pre-wrap text-gray-700">{g.brief}</p>
                      </div>
                    )}
                    {g.blocked_question && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">დაბლოკილი კითხვა</p>
                        <p className="mt-1 whitespace-pre-wrap text-gray-700">{g.blocked_question}</p>
                      </div>
                    )}
                    {wakes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Wake-ები</p>
                        <div className="mt-1 flex flex-col gap-1">
                          {wakes.map((w, i) => (
                            <p key={i} className="text-xs text-gray-500">
                              {fmtDate(w.at)}{w.reason ? ` — ${w.reason}` : ""}
                            </p>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex gap-6 text-xs text-gray-400">
                      {g.user_id != null && <span>user #{g.user_id}</span>}
                      {g.created_at && <span>შექმნილია {fmtDate(g.created_at)}</span>}
                      {g.updated_at && <span>განახლდა {fmtDate(g.updated_at)}</span>}
                    </div>
                    <a
                      href={`/admin/goals/${encodeURIComponent(id)}${g.user_id != null ? `?user_id=${encodeURIComponent(String(g.user_id))}` : userId.trim() ? `?user_id=${encodeURIComponent(userId.trim())}` : ""}`}
                      className="self-start rounded-lg bg-[#23261F] px-4 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
                    >
                      დეტალები →
                    </a>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
