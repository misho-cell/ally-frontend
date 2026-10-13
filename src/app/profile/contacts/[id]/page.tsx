"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import PathMap from "@/components/PathMap";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateShort } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 10 Oct, a contact's page (design 4.8), on GET /contacts/:id (backend
// 11:10Z). Everything on it is what THIS person saved: their labels, how
// close they marked the tie, their facts, the goals they kept this contact
// out of. Nothing anybody else saved is ever shown, and the contact's own
// topic boundary is deliberately absent (D421): the person asking is never
// told one exists. Read-only for now; the design's edit and forget actions
// have no routes yet.
//
// 12:15Z (D773): also what is public about the person, each fact with its
// source and date when the server has them. Public, not saved by another
// member: the server never puts a member's saving there. Kept in its own
// card so it never reads as the person's own facts.

const L = {
  en: {
    back: "Back to contacts",
    close: "Close",
    onNetai: "On Netai",
    note: "Your labels, facts and relationships appear here, and public information with its source. Information saved by others is never shown.",
    publicFacts: "Public information",
    source: "Source",
    labels: "My labels",
    facts: "My facts",
    noFacts: "No saved facts.",
    excluded: "Kept out of",
    warmth: { warm: "Warm connection", neutral: "Neutral connection", distant: "Distant connection" },
    memberCard: "Member card",
    notFound: "No contacts found",
    failed: "Could not load",
  },
  ka: {
    back: "კონტაქტებში დაბრუნება",
    close: "დახურვა",
    onNetai: "Netai-ზეა",
    note: "აქ ჩანს შენი იარლიყები, ფაქტები და ურთიერთობები, და საჯარო ინფორმაცია წყაროსთან ერთად. სხვების შენახული ინფორმაცია არასოდეს გამოჩნდება.",
    publicFacts: "საჯარო ინფორმაცია",
    source: "წყარო",
    labels: "ჩემი იარლიყები",
    facts: "ჩემი ფაქტები",
    noFacts: "შენახული ფაქტები არ არის.",
    excluded: "გამორიცხულია",
    warmth: { warm: "თბილი კავშირი", neutral: "ნეიტრალური კავშირი", distant: "დისტანციური კავშირი" },
    memberCard: "წევრის ბარათი",
    notFound: "კონტაქტი ვერ მოიძებნა",
    failed: "ვერ ჩაიტვირთა",
  },
};

type Contact = {
  name: string | null;
  role: string | null;
  onNetai: boolean;
  labels: string[];
  warmth: "warm" | "neutral" | "distant" | null;
  facts: { field: string; value: string }[];
  publicFacts: { value: string; sourceUrl: string | null; date: string | null }[];
  exclusions: string[];
};

function parse(raw: unknown): Contact | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    // 16:40Z (4390): a symbol-only contact has no name but keeps its label.
    name: str(d.name) ?? str(d.saved_as),
    role: str(d.role),
    onNetai: d.on_netai === true,
    labels: pickArray(d.labels).filter((l): l is string => typeof l === "string" && l.trim() !== ""),
    warmth: d.warmth === "warm" || d.warmth === "neutral" || d.warmth === "distant" ? d.warmth : null,
    facts: recordItems(pickArray(d.facts)).flatMap((f) => (typeof f.value === "string" && f.value.trim() ? [{ field: String(f.field ?? ""), value: f.value }] : [])),
    publicFacts: recordItems(pickArray(d.public_facts)).flatMap((f) => (typeof f.value === "string" && f.value.trim()
      ? [{ value: f.value, sourceUrl: typeof f.source_url === "string" && /^https?:\/\//.test(f.source_url) ? f.source_url : null, date: str(f.fact_date) }]
      : [])),
    exclusions: recordItems(pickArray(d.exclusions)).flatMap((e) => (typeof e.excluded_for === "string" && e.excluded_for.trim() ? [e.excluded_for] : [])),
  };
}

export default function ContactPage() {
  const s = L[getLocale()];
  const params = useParams();
  const id = String(params.id ?? "");
  const [c, setC] = useState<Contact | null | undefined>(undefined);
  const [state, setState] = useState<"ok" | "missing" | "failed">("ok");

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/contacts/${encodeURIComponent(id)}`)
      .then((raw) => { if (alive) setC(parse(raw)); })
      .catch((e: unknown) => { if (alive) { setC(null); setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"); } });
    return () => { alive = false; };
  }, [id]);

  const initial = c?.name ? Array.from(c.name.trim())[0] ?? "" : "";

  return (
    <SheetPage title={c?.name ?? "…"} backHref="/profile/contacts" backLabel={s.back} closeLabel={s.close}>
      {c === undefined && <span className="sk-bar" style={{ width: "60%" }} />}
      {c === null && (
        <p className={state === "missing" ? "nx-empty" : "nx-intro"} style={state === "missing" ? undefined : { color: "var(--danger)" }}>
          {state === "missing" ? s.notFound : s.failed}
        </p>
      )}
      {c && (
        <>
          {/* The design's avatar holds a number from its mock chain; here it
              is the first letter of the name, the one thing the page knows. Not
              upper-cased: that turns a Georgian letter into Mtavruli. */}
          {(c.role || c.onNetai) && (
            <div className="nx-member">
              <span className="nx-avatar" aria-hidden="true">{initial}</span>
              <div className="min-w-0">
                {c.role && <b style={{ font: "600 16px/1.35 var(--font-system)", color: "var(--nx-ink)", overflowWrap: "anywhere" }}>{c.role}</b>}
                {c.onNetai && <p className="nx-muted" style={{ font: "400 14px/1.65 var(--font-system)" }}>{s.onNetai}</p>}
              </div>
            </div>
          )}
          <p className="nx-note">{s.note}</p>

          {(c.labels.length > 0 || c.warmth) && (
            <>
              <h3 className="nx-h3">{s.labels}</h3>
              <div className="nx-tags">
                {c.labels.map((l) => <span key={l} className="nx-pill">{l}</span>)}
                {c.warmth && <span className="nx-pill">{s.warmth[c.warmth]}</span>}
              </div>
            </>
          )}

          <div className="nx-card">
            <h3>{s.facts}</h3>
            {c.facts.length === 0 ? (
              <p className="nx-note">{s.noFacts}</p>
            ) : (
              c.facts.map((f, i) => <p key={i}>{f.value}</p>)
            )}
          </div>

          {c.publicFacts.length > 0 && (
            <div className="nx-card">
              <h3>{s.publicFacts}</h3>
              {c.publicFacts.map((f, i) => (
                <div key={i}>
                  <p>{f.value}</p>
                  {(f.sourceUrl || f.date) && (
                    <div className="nx-row" style={{ marginTop: 2 }}>
                      {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="nx-link">{s.source}</a>}
                      {f.date && <span className="nx-note">{fmtDateShort(f.date)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {c.exclusions.length > 0 && (
            <div className="nx-card">
              <h3>{s.excluded}</h3>
              {c.exclusions.map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}

          {/* 389: a contact on Netai has a member card, what they themselves
              show. 1849: the map of how to reach them. */}
          {c.onNetai && (
            <div className="nx-row">
              <Link href={`/members/${encodeURIComponent(id)}`} className="nx-btn">{s.memberCard}</Link>
            </div>
          )}
          <PathMap contactId={id} />
        </>
      )}
    </SheetPage>
  );
}
