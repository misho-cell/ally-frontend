"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 10 Oct, the new design 4.8, on the backend's GET /contacts (11:10Z). The
// list carries a name, whether the person is on Netai, and (12:15Z, D772,
// Tornike's answer) the full phone number. The number is only drawn; the
// page URL stays the contact's id.
//
// Three states kept apart: loading, could not load, and loaded with nobody
// matching. "Could not load" must never read as "you have no contacts".

const L = {
  en: {
    title: "My contacts",
    back: "Back to profile",
    close: "Close",
    search: "Contact name",
    update: "Update contacts",
    onNetai: "On Netai",
    more: "More",
    empty: "No contacts found",
    failed: "Could not load",
    retry: "Try again",
  },
  ka: {
    title: "ჩემი კონტაქტები",
    back: "პროფილში დაბრუნება",
    close: "დახურვა",
    search: "კონტაქტის სახელი",
    update: "კონტაქტების განახლება",
    onNetai: "Netai-ზეა",
    more: "მეტი",
    empty: "კონტაქტი ვერ მოიძებნა",
    failed: "ვერ ჩაიტვირთა",
    retry: "თავიდან",
  },
};

type Row = { id: string; name: string | null; phone: string | null; onNetai: boolean };

function parse(raw: unknown): { rows: Row[]; next: string | null } {
  const d = unwrapData(raw);
  const rows: Row[] = [];
  if (!isRecord(d)) return { rows, next: null };
  for (const c of recordItems(pickArray(d.contacts))) {
    if (typeof c.id !== "string") continue;
    // 13:21Z: a contact saved only as a symbol has no name but keeps the
    // label exactly as saved; draw that before falling back to the dots.
    const name = typeof c.name === "string" && c.name.trim() ? c.name
      : typeof c.saved_as === "string" && c.saved_as.trim() ? c.saved_as : null;
    rows.push({ id: c.id, name, phone: typeof c.phone === "string" && c.phone.trim() ? c.phone : null, onNetai: c.on_netai === true });
  }
  return { rows, next: typeof d.next_cursor === "string" && d.next_cursor ? d.next_cursor : null };
}

export default function ContactsPage() {
  const s = L[getLocale()];
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Only the newest search may write the list: a slow answer to a short query
  // must not land on top of the answer to the longer one typed after it.
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    const t = setTimeout(() => {
      apiFetch<unknown>(`/contacts?limit=50${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`)
        .then((raw) => {
          if (mine !== seq.current) return;
          const p = parse(raw);
          setRows(p.rows);
          setNext(p.next);
          setFailed(false);
        })
        .catch(() => { if (mine === seq.current) { setRows(null); setFailed(true); } });
    }, 250);
    return () => clearTimeout(t);
  }, [q, nonce]);

  async function loadMore() {
    if (!next || busy) return;
    setBusy(true);
    try {
      const raw = await apiFetch<unknown>(`/contacts?limit=50&cursor=${encodeURIComponent(next)}${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}`);
      const p = parse(raw);
      setRows((prev) => [...(prev ?? []), ...p.rows]);
      setNext(p.next);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back} closeLabel={s.close}>
      {/* #6772: the update sits under the title, above the list, so it is
          found without scrolling past every contact. The design's second
          button, people settings, has no page yet. */}
      <div className="nx-row" style={{ marginTop: 0 }}>
        <Link href="/onboarding/contacts?from=profile" className="nx-btn">{s.update}</Link>
      </div>
      {/* 16px (in .nx-field): a smaller focused field makes iOS Safari zoom the page. */}
      <label className="nx-field" style={{ marginBottom: 0 }}>
        {s.search}
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>

      {failed && (
        <div className="nx-row">
          <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.failed}</p>
          <button type="button" className="nx-btn" onClick={() => { setFailed(false); setNonce((n) => n + 1); }}>{s.retry}</button>
        </div>
      )}

      {!failed && rows === null && <span className="sk-bar" style={{ width: "70%" }} />}

      {rows !== null && rows.length === 0 && !failed && <p className="nx-empty">{s.empty}</p>}

      {rows !== null && rows.length > 0 && rows.map((r) => (
        <div key={r.id} className="nx-card">
          <div className="nx-row between" style={{ marginTop: 0, flexWrap: "nowrap" }}>
            <Link href={`/profile/contacts/${encodeURIComponent(r.id)}`} className="nx-contact-name min-w-0" style={{ overflowWrap: "anywhere" }}>
              {r.name ?? "…"}
            </Link>
            {r.onNetai && <span className="nx-pill shrink-0">{s.onNetai}</span>}
          </div>
          {r.phone && <p dir="ltr" className="nx-note" style={{ textAlign: "start" }}>{r.phone}</p>}
        </div>
      ))}

      {next && !failed && (
        <button type="button" className="nx-btn self-center" disabled={busy} onClick={loadMore}>{s.more}</button>
      )}

    </SheetPage>
  );
}
