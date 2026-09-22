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
  },
};

type Update = {
  update_ref?: string | null;
  kind?: string | null;
  payload?: unknown;
  task_id?: number | string | null;
  created_at?: string | null;
};

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

        {loading ? (
          <span className="sk-bar" style={{ width: "80%" }} />
        ) : (
          <>
            {due.length === 0 ? (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.dueEmpty}</p>
            ) : (
              <div className="flex flex-col gap-3">{due.map((u, i) => card(u, i, true))}</div>
            )}

            <h2 style={{ font: "500 15px/20px var(--font-system)", color: "var(--ink)", marginTop: "8px" }}>
              {s.seenTitle}
            </h2>
            {seen.length === 0 ? (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.seenEmpty}</p>
            ) : (
              <div className="flex flex-col gap-3">{seen.map((u, i) => card(u, i, false))}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
