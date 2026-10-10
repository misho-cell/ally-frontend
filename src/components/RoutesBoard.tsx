"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";
import { t, fmtDateShort } from "@/lib/i18n";

// D722 (the new design): whenever Netai talks to more than one person in
// parallel for a task, the task shows a board of those people and where each
// stands. The backend's GET /threads/:id/routes (10 Oct, 07:00Z) is keyed by
// the THREAD id and looks the goal up itself; it returns fewer than two rows
// as an empty list, and an empty list means no board. Nothing here infers a
// route from the chat text.
//
// A row's identity is `kind` + `ask_id` together: an ask and an introduction
// can share a number (the backend says so), so neither alone is a key.

export type Route = {
  key: string;
  kind: string;
  personName: string | null;
  role: string | null;
  state: "waiting" | "answered" | "declined" | "confirmed" | "closed" | null;
  summary: string | null;
  updatedAt: string | null;
};

const STATES = ["waiting", "answered", "declined", "confirmed", "closed"] as const;

function parse(raw: unknown): Route[] {
  const d = unwrapData(raw);
  if (!isRecord(d)) return [];
  const out: Route[] = [];
  for (const r of recordItems(pickArray(d.routes))) {
    const id = r.ask_id;
    const kind = typeof r.kind === "string" ? r.kind : "ask";
    if (typeof id !== "number" && typeof id !== "string") continue;
    const state = (STATES as readonly string[]).includes(String(r.state)) ? (r.state as Route["state"]) : null;
    out.push({
      key: `${kind}:${id}`,
      kind,
      personName: typeof r.person_name === "string" && r.person_name.trim() ? r.person_name : null,
      role: typeof r.role === "string" ? r.role : null,
      state,
      summary: typeof r.summary === "string" && r.summary.trim() ? r.summary : null,
      updatedAt: typeof r.updated_at === "string" ? r.updated_at : null,
    });
  }
  return out;
}

// Read once per thread, and again whenever the thread moves (`stamp` is its
// updated_at), so a new answer shows without a reload. A failed read keeps
// no board rather than an empty one that would claim there are no routes.
export function useRoutes(threadId: string | null, stamp: string | null | undefined): Route[] {
  const [routes, setRoutes] = useState<Route[]>([]);
  useEffect(() => {
    if (!threadId) return;
    let alive = true;
    apiFetch<unknown>(`/threads/${encodeURIComponent(threadId)}/routes`)
      .then((raw) => { if (alive) setRoutes(parse(raw)); })
      .catch(() => { if (alive) setRoutes([]); });
    return () => { alive = false; };
  }, [threadId, stamp]);
  return routes.length >= 2 ? routes : [];
}

const STATE_KEY = {
  waiting: "routeWaiting",
  answered: "routeAnswered",
  declined: "routeDeclined",
  confirmed: "routeConfirmed",
  closed: "routeClosed",
} as const;

function stateStyle(state: Route["state"]): { bg: string; fg: string } {
  if (state === "confirmed" || state === "answered") return { bg: "var(--accent-tint)", fg: "var(--accent-strong)" };
  if (state === "declined") return { bg: "var(--terra-tint)", fg: "var(--danger)" };
  if (state === "waiting") return { bg: "rgba(244,173,120,0.22)", fg: "#8D4920" };
  return { bg: "var(--skeleton)", fg: "var(--meta)" };
}

export default function RoutesList({ routes }: { routes: Route[] }) {
  return (
    <div className="flex flex-col gap-2">
      {routes.map((r) => {
        const st = stateStyle(r.state);
        return (
          <div key={r.key} className="flex flex-col gap-1" style={{ border: "1px solid var(--header-border)", borderRadius: 12, padding: "10px 12px", background: "#FFFFFF" }}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate" style={{ font: "600 14px/20px var(--font-system)", color: "var(--ink)" }}>
                {r.personName ?? "…"}
              </span>
              {r.state && (
                <span style={{ font: "500 11.5px/16px var(--font-system)", background: st.bg, color: st.fg, borderRadius: 6, padding: "2px 7px" }}>
                  {t(STATE_KEY[r.state])}
                </span>
              )}
            </div>
            {r.summary && (
              <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--ink-soft)", overflowWrap: "anywhere" }}>{r.summary}</p>
            )}
            {r.updatedAt && (
              <span style={{ font: "400 11px/15px var(--font-system)", color: "var(--meta)" }}>{fmtDateShort(r.updatedAt)}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
