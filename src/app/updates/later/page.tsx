"use client";

import { useCallback, useEffect, useState } from "react";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 13 Oct, FIXED2 „later-list": the updates that were put off, each with the
// day it comes back and a way to bring it back now.
//
// This page must never call GET /updates: that call spends the due cards,
// and walking into the „later" list is not reading them. It reads
// GET /updates/held for the list and, while that does not exist yet on the
// server (asked for in TO_BACKEND, 13 Oct), the spend-nothing count. Three
// different facts get three different screens: a list, a number with no
// list behind it yet, and nothing put off at all.

const L = {
  en: {
    title: "Later",
    back: "What happened",
    close: "Close",
    empty: "No updates postponed.",
    countOnly: (n: number) => `${n} postponed. Each one comes back on its own day.`,
    comesBack: (d: string) => `Comes back on ${d}`,
    bringBack: "Bring back now",
    loadFailed: "Could not load",
    retry: "Try again",
    failed: "Could not bring it back, try again",
  },
  ka: {
    title: "მოგვიანებით",
    back: "რა მოხდა",
    close: "დახურვა",
    empty: "გადადებული განახლებები არ გაქვს.",
    countOnly: (n: number) => `${n} გადადებულია. თითოეული თავის დღეს დაგიბრუნდება.`,
    comesBack: (d: string) => `დაგიბრუნდება ${d}`,
    bringBack: "ახლავე დაბრუნება",
    loadFailed: "ვერ ჩაიტვირთა",
    retry: "თავიდან",
    failed: "ვერ დაბრუნდა, სცადე თავიდან",
  },
};

type Held = { update_ref?: string | null; title?: string | null; detail?: string | null; until?: string | null };
type State =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "list"; items: Held[] }
  | { kind: "count"; held: number };

export default function LaterPage() {
  const s = L[getLocale()];
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ kind: "loading" });
    try {
      const res = await apiFetch<unknown>("/updates/held");
      const body = unwrapData(res);
      const items = Array.isArray(body) ? body : isRecord(body) ? pickArray(body, ["items", "held"]) : [];
      setState({ kind: "list", items: recordItems(items) as Held[] });
      return;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 404)) {
        setState({ kind: "failed" });
        return;
      }
    }
    try {
      const res = await apiFetch<unknown>("/updates/count");
      const body = unwrapData(res);
      const held = isRecord(body) && typeof body.held === "number" ? body.held : null;
      setState(held == null ? { kind: "failed" } : { kind: "count", held });
    } catch {
      setState({ kind: "failed" });
    }
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      await Promise.resolve();
      if (live) await load();
    })();
    return () => { live = false; };
  }, [load]);

  const bringBack = async (ref: string) => {
    if (busy) return;
    setBusy(ref);
    setNotice(null);
    try {
      await apiFetch(`/updates/${encodeURIComponent(ref)}/snooze`, { method: "DELETE" });
      setState((prev) => (prev.kind === "list" ? { kind: "list", items: prev.items.filter((h) => h.update_ref !== ref) } : prev));
    } catch {
      setNotice(s.failed);
    } finally {
      setBusy(null);
    }
  };

  return (
    <SheetPage title={s.title} backHref="/updates" backLabel={s.back} closeLabel={s.close}>
      {notice && (
        <p role="status" className="nx-intro" style={{ color: "var(--danger)" }}>{notice}</p>
      )}
      {state.kind === "loading" && <span className="sk-bar" style={{ width: "60%" }} />}
      {state.kind === "failed" && (
        <div className="flex flex-col items-start gap-2">
          <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.loadFailed}</p>
          <button type="button" className="nx-btn" onClick={load}>{s.retry}</button>
        </div>
      )}
      {state.kind === "count" &&
        (state.held > 0 ? <p className="nx-intro">{s.countOnly(state.held)}</p> : <p className="nx-empty">{s.empty}</p>)}
      {state.kind === "list" &&
        (state.items.length === 0 ? (
          <p className="nx-empty">{s.empty}</p>
        ) : (
          state.items.map((h, i) => (
            <article key={h.update_ref ?? i} className="nx-card">
              {h.title && <h3>{h.title}</h3>}
              {h.until && <p>{s.comesBack(fmtDateLoc(h.until))}</p>}
              {h.update_ref && (
                <div className="nx-row">
                  <button type="button" className="nx-btn" disabled={busy === h.update_ref} onClick={() => bringBack(h.update_ref!)}>
                    {s.bringBack}
                  </button>
                </div>
              )}
            </article>
          ))
        ))}
    </SheetPage>
  );
}
