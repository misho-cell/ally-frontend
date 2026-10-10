"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// Task 1882 (the onboarding vision), on the backend's GET /setup/state and
// PUT /setup/devices/:id/steps/:step (10 Oct, 11:45Z). Five steps; a step
// counts once, if the server saw it or any of the person's gadgets said
// done. `done_count` is the server's, so "N of 5" is never computed here.

export const STEPS = ["install", "notifications", "contacts", "freshness", "connector"] as const;
export type Step = (typeof STEPS)[number];
export type Gadget = "iphone" | "android" | "windows" | "mac" | "other";
export type StepStatus = "done" | "failed" | "later";

export type SetupState = {
  doneCount: number;
  total: number;
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
  return { doneCount: d.done_count, total: d.total, server, mine };
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
