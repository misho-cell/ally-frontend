"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// Task 1882 (the onboarding vision), on the backend's GET /setup/state and
// PUT /setup/devices/:id/steps/:step (10 Oct, 11:45Z). A step counts once,
// if the server saw it or any of the person's gadgets said done.

export const STEPS = ["install", "notifications", "contacts", "freshness", "connector"] as const;
export type Step = (typeof STEPS)[number];

// #4590 hid „keep contacts fresh" (14 Oct). #1882 / #2047 retest (founder,
// D804, 17 Oct): the plan has five steps, so all five show again, and the
// server counts the same five.
export const SHOWN_STEPS: readonly Step[] = STEPS;

// #4592: the counter is the ticks the person can see, nothing else. A step is
// ticked when the server saw it (for notifications, unless this person said
// the test did not arrive), when one of their gadgets said done, or, for
// install, when this very gadget runs the installed app.
export function stepTicked(state: SetupState, step: Step, installedHere: boolean): boolean {
  const serverSees = state.server[step] === true;
  const mine = state.mine[step];
  return (serverSees && !(step === "notifications" && mine === "failed")) || mine === "done" || (step === "install" && installedHere);
}

export function tickCount(state: SetupState, installedHere: boolean): { done: number; total: number } {
  return { done: SHOWN_STEPS.filter((st) => stepTicked(state, st, installedHere)).length, total: SHOWN_STEPS.length };
}
export type Gadget = "iphone" | "android" | "windows" | "mac" | "other";
export type StepStatus = "done" | "failed" | "later";

export type SetupState = {
  doneCount: number;
  total: number;
  // #4598 (server 0300): more than a week since the person's first
  // conversation, by the server's `started_at`. Worked out when the answer
  // is read, so nothing reads the clock during render. False while the
  // server sends no `started_at` (an older server, or nobody started yet).
  pastFirstWeek: boolean;
  server: Partial<Record<Step, boolean>>;
  mine: Partial<Record<Step, StepStatus>>;
};

function detect(): Gadget {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iphone";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  return "other";
}

const noop = () => () => {};
// Null on the server pass, so both passes render the same HTML.
export function useGadget(): Gadget | null {
  return useSyncExternalStore(noop, detect, () => null);
}

// A random id kept in this browser; it only tells this person's gadgets
// apart (the backend's words). Read only from handlers and effects.
const KEY = "netai_setup_device";
export function setupDeviceId(): string {
  try {
    const have = localStorage.getItem(KEY);
    if (have && /^[A-Za-z0-9_-]{1,64}$/.test(have)) return have;
    const id = `d-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "d-nostorage";
  }
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function parseSetup(raw: unknown, deviceId: string): SetupState | null {
  const d = unwrapData(raw);
  if (!isRecord(d) || typeof d.done_count !== "number" || typeof d.total !== "number") return null;
  const server: SetupState["server"] = {};
  if (isRecord(d.server)) for (const s of STEPS) if (typeof d.server[s] === "boolean") server[s] = d.server[s] as boolean;
  const mine: SetupState["mine"] = {};
  for (const dev of recordItems(pickArray(d.devices))) {
    if (dev.device_id !== deviceId || !isRecord(dev.steps)) continue;
    for (const s of STEPS) {
      const v = dev.steps[s];
      if (v === "done" || v === "failed" || v === "later") mine[s] = v;
    }
  }
  const started = typeof d.started_at === "string" ? Date.parse(d.started_at) : NaN;
  const pastFirstWeek = Number.isFinite(started) && Date.now() - started > WEEK_MS;
  return { doneCount: d.done_count, total: d.total, pastFirstWeek, server, mine };
}

// The state, read once on mount; `null` while unknown or when the server
// cannot say, and then nothing about setup is drawn.
export function useSetupState(): [SetupState | null, (s: SetupState) => void] {
  const [state, setState] = useState<SetupState | null>(null);
  useEffect(() => {
    let alive = true;
    const id = setupDeviceId();
    apiFetch<unknown>("/setup/state")
      .then((raw) => { if (alive) setState(parseSetup(raw, id)); })
      .catch(() => { /* nothing drawn */ });
    return () => { alive = false; };
  }, []);
  return [state, setState];
}
