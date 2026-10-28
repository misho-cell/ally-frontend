"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// Task 1849, stage one (backend 10 Oct 17:16Z, GET /paths/:id). The maps
// from the owner to one person through Netai members, fewest steps first.
// Stage one SENDS NOTHING: the screen says so, and offers no button that
// would look like starting an introduction. The only states the server sends
// now are `next` and `not_contacted`; anything else is drawn without a state
// rather than guessed at.
//
// Three outcomes kept apart: no path ("paths": []), could not load (5xx or
// network), and a 404, which is either an id that is not ours or a server
// without the route yet. A 404 draws nothing at all.

const L = {
  en: {
    title: "Path to a person",
    chain: (n: number) => `Chain · ${n} people`,
    you: "You",
    onNetai: "On Netai",
    next: "First step",
    notContacted: "Not contacted yet",
    mapOnly: "This is only a map. I have not written to anyone yet.",
    none: "I found no path through Netai members.",
    failed: "Could not load",
  },
  ka: {
    title: "გზა ადამიანამდე",
    chain: (n: number) => `ჯაჭვი · ${n} ადამიანი`,
    you: "შენ",
    onNetai: "Netai-ზეა",
    next: "პირველი ნაბიჯი",
    notContacted: "ჯერ არავინ დაკავშირებია",
    mapOnly: "ეს მხოლოდ რუკაა. ჯერ არავის მივწერე.",
    none: "Netai-ის წევრებით გზა ვერ ვიპოვე.",
    failed: "ვერ ჩაიტვირთა",
  },
};

type PathLink = { id: string | null; name: string | null; role: "you" | "bridge" | "target" | null; state: "next" | "not_contacted" | null; isMember: boolean };
type Path = { links: PathLink[] };

export function parsePaths(raw: unknown): Path[] {
  const d = unwrapData(raw);
  if (!isRecord(d)) return [];
  return recordItems(pickArray(d.paths)).map((p): Path => ({
    links: recordItems(pickArray(p.links)).map((l): PathLink => ({
      id: typeof l.id === "string" && l.id ? l.id : null,
      name: typeof l.name === "string" && l.name.trim() ? l.name : null,
      role: l.role === "you" || l.role === "bridge" || l.role === "target" ? l.role : null,
      state: l.state === "next" || l.state === "not_contacted" ? l.state : null,
      isMember: l.is_member === true,
    })),
  })).filter((p) => p.links.length > 0);
}

export default function PathMap({ contactId }: { contactId: string }) {
  const s = L[getLocale()];
  // undefined: loading; null: could not load; "gone": 404, draw nothing.
  const [paths, setPaths] = useState<Path[] | null | undefined | "gone">(undefined);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/paths/${encodeURIComponent(contactId)}`)
      .then((raw) => { if (alive) setPaths(parsePaths(raw)); })
      .catch((e: unknown) => { if (alive) setPaths(e instanceof ApiError && e.status === 404 ? "gone" : null); });
    return () => { alive = false; };
  }, [contactId]);

  if (paths === undefined || paths === "gone") return null;
  const sub = { font: "600 13px/18px var(--font-system)", color: "var(--ink)" } as const;

  return (
    <div className="card flex flex-col gap-3">
      <p style={sub}>{s.title}</p>
      {paths === null && <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--danger)" }}>{s.failed}</p>}
      {paths !== null && paths.length === 0 && (
        <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.none}</p>
      )}
      {paths !== null && paths.length > 0 && (
        <>
          <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--meta)" }}>{s.mapOnly}</p>
          {paths.map((p, i) => (
            <div key={i} className="flex flex-col gap-1.5" style={{ borderTop: i ? "1px solid var(--skeleton)" : undefined, paddingTop: i ? 10 : 0 }}>
              <span style={{ font: "500 12px/16px var(--font-system)", color: "var(--meta)" }}>{s.chain(p.links.length)}</span>
              <ol className="flex flex-col gap-1">
                {p.links.map((l, j) => {
                  const name = l.role === "you" ? s.you : l.name ?? "…";
                  const state = l.state === "next" ? s.next : l.state === "not_contacted" ? s.notContacted : null;
                  return (
                    <li key={j} className="flex flex-wrap items-center gap-2" style={{ font: "400 14px/20px var(--font-system)", color: "var(--ink)" }}>
                      <span aria-hidden="true" style={{ color: "var(--meta)", width: 14 }}>{j === 0 ? "•" : "↓"}</span>
                      {l.role === "bridge" && l.id ? (
                        <Link href={`/members/${encodeURIComponent(l.id)}`} style={{ fontWeight: 600, color: "var(--accent-strong)" }}>{name}</Link>
                      ) : (
                        <span style={{ fontWeight: l.role === "target" ? 600 : 500 }}>{name}</span>
                      )}
                      {l.role !== "you" && l.isMember && <span className="kind-pill">{s.onNetai}</span>}
                      {state && <span style={{ font: "400 12px/16px var(--font-system)", color: "var(--meta)" }}>{state}</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
