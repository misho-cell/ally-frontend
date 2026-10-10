"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";
import { cardSource, weeklyGoals, weekStart } from "@/lib/weekly";

// 4296 (backend 13:17Z): last week's summary opens again. GET
// /updates/weekly-summaries returns up to eight, newest first, read or not,
// in the same card shape as GET /updates, and reading it spends nothing, so
// unlike /updates this screen may be opened freely.
//
// Which summary has its goals open is held here, keyed by the card's ref,
// not inside each card (#794).

const L = {
  en: {
    back: "Back to updates",
    title: "Past summaries",
    empty: "No weekly summary yet.",
    failed: "Could not load",
    retry: "Try again",
    weekOf: (d: string) => `Week of ${d}`,
    weekOpen: (n: number) => `Task by task (${n})`,
    weekClose: "Hide",
    goal: "Task",
    asks: (sent: number, answered: number) => `${answered} of ${sent} answered`,
  },
  ka: {
    back: "განახლებებში დაბრუნება",
    title: "წინა შეჯამებები",
    empty: "კვირის შეჯამება ჯერ არ არის.",
    failed: "ვერ ჩაიტვირთა",
    retry: "თავიდან",
    weekOf: (d: string) => `კვირა ${d}-დან`,
    weekOpen: (n: number) => `დავალებების მიხედვით (${n})`,
    weekClose: "დამალვა",
    goal: "დავალება",
    asks: (sent: number, answered: number) => `${sent}-დან ${answered}-ს უპასუხეს`,
  },
};

type Summary = { key: string; detail: string | null; payload: unknown };

function parse(raw: unknown): Summary[] {
  const d = unwrapData(raw);
  if (!isRecord(d)) return [];
  return recordItems(pickArray(d.summaries)).map((u, i) => ({
    key: typeof u.update_ref === "string" && u.update_ref ? u.update_ref : `i${i}`,
    detail: typeof u.detail === "string" && u.detail.trim() ? u.detail : null,
    payload: u.payload,
  }));
}

export default function WeeklySummariesPage() {
  const s = L[getLocale()];
  // undefined: loading; null: could not load; []: loaded, none yet.
  const [list, setList] = useState<Summary[] | null | undefined>(undefined);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setList(undefined);
    try {
      setList(parse(await apiFetch<unknown>("/updates/weekly-summaries")));
    } catch {
      setList(null);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/updates/weekly-summaries")
      .then((raw) => { if (alive) setList(parse(raw)); })
      .catch(() => { if (alive) setList(null); });
    return () => { alive = false; };
  }, []);

  return (
    <SheetPage title={s.title} backHref="/updates" backLabel={s.back}>
      {list === undefined && <span className="sk-bar" style={{ width: "70%" }} />}
      {list === null && (
        <div className="flex flex-col items-start gap-2">
          <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--danger)" }}>{s.failed}</p>
          <button type="button" className="btn-secondary" onClick={load}>{s.retry}</button>
        </div>
      )}
      {list && list.length === 0 && (
        <p style={{ font: "400 13.5px/20px var(--font-system)", color: "var(--meta)" }}>{s.empty}</p>
      )}
      {list && list.map((w) => {
        const start = weekStart(w.payload);
        const goals = cardSource(w.payload) === "goals" ? weeklyGoals(w.payload) : [];
        const isOpen = open[w.key] === true;
        return (
          <div key={w.key} className="card flex flex-col gap-2.5">
            {start && (
              <span style={{ font: "600 14px/20px var(--font-system)", color: "var(--ink)" }}>
                {s.weekOf(fmtDateLoc(start, { day: "numeric", month: "short" }))}
              </span>
            )}
            {w.detail && (
              <p style={{ font: "400 14.5px/21px var(--font-system)", color: "var(--ink)" }}>{w.detail}</p>
            )}
            {goals.length > 0 && (
              <button
                type="button"
                onClick={() => setOpen((o) => ({ ...o, [w.key]: !isOpen }))}
                className="self-start"
                style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent)" }}
              >
                {isOpen ? s.weekClose : s.weekOpen(goals.length)}
              </button>
            )}
            {isOpen && goals.length > 0 && (
              <div className="flex flex-col gap-2">
                {goals.map((g, i) => {
                  const sent = typeof g.asks_sent === "number" ? g.asks_sent : null;
                  const answered = typeof g.asks_answered === "number" ? g.asks_answered : null;
                  return (
                    <div key={g.task_id ?? i} className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        {g.task_id != null ? (
                          <Link href={`/chat/${g.task_id}`} style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent)" }}>
                            {g.title || `${s.goal} #${g.task_id}`}
                          </Link>
                        ) : (
                          <span style={{ font: "600 13px/18px var(--font-system)", color: "var(--ink)" }}>{g.title || s.goal}</span>
                        )}
                        {sent != null && answered != null && (
                          <span style={{ font: "400 12px/16px var(--font-system)", color: "var(--meta)" }}>{s.asks(sent, answered)}</span>
                        )}
                      </div>
                      {g.pending_question && (
                        <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--ink-soft)" }}>{g.pending_question}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </SheetPage>
  );
}
