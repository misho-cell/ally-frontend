"use client";

import { useSyncExternalStore } from "react";
import { t, tf, fmtDateShort } from "@/lib/i18n";
import RoutesList, { type Route } from "@/components/RoutesBoard";
import type { Thread } from "@/contexts/ThreadsContext";

// 9 Oct, the new design (D700). On a wide desktop the task keeps a panel on
// its right with the task's details: the person's role in it, the status,
// when it last moved. It opens and closes from a button in the header, and
// the choice is remembered in this browser, read through a tiny external
// store as PaneResizer does.
//
// What is NOT here, on purpose: the design also puts the decision card in
// this panel. The choices already sit in the thread, under the message that
// asks them, and the same buttons in two places is one thing drawn twice,
// which is how #793 began. The routes (D722) are listed under the details
// when the server returns two or more.
//
// The role is the server's (`role` on each thread, 10 Oct); see roleOf.

const KEY = "netai_context_panel";
const listeners = new Set<() => void>();

function read(): boolean {
  try { return localStorage.getItem(KEY) !== "0"; } catch { return true; }
}

function subscribe(l: () => void) {
  listeners.add(l);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) l(); };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(l); window.removeEventListener("storage", onStorage); };
}

export function setContextPanelOpen(open: boolean) {
  try { localStorage.setItem(KEY, open ? "1" : "0"); } catch { /* this tab only */ }
  listeners.forEach((l) => l());
}

// Closed on the server and the first paint, so both render the same HTML.
export function useContextPanelOpen(): boolean {
  return useSyncExternalStore(subscribe, read, () => false);
}

// The server's `role` (backend 10 Oct 07:00Z) wins whenever it is present,
// null included. Only an older server without the field falls back to the
// two cases the type alone settles. An introduction request that came to the
// person makes them the MEDIATOR, not the addressee: an earlier version of
// this function guessed addressee for it, and that was wrong, so it is no
// longer guessed at all.
function roleOf(thread: Thread): string | null {
  if (thread.role !== undefined) {
    return thread.role === "initiator" ? t("roleInitiator")
      : thread.role === "mediator" ? t("roleMediator")
      : thread.role === "addressee" ? t("roleAddressee")
      : null;
  }
  if (thread.type === "incoming_ask") return t("roleAddressee");
  if (thread.type === "regular" && thread.is_task === true) return t("roleInitiator");
  return null;
}

export function ContextPanelToggle() {
  const open = useContextPanelOpen();
  return (
    <button
      type="button"
      onClick={() => setContextPanelOpen(!open)}
      aria-pressed={open}
      aria-label={t("ctxPanelTitle")}
      title={t("ctxPanelTitle")}
      className="hidden items-center justify-center rounded-lg transition-colors hover:bg-black/5 xl:flex"
      style={{ width: 32, height: 32, border: "1px solid var(--header-border)", background: open ? "var(--accent-tint)" : "#FFFFFF", color: "var(--accent-strong)" }}
    >
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <rect x="3" y="4" width="14" height="12" rx="2" />
        <path d="M12 4v12" />
      </svg>
    </button>
  );
}

export default function ContextPanel({
  thread,
  statusLabel,
  warm,
  routes = [],
}: {
  thread: Thread | null;
  statusLabel: string | null;
  warm: boolean;
  routes?: Route[];
}) {
  const open = useContextPanelOpen();
  if (!open || !thread) return null;
  const role = roleOf(thread);
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (role) rows.push({ label: t("ctxRole"), value: role });
  if (statusLabel) {
    rows.push({
      label: t("ctxStatus"),
      value: (
        <span className="flex items-center gap-1.5">
          <i aria-hidden="true" style={{ width: 7, height: 7, borderRadius: "50%", display: "inline-block", background: warm ? "var(--apricot)" : "var(--accent)" }} />
          {statusLabel}
        </span>
      ),
    });
  }
  if (thread.updated_at) {
    const d = new Date(thread.updated_at);
    if (!isNaN(d.getTime())) {
      const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      rows.push({ label: t("ctxUpdated"), value: `${fmtDateShort(d)} ${hm}` });
    }
  }

  return (
    <aside
      className="hidden w-[300px] shrink-0 flex-col xl:flex"
      style={{ background: "#FFFFFF", borderLeft: "1px solid var(--header-border)" }}
    >
      <div className="flex items-start gap-2 px-5 py-4" style={{ borderBottom: "1px solid var(--header-border)" }}>
        <p className="flex-1" style={{ font: "600 15px/20px var(--font-system)", color: "var(--ink)" }}>{t("ctxPanelTitle")}</p>
        <button
          type="button"
          onClick={() => setContextPanelOpen(false)}
          aria-label={t("ctxClose")}
          className="flex items-center justify-center rounded-lg hover:bg-black/5"
          style={{ width: 28, height: 28, color: "var(--accent-strong)" }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
        <p className="section-label" style={{ padding: 0 }}>{t("ctxDetails")}</p>
        {rows.map((r) => (
          <div key={r.label} className="flex flex-col gap-0.5">
            <span style={{ font: "400 12px/16px var(--font-system)", color: "var(--meta)" }}>{r.label}</span>
            <span style={{ font: "500 14px/20px var(--font-system)", color: "var(--ink)" }}>{r.value}</span>
          </div>
        ))}
        {thread.status_line && (
          <p style={{ font: "400 13.5px/20px var(--font-system)", color: "var(--ink-soft)" }}>{thread.status_line}</p>
        )}
        {/* D722: the routes, when Netai talks to more than one person here. */}
        {routes.length > 0 && (
          <>
            <p className="section-label" style={{ padding: 0, marginTop: 6 }}>{tf("routesCount", { n: routes.length })}</p>
            <RoutesList routes={routes} />
          </>
        )}
      </div>
    </aside>
  );
}
