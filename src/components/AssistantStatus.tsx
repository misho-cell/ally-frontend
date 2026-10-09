"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";
import { t, tf, fmtDateShort } from "@/lib/i18n";

// D699 (9 Oct, the new design). The "online" dot is real: green only while
// the assistant actually answers, a line saying since when while it does not,
// and NOTHING while we do not know. Three facts, three drawings; "unknown"
// must never borrow the green dot, or the dot would be lit on the very day
// the assistant is down and the heartbeat with it.
//
// The backend's GET /status/assistant (9 Oct, 19:45Z) does the ageing itself:
// `unknown` already means "no answer in 45 minutes and no refusal on record".
// So `checked_at` is not re-aged here, and `not_answering` is NOT timed out
// on it either: failing probes do not restamp it, and the line has to stay up
// until the server says otherwise. A failed request, a 404 from a server
// that does not have the route yet, or anything unreadable draws nothing.
//
// One poller for the whole app, shared by every dot and line through a tiny
// external store, as PaneResizer and diagnostics do. It reads on the first
// subscriber, every three minutes while the tab is visible, and when the tab
// comes back. The route allows 20 a minute; this is far under it.

export type AssistantState =
  | { state: "answering" }
  | { state: "not_answering"; since: string | null }
  | null;

const POLL_MS = 3 * 60_000;
let current: AssistantState = null;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function emit(next: AssistantState) {
  const same =
    (next === null && current === null) ||
    (next !== null && current !== null && next.state === current.state &&
      (next.state !== "not_answering" || (current.state === "not_answering" && next.since === current.since)));
  if (same) return;
  current = next;
  listeners.forEach((l) => l());
}

async function read() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  try {
    const body = unwrapData(await apiFetch<unknown>("/status/assistant"));
    if (!isRecord(body)) return emit(null);
    if (body.state === "answering") return emit({ state: "answering" });
    if (body.state === "not_answering") {
      return emit({ state: "not_answering", since: typeof body.since === "string" ? body.since : null });
    }
    emit(null);
  } catch {
    emit(null);
  }
}

const onVisible = () => { if (document.visibilityState === "visible") void read(); };

function subscribe(l: () => void) {
  listeners.add(l);
  if (listeners.size === 1) {
    void read();
    timer = setInterval(() => void read(), POLL_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  return () => {
    listeners.delete(l);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      timer = null;
      document.removeEventListener("visibilitychange", onVisible);
    }
  };
}

export function useAssistantStatus(): AssistantState {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

// The small green dot on the assistant's picture. Drawn only on `answering`.
export function OnlineDot({ size = 9 }: { size?: number }) {
  const s = useAssistantStatus();
  if (s?.state !== "answering") return null;
  return (
    <span
      role="img"
      aria-label={t("assistantAnswering")}
      title={t("assistantAnswering")}
      className="absolute rounded-full"
      style={{ right: -1, bottom: -1, width: size, height: size, background: "#2E9E5B", border: "2px solid #FFFFFF" }}
    />
  );
}

function sinceLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return d.toDateString() === new Date().toDateString() ? hm : `${fmtDateShort(iso)} ${hm}`;
}

// The line while the assistant does not answer. Without a readable `since`
// it says so without a time rather than inventing one.
export function OutageLine({ className = "" }: { className?: string }) {
  const s = useAssistantStatus();
  if (s?.state !== "not_answering") return null;
  const when = s.since ? sinceLabel(s.since) : "";
  return (
    <p
      role="status"
      className={className}
      style={{
        font: "500 12.5px/18px var(--font-system)", color: "var(--danger)",
        background: "var(--terra-tint)", borderRadius: 12, padding: "8px 12px",
      }}
    >
      {when ? tf("assistantDownSince", { t: when }) : t("assistantDown")}
    </p>
  );
}
