"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
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
    add: "Add a contact",
    addName: "Name",
    addPhone: "Phone number",
    addSave: "Add",
    added: "Added",
    already: "Already in your contacts",
    addFailed: "Could not add",
    cardPhoto: "Photo of a card",
    cardFailed: "Could not read the card",
    employer: "Employer",
    job: "Position",
    city: "City",
    email: "Email",
    morePhones: "Other numbers",
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
    add: "კონტაქტის დამატება",
    addName: "სახელი",
    addPhone: "ტელეფონის ნომერი",
    addSave: "დამატება",
    added: "დაემატა",
    already: "უკვე გაქვს კონტაქტებში",
    addFailed: "ვერ დაემატა",
    cardPhoto: "ბარათის ფოტო",
    cardFailed: "ბარათი ვერ წავიკითხე",
    employer: "სამსახური",
    job: "თანამდებობა",
    city: "ქალაქი",
    email: "Email",
    morePhones: "სხვა ნომრები",
  },
};

// #374, way (3): one person typed in by hand, through the phonebook import
// route with a single contact (backend 24 Oct 08:00Z). The server wants the
// number with its +, as the upload sends it; a Georgian mobile typed the
// local way (599 12 34 56) is given its +995 here.
function normalizePhone(raw: string): string {
  const t = raw.replace(/[\s\-().]/g, "");
  if (t.startsWith("+")) return t;
  if (t.startsWith("00")) return `+${t.slice(2)}`;
  if (/^995\d{9}$/.test(t)) return `+${t}`;
  if (/^5\d{8}$/.test(t)) return `+995${t}`;
  return t;
}

type AddResult = "added" | "already" | "failed";

// #374 (Misho's yes, backend 26 Oct 20:40Z): a photo of a business card is
// read by the server and only read. What it found fills the form for a check,
// and saving goes through the same import as typing a person in. The picture
// is shrunk on the phone first, to about 1600 px on its long side.
type CardExtras = { employer: string; jobPosition: string; city: string; email: string; morePhones: string[] };
const NO_EXTRAS: CardExtras = { employer: "", jobPosition: "", city: "", email: "", morePhones: [] };
const CARD_MAX_PX = 1600;

async function cardToBase64(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, CARD_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85).replace(/^data:[^,]*,/, "");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function AddContact({ onAdded }: { onAdded: () => void }) {
  const s = L[getLocale()];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddResult | null>(null);
  const [extras, setExtras] = useState<CardExtras>(NO_EXTRAS);
  const [reading, setReading] = useState(false);
  // The server's own Georgian text for a card with no name or number (422),
  // or the plain "could not read" for anything else.
  const [cardError, setCardError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readCard(file: File) {
    setReading(true);
    setCardError(null);
    setResult(null);
    try {
      const image = await cardToBase64(file);
      const d = unwrapData(await apiFetch<unknown>("/contacts/card-read", {
        method: "POST",
        body: { image, media_type: "image/jpeg" },
      }));
      if (!isRecord(d)) throw new Error("bad answer");
      const phones = Array.isArray(d.phones) ? d.phones.map(str).filter(Boolean) : [];
      setName(str(d.name));
      setPhone(phones[0] ?? "");
      setExtras({
        employer: str(d.employer),
        jobPosition: str(d.jobPosition),
        city: str(d.city),
        email: str(d.email),
        morePhones: phones.slice(1),
      });
    } catch (err) {
      setCardError(err instanceof ApiError && err.status === 422 && err.message ? err.message : s.cardFailed);
    } finally {
      setReading(false);
    }
  }

  async function save() {
    setBusy(true);
    setResult(null);
    try {
      const raw = await apiFetch<unknown>("/contacts/import", {
        method: "POST",
        body: {
          contacts: [{
            name: name.trim(),
            phones: [normalizePhone(phone), ...extras.morePhones.map(normalizePhone)],
            ...(extras.employer.trim() ? { employer: extras.employer.trim() } : {}),
            ...(extras.jobPosition.trim() ? { jobPosition: extras.jobPosition.trim() } : {}),
            ...(extras.city.trim() ? { city: extras.city.trim() } : {}),
            ...(extras.email.trim() ? { email: extras.email.trim() } : {}),
          }],
        },
      });
      const d = unwrapData(raw);
      // Three facts (backend 08:45Z): imported = new; unchanged = already
      // saved (absent when 0); skipped = refused, e.g. the person's own number.
      const imported = isRecord(d) && typeof d.imported === "number" ? d.imported : 0;
      const unchanged = isRecord(d) && typeof d.unchanged === "number" ? d.unchanged : 0;
      if (imported > 0) {
        setResult("added");
        setName("");
        setPhone("");
        setExtras(NO_EXTRAS);
        onAdded();
      } else {
        setResult(unchanged > 0 ? "already" : "failed");
      }
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return <button type="button" className="nx-btn" onClick={() => setOpen(true)}>{s.add}</button>;
  }
  return (
    <div className="nx-card" style={{ width: "100%" }}>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void readCard(f);
        }}
      />
      <div className="nx-row" style={{ marginTop: 0 }}>
        <button type="button" className="nx-btn" disabled={reading || busy} onClick={() => fileRef.current?.click()}>
          {reading ? "…" : s.cardPhoto}
        </button>
        {cardError && <p className="nx-note" style={{ color: "var(--danger)" }}>{cardError}</p>}
      </div>
      <label className="nx-field">
        {s.addName}
        <input value={name} autoComplete="off" onChange={(e) => { setName(e.target.value); setResult(null); }} />
      </label>
      <label className="nx-field">
        {s.addPhone}
        <input type="tel" dir="ltr" inputMode="tel" value={phone} autoComplete="off" onChange={(e) => { setPhone(e.target.value); setResult(null); }} />
      </label>
      {/* Only what the card printed is shown, and each stays editable. */}
      {extras.morePhones.length > 0 && (
        <p className="nx-note" dir="ltr">{s.morePhones}: {extras.morePhones.join(", ")}</p>
      )}
      {([["employer", s.employer], ["jobPosition", s.job], ["city", s.city], ["email", s.email]] as const).map(([k, label]) =>
        extras[k] ? (
          <label key={k} className="nx-field">
            {label}
            <input value={extras[k]} autoComplete="off" onChange={(e) => setExtras((x) => ({ ...x, [k]: e.target.value }))} />
          </label>
        ) : null,
      )}
      <div className="nx-row" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="nx-btn"
          disabled={busy || !name.trim() || normalizePhone(phone).replace(/\D/g, "").length < 6}
          onClick={save}
        >
          {busy ? "…" : s.addSave}
        </button>
        {result && (
          <p className="nx-note" style={result === "failed" ? { color: "var(--danger)" } : undefined}>
            {result === "added" ? s.added : result === "already" ? s.already : s.addFailed}
          </p>
        )}
      </div>
    </div>
  );
}

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
        <AddContact onAdded={() => setNonce((n) => n + 1)} />
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
