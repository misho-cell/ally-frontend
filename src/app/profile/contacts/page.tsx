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
    search: "Search by name",
    onNetai: "On Netai",
    more: "More",
    empty: "No contacts found",
    failed: "Could not load",
    retry: "Try again",
  },
  ka: {
    title: "ჩემი კონტაქტები",
    back: "პროფილში დაბრუნება",
    search: "მოძებნე სახელით",
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
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back}>
      {/* 16px: a smaller focused field makes iOS Safari zoom the page. */}
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={s.search}
        className="w-full"
        style={{ fontSize: 16, padding: "10px 14px", borderRadius: 12, border: "1px solid var(--header-border)", background: "#FFFFFF", color: "var(--ink)" }}
      />

      {failed && (
        <div className="flex items-center gap-3">
          <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--danger)" }}>{s.failed}</p>
          <button type="button" className="btn-secondary" style={{ padding: "6px 14px" }} onClick={() => { setFailed(false); setNonce((n) => n + 1); }}>{s.retry}</button>
        </div>
      )}

      {!failed && rows === null && <span className="sk-bar" style={{ width: "70%" }} />}

      {rows !== null && rows.length === 0 && !failed && (
        <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.empty}</p>
      )}

      {rows !== null && rows.length > 0 && (
        <div className="card flex flex-col" style={{ padding: 0 }}>
          {rows.map((r, i) => (
            <Link
              key={r.id}
              href={`/profile/contacts/${encodeURIComponent(r.id)}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/5"
              style={{ borderTop: i ? "1px solid var(--skeleton)" : undefined }}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate" style={{ font: "500 14.5px/20px var(--font-system)", color: "var(--ink)" }}>{r.name ?? "…"}</span>
                {r.phone && <span dir="ltr" className="truncate" style={{ font: "400 12.5px/17px var(--font-system)", color: "var(--meta)" }}>{r.phone}</span>}
              </span>
              {r.onNetai && <span className="kind-pill shrink-0">{s.onNetai}</span>}
              <span style={{ color: "var(--meta)" }}>›</span>
            </Link>
          ))}
        </div>
      )}

      {next && !failed && (
        <button type="button" className="btn-secondary self-center" disabled={busy} onClick={loadMore}>{s.more}</button>
      )}
    </SheetPage>
  );
}
