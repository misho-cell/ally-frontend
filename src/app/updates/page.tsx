"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// Row 73 (21 Sept). Updates used to reach a person only as a line in chat, and
// "later" on one of them did nothing — not because the call was missing, but
// because the row was already marked seen the moment it was DISPLAYED. So
// postponing was not late, it was impossible. The backend now keeps a held
// state and this screen is the place to use it.
//
// OPENING THIS SCREEN SPENDS THE DUE UPDATES, and that is deliberate.
// Reading them here is being shown them, exactly as the assistant showing
// them is. A screen that displayed updates without counting them as shown
// would be the same fault as before, only pointing the other way. What makes
// it safe is that nothing disappears: a spent update moves into the
// already-seen list below and stays reachable after a reload, which is the
// third part of the same row.
//
// That reasoning holds only while opening is a DELIBERATE ACT BY THE PERSON.
// A deep link followed automatically, a prefetch, a background refresh or a
// tab restored at launch would spend `due` on the phone's behalf, and the
// owner would never see what they were told about. The sidebar link therefore
// sets prefetch={false}. Anything added later that can reach this screen
// without somebody choosing to look at it breaks the rule, and is worth
// saying out loud rather than discovering as an empty list.

const L = {
  en: {
    back: "← Chat",
    title: "Updates",
    intro: "What the assistant has found for you. Opening this page counts as reading them, so they move to the list below rather than waiting again.",
    dueEmpty: "Nothing new right now.",
    seenTitle: "Already read",
    seenEmpty: "Nothing here yet.",
    held: (n: number) => `${n} kept for later`,
    laterDay: "Tomorrow",
    laterWeek: "In a week",
    heldOk: "Kept for later.",
    failed: "Could not postpone it. It is still here.",
    goal: "Goal",
    loadFailed: "Could not load",
    retry: "Try again",
    weekTitle: "Your week",
    weekOf: (d: string) => `week of ${d}`,
    weekDone: "Read it",
    asks: (sent: number, answered: number) => `${answered} of ${sent} answered`,
  },
  ka: {
    back: "← ჩატი",
    title: "განახლებები",
    intro: "რაც ასისტენტმა შენთვის გაიგო. ამ გვერდის გახსნა წაკითხვად ითვლება, ამიტომ ისინი ქვემოთ სიაში გადადის და თავიდან აღარ დაგელოდება.",
    dueEmpty: "ახალი ჯერ არაფერია.",
    seenTitle: "უკვე წაკითხული",
    seenEmpty: "ჯერ არაფერია.",
    held: (n: number) => `${n} გადადებულია`,
    laterDay: "ხვალ",
    laterWeek: "კვირაში",
    heldOk: "გადაიდო.",
    failed: "ვერ გადაიდო. ისევ აქ არის.",
    goal: "მიზანი",
    loadFailed: "ვერ ჩაიტვირთა",
    retry: "თავიდან",
    weekTitle: "შენი კვირა",
    weekOf: (d: string) => `კვირა ${d}-დან`,
    weekDone: "წავიკითხე",
    asks: (sent: number, answered: number) => `${sent}-დან ${answered}-ს უპასუხეს`,
  },
};

type Update = {
  update_ref?: string | null;
  kind?: string | null;
  payload?: unknown;
  task_id?: number | string | null;
  created_at?: string | null;
};

// Row 230 (23 Sept, D462). The weekly summary used to be written into every
// open goal's thread: on 21 September Lika had 36 open goals and the same
// 9,607-character text went into 32 of them in nine seconds. She still did not
// find it — she found it by opening chats one at a time. The founder's whole
// criterion for this card was therefore "cannot be missed", and he chose a
// card of its own at the top rather than a row in the list.
type WeeklyGoal = {
  task_id?: number | string | null;
  title?: string | null;
  asks_sent?: number | null;
  asks_answered?: number | null;
  pending_question?: string | null;
};

const WEEKLY_KIND = "weekly_summary";

// One name, pinned on the server with a test. This used to read three
// spellings because the shape was described loosely and "whatever you have
// will work" felt helpful — which is exactly how two names for one thing
// become permanent, as they did for the request ref that blocked the
// tester's seat for a week.
function weeklyGoals(payload: unknown): WeeklyGoal[] {
  if (!isRecord(payload)) return [];
  const v = payload.goals;
  return Array.isArray(v) ? (recordItems(v) as WeeklyGoal[]) : [];
}

function weekStart(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const v = payload.week_start;
  return typeof v === "string" && v ? v : null;
}

// The payload's shape is the backend's and varies by kind, so nothing is
// invented here: the first string-like field that reads as text is shown, and
// if there is none the row still renders with its kind rather than vanishing.
function payloadText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!isRecord(payload)) return "";
  for (const key of ["text", "summary", "message", "body", "title", "note"]) {
    const v = payload[key];
    if (typeof v === "string" && v.trim()) return v;
  }
  return "";
}

export default function UpdatesPage() {
  const s = L[getLocale()];
  const [due, setDue] = useState<Update[]>([]);
  const [seen, setSeen] = useState<Update[]>([]);
  const [held, setHeld] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // This call spends what it returns, so it must not be fired twice by a
  // re-render: a second run would consume a second batch for nobody.
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<unknown>("/updates");
      const body = isRecord(unwrapData(res)) ? (unwrapData(res) as Record<string, unknown>) : {};
      setDue(recordItems(pickArray(body, ["due"])) as Update[]);
      setSeen(recordItems(pickArray(body, ["seen"])) as Update[]);
      // A count of nothing is 0; a count nobody sent is not 0, so it stays null
      // and the line is simply absent rather than claiming "0 kept".
      setHeld(typeof body.held === "number" ? body.held : null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [s.loadFailed]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    load();
  }, [load]);

  // The founder's second instruction: opening the screen must NOT spend this
  // card — it stays until it is tapped. That is a deliberate exception to the
  // rule above, and it is why the summary is looked for in `seen` as well as
  // `due`: GET /updates has already marked it shown server-side by the time
  // this renders, and the card has to outlive that.
  const weekly = due.find((u) => u.kind === WEEKLY_KIND) ?? null;
  const weeklyWeek = weekly ? weekStart(weekly.payload) : null;

  // The summary is never also drawn as an ordinary row: one thing in two
  // places is how a person stops trusting either.
  const dueRest = due.filter((u) => u.kind !== WEEKLY_KIND);
  // 26 Sept: the same row could arrive in BOTH lists in one response — every
  // new card did, from the day the endpoint was written. This screen draws
  // both lists, so it drew those cards twice, and the reason it was never
  // reported is probably that nobody could tell a duplicate from two similar
  // updates.
  //
  // The server no longer sends it that way. This stays because the rule it
  // enforces is the screen's own and costs nothing: a row is waiting or it is
  // read, never both, and when the two disagree the unread state wins. A
  // person shown one thing twice stops believing either copy.
  const dueRefs = new Set(due.map((u) => u.update_ref));
  const seenRest = seen.filter((u) => u.kind !== WEEKLY_KIND && !dueRefs.has(u.update_ref));

  // Tapping is what marks it read, and the server is the one that records it.
  // This was briefly a flag in this browser, because opening the screen spent
  // the card server-side and the card had to outlive that. The backend made
  // the summary an unspent kind instead, so "seen" now means "tapped" and a
  // local flag would be a second, quieter answer to a question that has one.
  const readWeek = async (ref: string) => {
    if (busy) return;
    setBusy(ref);
    setNotice(null);
    try {
      await apiFetch(`/updates/${encodeURIComponent(ref)}/seen`, { method: "POST" });
      setDue((prev) => prev.filter((u) => u.update_ref !== ref));
    } catch {
      // The card stays exactly where it is. A tap that did not land must not
      // look like one that did — which is why an unknown ref answers 404
      // rather than a quiet 200.
      setNotice({ text: s.failed, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const snooze = async (ref: string, days: number) => {
    if (busy) return;
    setBusy(ref);
    setNotice(null);
    try {
      await apiFetch(`/updates/${encodeURIComponent(ref)}/snooze`, {
        method: "POST",
        body: { days },
      });
      // Only once the server has agreed does the row leave the list, and the
      // held count moves with it so the two never disagree on screen.
      setDue((prev) => prev.filter((u) => u.update_ref !== ref));
      setHeld((n) => (typeof n === "number" ? n + 1 : n));
      setNotice({ text: s.heldOk, ok: true });
    } catch {
      // A postponement that failed must not look like one that worked: the row
      // stays exactly where it is and the screen says so.
      setNotice({ text: s.failed, ok: false });
    } finally {
      setBusy(null);
    }
  };

  const card = (u: Update, i: number, withActions: boolean) => {
    const ref = u.update_ref ?? "";
    const text = payloadText(u.payload);
    return (
      <div key={ref || i} className="card flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {u.kind && (
            <span style={{ font: "600 11px/15px var(--font-system)", color: "var(--meta)" }}>{u.kind}</span>
          )}
          {u.task_id != null && (
            <Link
              href={`/chat/${u.task_id}`}
              style={{ font: "600 11px/15px var(--font-system)", color: "var(--accent)" }}
            >
              {s.goal} #{u.task_id}
            </Link>
          )}
          {u.created_at && (
            <span className="ml-auto" style={{ font: "400 11px/15px var(--font-system)", color: "var(--meta)" }}>
              {fmtDateLoc(u.created_at, { day: "numeric", month: "short" })}
            </span>
          )}
        </div>

        {text && (
          <p style={{ font: "400 15px/22px var(--font-system)", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
            {text}
          </p>
        )}

        {withActions && ref && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary" disabled={busy === ref} onClick={() => snooze(ref, 1)}>
              {s.laterDay}
            </button>
            <button type="button" className="btn-secondary" disabled={busy === ref} onClick={() => snooze(ref, 7)}>
              {s.laterWeek}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-full" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6">
        <Link href="/chat" style={{ font: "500 13px/18px var(--font-system)", color: "var(--ink-soft)" }}>
          {s.back}
        </Link>

        <div className="flex flex-wrap items-baseline gap-2">
          <h1 style={{ font: "500 24px/30px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</h1>
          {held != null && held > 0 && (
            <span style={{ font: "500 12.5px/17px var(--font-system)", color: "var(--meta)" }}>{s.held(held)}</span>
          )}
        </div>

        <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--ink-soft)" }}>{s.intro}</p>

        {notice && (
          <p
            role="status"
            style={{
              font: "500 13px/19px var(--font-system)",
              color: notice.ok ? "var(--ink-soft)" : "var(--danger)",
            }}
          >
            {notice.text}
          </p>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--danger)" }}>{error}</p>
            <button type="button" className="btn-secondary" onClick={load}>{s.retry}</button>
          </div>
        )}

        {/* The card, at the top, before everything else on the screen. */}
        {!loading && weekly && (
          <div
            className="card flex flex-col gap-3"
            style={{ borderColor: "var(--accent)", borderWidth: "1.5px" }}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <h2 style={{ font: "500 17px/22px var(--font-bricolage)", color: "var(--ink)" }}>{s.weekTitle}</h2>
              {weeklyWeek && (
                <span style={{ font: "400 12px/16px var(--font-system)", color: "var(--meta)" }}>
                  {s.weekOf(fmtDateLoc(weeklyWeek, { day: "numeric", month: "short" }))}
                </span>
              )}
            </div>

            {payloadText(weekly.payload) && (
              <p style={{ font: "400 15px/22px var(--font-system)", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                {payloadText(weekly.payload)}
              </p>
            )}

            {/* Goal by goal, because the text alone is what she could already
                not find. A goal with nothing to report still appears: its
                silence is the report. */}
            {weeklyGoals(weekly.payload).length > 0 && (
              <div className="flex flex-col gap-2">
                {weeklyGoals(weekly.payload).map((g, i) => {
                  const sent = typeof g.asks_sent === "number" ? g.asks_sent : null;
                  const answered = typeof g.asks_answered === "number" ? g.asks_answered : null;
                  return (
                    <div key={g.task_id ?? i} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {g.task_id != null ? (
                          <Link
                            href={`/chat/${g.task_id}`}
                            style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent)" }}
                          >
                            {g.title || `${s.goal} #${g.task_id}`}
                          </Link>
                        ) : (
                          <span style={{ font: "600 13px/18px var(--font-system)", color: "var(--ink)" }}>
                            {g.title || s.goal}
                          </span>
                        )}
                        {sent != null && answered != null && (
                          <span style={{ font: "400 12px/16px var(--font-system)", color: "var(--meta)" }}>
                            {s.asks(sent, answered)}
                          </span>
                        )}
                      </div>
                      {g.pending_question && (
                        <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--ink-soft)" }}>
                          {g.pending_question}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              className="btn-secondary self-start"
              disabled={busy === weekly.update_ref}
              onClick={() => weekly.update_ref && readWeek(weekly.update_ref)}
            >
              {s.weekDone}
            </button>
          </div>
        )}

        {loading ? (
          <span className="sk-bar" style={{ width: "80%" }} />
        ) : (
          <>
            {dueRest.length === 0 ? (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.dueEmpty}</p>
            ) : (
              <div className="flex flex-col gap-3">{dueRest.map((u, i) => card(u, i, true))}</div>
            )}

            <h2 style={{ font: "500 15px/20px var(--font-system)", color: "var(--ink)", marginTop: "8px" }}>
              {s.seenTitle}
            </h2>
            {seenRest.length === 0 ? (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.seenEmpty}</p>
            ) : (
              <div className="flex flex-col gap-3">{seenRest.map((u, i) => card(u, i, false))}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
