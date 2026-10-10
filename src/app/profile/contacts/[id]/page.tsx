"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 10 Oct, a contact's page (design 4.8), on GET /contacts/:id (backend
// 11:10Z). Everything on it is what THIS person saved: their labels, how
// close they marked the tie, their facts, the goals they kept this contact
// out of. Nothing anybody else saved is ever shown, and the contact's own
// topic boundary is deliberately absent (D421): the person asking is never
// told one exists. Read-only for now; the design's edit and forget actions
// have no routes yet.

const L = {
  en: {
    back: "Back to contacts",
    onNetai: "On Netai",
    note: "Only your labels, facts and relationships appear here. Information saved by others is never shown.",
    labels: "My labels",
    facts: "My facts",
    noFacts: "No saved facts.",
    excluded: "Kept out of",
    warmth: { warm: "Warm connection", neutral: "Neutral connection", distant: "Distant connection" },
    notFound: "No contacts found",
    failed: "Could not load",
  },
  ka: {
    back: "კონტაქტებში დაბრუნება",
    onNetai: "Netai-ზეა",
    note: "აქ ჩანს მხოლოდ შენი იარლიყები, ფაქტები და ურთიერთობები. სხვების შენახული ინფორმაცია არასოდეს გამოჩნდება.",
    labels: "ჩემი იარლიყები",
    facts: "ჩემი ფაქტები",
    noFacts: "შენახული ფაქტები არ არის.",
    excluded: "გამორიცხულია",
    warmth: { warm: "თბილი კავშირი", neutral: "ნეიტრალური კავშირი", distant: "დისტანციური კავშირი" },
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
  exclusions: string[];
};

function parse(raw: unknown): Contact | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    name: str(d.name),
    role: str(d.role),
    onNetai: d.on_netai === true,
    labels: pickArray(d.labels).filter((l): l is string => typeof l === "string" && l.trim() !== ""),
    warmth: d.warmth === "warm" || d.warmth === "neutral" || d.warmth === "distant" ? d.warmth : null,
    facts: recordItems(pickArray(d.facts)).flatMap((f) => (typeof f.value === "string" && f.value.trim() ? [{ field: String(f.field ?? ""), value: f.value }] : [])),
    exclusions: recordItems(pickArray(d.exclusions)).flatMap((e) => (typeof e.excluded_for === "string" && e.excluded_for.trim() ? [e.excluded_for] : [])),
  };
}

const WARM_DOT = { warm: "#2E9E5B", neutral: "#C9A227", distant: "#AE4141" } as const;

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

  const sub = { font: "600 13px/18px var(--font-system)", color: "var(--ink)" } as const;

  return (
    <SheetPage title={c?.name ?? "…"} backHref="/profile/contacts" backLabel={s.back}>
      {c === undefined && <span className="sk-bar" style={{ width: "60%" }} />}
      {c === null && (
        <p style={{ font: "400 13px/19px var(--font-system)", color: state === "missing" ? "var(--meta)" : "var(--danger)" }}>
          {state === "missing" ? s.notFound : s.failed}
        </p>
      )}
      {c && (
        <>
          <div className="card flex flex-col gap-2">
            {c.role && <p style={{ font: "400 14px/20px var(--font-system)", color: "var(--ink-soft)" }}>{c.role}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {c.onNetai && <span className="kind-pill">{s.onNetai}</span>}
              {c.warmth && (
                <span className="flex items-center gap-1.5" style={{ font: "500 12.5px/17px var(--font-system)", color: "var(--ink)" }}>
                  <span className="rounded-full" style={{ width: 8, height: 8, background: WARM_DOT[c.warmth] }} />
                  {s.warmth[c.warmth]}
                </span>
              )}
            </div>
            <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--meta)" }}>{s.note}</p>
          </div>

          {c.labels.length > 0 && (
            <div className="card flex flex-col gap-2">
              <p style={sub}>{s.labels}</p>
              <div className="flex flex-wrap gap-1.5">
                {c.labels.map((l) => <span key={l} className="kind-pill">{l}</span>)}
              </div>
            </div>
          )}

          <div className="card flex flex-col gap-2">
            <p style={sub}>{s.facts}</p>
            {c.facts.length === 0 ? (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.noFacts}</p>
            ) : (
              c.facts.map((f, i) => (
                <p key={i} style={{ font: "400 14px/20px var(--font-system)", color: "var(--ink)" }}>{f.value}</p>
              ))
            )}
          </div>

          {c.exclusions.length > 0 && (
            <div className="card flex flex-col gap-1.5">
              <p style={sub}>{s.excluded}</p>
              {c.exclusions.map((e, i) => (
                <p key={i} style={{ font: "400 13.5px/19px var(--font-system)", color: "var(--ink-soft)" }}>{e}</p>
              ))}
            </div>
          )}
        </>
      )}
    </SheetPage>
  );
}
