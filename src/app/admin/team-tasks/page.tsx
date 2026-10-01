"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, isRecord } from "@/lib/payload";

// M3 (1 Oct). The team's task board, the screen for M2's routes.
//
// Two pages, and they are two different things rather than two tabs of one.
// Page 1 is where anybody writes down a problem, grouped by who wrote it.
// Page 2 is the ordered list Misho's side actually builds from. Moving a task
// between them is a decision, so it is a button with a word on it and not a
// drag.

const PEOPLE = ["tornike", "giorgi", "lika", "ninia", "misho", "ai"] as const;
type Person = (typeof PEOPLE)[number];

// Closed lists, like the handoff board's authors. A value neither of us knows
// still renders, labelled with itself, rather than vanishing or being dressed
// as somebody else: a task filed under an unknown name is still somebody's
// task.
const PERSON_LABEL: Record<string, string> = {
  tornike: "თორნიკე",
  giorgi: "გიორგი",
  lika: "ლიკა",
  ninia: "ნინია",
  misho: "მიშო",
  ai: "AI",
};

const PERSON_CLS: Record<string, string> = {
  tornike: "bg-amber-100 text-amber-900",
  giorgi: "bg-blue-100 text-blue-800",
  lika: "bg-purple-100 text-purple-800",
  ninia: "bg-pink-100 text-pink-800",
  misho: "bg-emerald-100 text-emerald-900",
  ai: "bg-gray-200 text-gray-700",
};

const STATUSES = ["to_build", "built", "being_tested", "tested"] as const;

const STATUS_LABEL: Record<string, string> = {
  to_build: "ასაშენებელი",
  built: "აშენებულია",
  being_tested: "იტესტება",
  tested: "გატესტილია",
};

const STATUS_CLS: Record<string, string> = {
  to_build: "bg-gray-100 text-gray-600",
  built: "bg-blue-100 text-blue-800",
  being_tested: "bg-amber-100 text-amber-900",
  tested: "bg-green-100 text-green-800",
};

// 1 is most urgent. Named rather than numbered on screen, because "1" next to
// "3" does not say which way round it runs and a wrong guess here reorders
// somebody's week.
const PRIORITY_LABEL: Record<number, string> = {
  1: "სასწრაფო",
  2: "საშუალო",
  3: "მოგვიანებით",
};

const PRIORITY_CLS: Record<number, string> = {
  1: "bg-red-100 text-red-800",
  2: "bg-amber-100 text-amber-900",
  3: "bg-gray-100 text-gray-600",
};

type Task = {
  id: number;
  created_by?: string | null;
  problem?: string | null;
  task?: string | null;
  priority?: number | null;
  status?: string | null;
  page?: number | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function toTask(raw: unknown): Task | null {
  if (!isRecord(raw)) return null;
  const id = raw.id;
  if (typeof id !== "number") return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;
  return {
    id,
    created_by: str(raw.created_by),
    problem: str(raw.problem),
    task: str(raw.task),
    priority: num(raw.priority),
    status: str(raw.status),
    page: num(raw.page),
    created_at: str(raw.created_at),
    updated_at: str(raw.updated_at),
  };
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function TeamTasksPage() {
  const router = useRouter();
  const [page, setPage] = useState<1 | 2>(1);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  // New task form.
  const [problem, setProblem] = useState("");
  const [task, setTask] = useState("");
  const [priority, setPriority] = useState(2);
  // Only the SHARED login must name the author; a person signed in as
  // themselves cannot file under another name, and the server decides. So
  // this stays empty unless the server refuses for want of it.
  const [createdBy, setCreatedBy] = useState<Person | "">("");
  const [needsAuthor, setNeedsAuthor] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (p: 1 | 2) => {
    setError(null);
    try {
      const res = await apiFetch<unknown>(`/admin/team-tasks?page=${p}`, { admin: true });
      const body = unwrapData(res);
      const rows = pickArray(body, ["tasks"]);
      setTasks(rows.map(toTask).filter((t): t is Task => t != null));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setTasks([]);
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    // Nothing is written before the first await and the liveness check guards
    // everything after it; the rule cannot see across the function boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(page).then(() => { if (!alive) return; });
    return () => { alive = false; };
  }, [load, page]);

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      await apiFetch<unknown>(`/admin/team-tasks/${id}`, { method: "PATCH", body, admin: true });
      await load(page);
    } catch (err) {
      // 404 means somebody else removed it while this screen was open. Saying
      // so is better than a silent reload that makes the row blink away.
      setError(
        err instanceof ApiError && err.status === 404
          ? "ეს დავალება აღარ არსებობს, სია განახლდა"
          : err instanceof ApiError ? err.message : "ვერ შეიცვალა"
      );
      if (err instanceof ApiError && err.status === 404) await load(page);
    } finally {
      setBusy(null);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!problem.trim() || !task.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { problem: problem.trim(), task: task.trim(), priority };
      if (createdBy) body.created_by = createdBy;
      await apiFetch<unknown>("/admin/team-tasks", { method: "POST", body, admin: true });
      setProblem("");
      setTask("");
      setNeedsAuthor(false);
      await load(page);
    } catch (err) {
      // The shared login is refused without created_by. That is not a fault
      // to show as one: it means this seat has to say who is filing, so the
      // field appears and the text explains why rather than repeating the
      // server's sentence about a missing parameter.
      if (err instanceof ApiError && err.status === 400 && !createdBy) {
        setNeedsAuthor(true);
        setError("ეს საერთო შესვლაა, ამიტომ უნდა აირჩიო ვისი დავალებაა");
      } else {
        setError(err instanceof ApiError ? err.message : "ვერ შეინახა");
      }
    } finally {
      setSaving(false);
    }
  }

  // Page 1 groups by person; page 2 is one ordered list and grouping it by
  // author would hide the order, which is the only thing page 2 is for.
  const groups: { person: string; rows: Task[] }[] = [];
  if (page === 1 && tasks) {
    const seen = new Map<string, Task[]>();
    for (const t of tasks) {
      const key = t.created_by ?? "";
      const list = seen.get(key);
      if (list) list.push(t);
      else seen.set(key, [t]);
    }
    // Known people first, in the order the backend names them, then anything
    // unknown, so a new seat appears rather than disappearing.
    for (const p of PEOPLE) {
      const rows = seen.get(p);
      if (rows) { groups.push({ person: p, rows }); seen.delete(p); }
    }
    for (const [person, rows] of seen) groups.push({ person, rows });
  }

  const row = (t: Task) => (
    <div key={t.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        {t.priority != null && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PRIORITY_CLS[t.priority] ?? "bg-gray-100 text-gray-600"}`}>
            {PRIORITY_LABEL[t.priority] ?? `პრიორიტეტი ${t.priority}`}
          </span>
        )}
        {page === 2 && t.created_by && (
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PERSON_CLS[t.created_by] ?? "bg-gray-100 text-gray-500"}`}>
            {PERSON_LABEL[t.created_by] ?? t.created_by}
          </span>
        )}
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_CLS[t.status ?? ""] ?? "bg-gray-100 text-gray-500"}`}>
          {STATUS_LABEL[t.status ?? ""] ?? t.status ?? "სტატუსი უცნობია"}
        </span>
        <span className="ml-auto text-xs text-gray-400">{fmt(t.created_at)}</span>
      </div>

      {/* The problem first and the task under it. They are not the same
          sentence: one says what hurts and the other says what to do, and a
          board that keeps only the second loses why it was ever asked for. */}
      <p className="mt-2 whitespace-pre-wrap break-words text-sm font-medium text-[#23261F]">
        {t.problem ?? "—"}
      </p>
      {t.task && (
        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-600">{t.task}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {STATUSES.map((st) => (
          <button
            key={st}
            type="button"
            disabled={busy === t.id || t.status === st}
            onClick={() => patch(t.id, { status: st })}
            className="rounded-full border px-3 py-1 text-xs transition disabled:opacity-40"
            style={{
              borderColor: t.status === st ? "#23261F" : "#e5e7eb",
              color: t.status === st ? "#23261F" : "#6b7280",
              fontWeight: t.status === st ? 600 : 400,
            }}
          >
            {STATUS_LABEL[st]}
          </button>
        ))}

        <span className="mx-1 h-4 w-px bg-gray-200" />

        {[1, 2, 3].map((p) => (
          <button
            key={p}
            type="button"
            disabled={busy === t.id || t.priority === p}
            onClick={() => patch(t.id, { priority: p })}
            className="rounded-full border px-3 py-1 text-xs transition disabled:opacity-40"
            style={{
              borderColor: t.priority === p ? "#23261F" : "#e5e7eb",
              color: t.priority === p ? "#23261F" : "#6b7280",
              fontWeight: t.priority === p ? 600 : 400,
            }}
          >
            {PRIORITY_LABEL[p]}
          </button>
        ))}

        <button
          type="button"
          disabled={busy === t.id}
          onClick={() => patch(t.id, { page: page === 1 ? 2 : 1 })}
          className="ml-auto rounded-xl bg-[#23261F] px-3 py-1.5 text-xs text-white transition hover:opacity-80 disabled:opacity-40"
        >
          {page === 1 ? "მიშოსთან გადატანა →" : "← გიორგისთან დაბრუნება"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-[#23261F]">გუნდის დავალებები</h1>
        <a href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-[#23261F] transition hover:bg-gray-50">
          ← ადმინი
        </a>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
        <div className="flex gap-1 self-start rounded-xl bg-gray-100 p-1">
          {([1, 2] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => { setTasks(null); setPage(p); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                page === p ? "bg-white text-[#23261F] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {p === 1 ? "გიორგისთან" : "მიშოსთან"}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>
        )}

        <form onSubmit={create} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <input
            type="text"
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="რა პრობლემაა"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#23261F]"
          />
          <input
            type="text"
            value={task}
            onChange={(e) => setTask(e.target.value)}
            placeholder="რა უნდა გაკეთდეს"
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#23261F]"
          />
          <div className="flex flex-wrap items-center gap-2">
            {[1, 2, 3].map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPriority(p)}
                className="rounded-full border px-3 py-1 text-xs transition"
                style={{
                  borderColor: priority === p ? "#23261F" : "#e5e7eb",
                  color: priority === p ? "#23261F" : "#6b7280",
                  fontWeight: priority === p ? 600 : 400,
                }}
              >
                {PRIORITY_LABEL[p]}
              </button>
            ))}

            {/* Appears only when the server has said this seat must name the
                author. Showing it to everybody would invite a person signed
                in as themselves to pick somebody else, which the server
                refuses anyway — a field that cannot do what it appears to do
                is worse than no field. */}
            {needsAuthor && (
              <select
                value={createdBy}
                onChange={(e) => setCreatedBy(e.target.value as Person | "")}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#23261F]"
              >
                <option value="">ვისი დავალებაა</option>
                {PEOPLE.map((p) => (
                  <option key={p} value={p}>{PERSON_LABEL[p]}</option>
                ))}
              </select>
            )}

            <button
              type="submit"
              disabled={saving || !problem.trim() || !task.trim()}
              className="ml-auto rounded-xl bg-[#23261F] px-4 py-2 text-sm text-white transition hover:opacity-80 disabled:opacity-40"
            >
              {saving ? "ინახება..." : "დამატება"}
            </button>
          </div>
        </form>

        {tasks === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : tasks.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {page === 1 ? "გიორგისთან ჯერ არაფერია" : "მიშოსთან ჯერ არაფერია"}
          </p>
        ) : page === 1 ? (
          groups.map((g) => (
            <section key={g.person || "unknown"} className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PERSON_CLS[g.person] ?? "bg-gray-100 text-gray-500"}`}>
                  {PERSON_LABEL[g.person] ?? g.person ?? "ავტორი უცნობია"}
                </span>
                <span className="text-xs text-gray-400">{g.rows.length}</span>
              </div>
              {g.rows.map(row)}
            </section>
          ))
        ) : (
          <div className="flex flex-col gap-3">{tasks.map(row)}</div>
        )}
      </div>
    </div>
  );
}
