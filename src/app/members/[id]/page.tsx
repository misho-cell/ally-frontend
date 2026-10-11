"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray } from "@/lib/payload";

// Task 389, the member card (backend 10 Oct 17:16Z, GET /members/:id). What
// the member themselves show: role and company, city, their areas, and what
// they said they are open to. A hidden or never-filled field is simply not
// drawn. Reached from a contact who is on Netai, and from a person in the
// middle of a path map. Read-only; nothing here contacts anyone.

const L = {
  en: {
    title: "Member card",
    back: "Back",
    areas: "Areas",
    openTo: "Open to",
    notFound: "No member found",
    failed: "Could not load",
  },
  ka: {
    title: "წევრის ბარათი",
    back: "უკან",
    areas: "სფეროები",
    openTo: "რისთვის ვარ ღია",
    notFound: "წევრი ვერ მოიძებნა",
    failed: "ვერ ჩაიტვირთა",
  },
};

type Member = { name: string | null; role: string | null; company: string | null; city: string | null; areas: string[]; openTo: string[] };

function parse(raw: unknown): Member | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const list = (v: unknown) => pickArray(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return { name: str(d.name), role: str(d.role), company: str(d.company), city: str(d.city), areas: list(d.areas), openTo: list(d.open_to) };
}

export default function MemberPage() {
  const s = L[getLocale()];
  const params = useParams();
  const id = String(params.id ?? "");
  const [m, setM] = useState<Member | null | undefined>(undefined);
  const [state, setState] = useState<"ok" | "missing" | "failed">("ok");

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/members/${encodeURIComponent(id)}`)
      .then((raw) => { if (alive) setM(parse(raw)); })
      .catch((e: unknown) => { if (alive) { setM(null); setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"); } });
    return () => { alive = false; };
  }, [id]);

  const sub = { font: "600 13px/18px var(--font-system)", color: "var(--ink)" } as const;
  const work = m ? [m.role, m.company].filter(Boolean).join(" · ") : "";

  return (
    <SheetPage
      title={m?.name ?? s.title}
      backHref="/profile/contacts"
      backLabel={s.back}
    >
      {m === undefined && <span className="sk-bar" style={{ width: "60%" }} />}
      {m === null && (
        <p style={{ font: "400 13px/19px var(--font-system)", color: state === "missing" ? "var(--meta)" : "var(--danger)" }}>
          {state === "missing" ? s.notFound : s.failed}
        </p>
      )}
      {m && (
        <>
          {(work || m.city) && (
            <div className="card flex flex-col gap-1">
              {work && <p style={{ font: "500 14.5px/21px var(--font-system)", color: "var(--ink)" }}>{work}</p>}
              {m.city && <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--ink-soft)" }}>{m.city}</p>}
            </div>
          )}
          {m.areas.length > 0 && (
            <div className="card flex flex-col gap-2">
              <p style={sub}>{s.areas}</p>
              <div className="flex flex-wrap gap-1.5">
                {m.areas.map((a) => <span key={a} className="kind-pill">{a}</span>)}
              </div>
            </div>
          )}
          {m.openTo.length > 0 && (
            <div className="card flex flex-col gap-1.5">
              <p style={sub}>{s.openTo}</p>
              {m.openTo.map((o, i) => (
                <p key={i} style={{ font: "400 14px/20px var(--font-system)", color: "var(--ink)" }}>{o}</p>
              ))}
            </div>
          )}
        </>
      )}
    </SheetPage>
  );
}
