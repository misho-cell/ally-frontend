"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale, fmtDateShort } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// „ჩემი თხოვნების მდგომარეობა" (design phone 31; backend 0302, 14 Oct):
// the owner's own introduction requests, newest first, each with the state
// the server holds. A row opens its conversation when the server names one
// (thread_id, never the goal id). A waiting request says when it runs out,
// from the server's `expires_at` (0304), never from a day count written here.

const L = {
  en: {
    title: "My introduction requests",
    back: "Profile",
    via: "Intermediary",
    empty: "No requests sent yet.",
    expires: (d: string) => `Expires ${d}`,
    failed: "Could not load",
    state: { sent: "Sent", accepted: "Accepted", declined: "Declined", expired: "Expired", cancelled: "Cancelled" },
  },
  ka: {
    title: "ჩემი თხოვნების მდგომარეობა",
    back: "პროფილი",
    via: "შუამავალი",
    empty: "თხოვნები ჯერ არ გაგიგზავნია.",
    expires: (d: string) => `ვადა იწურება ${d}`,
    failed: "ვერ ჩაიტვირთა",
    state: { sent: "გაგზავნილია", accepted: "მიღებულია", declined: "უარი თქვა", expired: "ვადა გაუვიდა", cancelled: "გაუქმდა" },
  },
};

type State = "sent" | "accepted" | "declined" | "expired" | "cancelled";
type Req = { id: string; target: string | null; mediator: string | null; threadId: string | null; state: State | null; at: string | null; expiresAt: string | null };

const STATES: readonly State[] = ["sent", "accepted", "declined", "expired", "cancelled"];
const idOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

function parse(raw: unknown): Req[] | null {
  const d = unwrapData(raw);
  if (!isRecord(d) || !Array.isArray(d.requests)) return null;
  return recordItems(pickArray(d.requests)).flatMap((r) => {
    const id = idOf(r.id);
    if (!id) return [];
    return [{
      id,
      target: str(r.target_name),
      mediator: str(r.mediator_name),
      threadId: idOf(r.thread_id),
      // An unknown state is drawn as no pill rather than guessed at.
      state: STATES.includes(r.state as State) ? (r.state as State) : null,
      at: str(r.answered_at) ?? str(r.created_at),
      expiresAt: r.state === "sent" ? str(r.expires_at) : null,
    }];
  });
}

export default function MyRequestsPage() {
  const s = L[getLocale()];
  const [list, setList] = useState<Req[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/requests/mine")
      .then((raw) => { if (alive) setList(parse(raw)); })
      .catch(() => { if (alive) setList(null); });
    return () => { alive = false; };
  }, []);

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back}>
      {list === undefined && <span className="sk-bar" style={{ width: "70%" }} />}
      {list === null && <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.failed}</p>}
      {list && list.length === 0 && <p className="nx-empty">{s.empty}</p>}
      {list && list.map((r) => {
        const body = (
          <>
            <div className="nx-row between" style={{ marginTop: 0, flexWrap: "nowrap" }}>
              <b style={{ font: "600 15px/1.4 var(--font-system)", color: "var(--nx-ink)", minWidth: 0, overflowWrap: "anywhere" }}>{r.target ?? "…"}</b>
              {r.state && <span className="nx-pill shrink-0">{s.state[r.state]}</span>}
            </div>
            <div className="nx-row between" style={{ marginTop: 2 }}>
              {r.mediator ? <span className="nx-note">{s.via}: {r.mediator}</span> : <span />}
              {r.at && <span className="nx-note">{fmtDateShort(r.at)}</span>}
            </div>
            {r.expiresAt && <p className="nx-note" style={{ margin: 0 }}>{s.expires(fmtDateShort(r.expiresAt))}</p>}
          </>
        );
        return r.threadId ? (
          <Link key={r.id} href={`/chat/${encodeURIComponent(r.threadId)}`} className="nx-card" style={{ textDecoration: "none" }}>{body}</Link>
        ) : (
          <div key={r.id} className="nx-card">{body}</div>
        );
      })}
    </SheetPage>
  );
}
