"use client";

import { useSyncExternalStore } from "react";

// M7 (27 Oct). Chromium fires beforeinstallprompt once, early, and only a
// listener that is already there can keep it. Two places offer the install
// now (the global banner and the home card), so the event is held here,
// registered as soon as this module loads, and either can use it.
//
// The same store says whether the home card is on screen, so the banner
// stands down while it is: one ask at a time, not two cards for one step.

let deferred: BeforeInstallPromptEvent | null = null;
let homeCardShowing = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    emit();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export function useInstallEvent(): BeforeInstallPromptEvent | null {
  return useSyncExternalStore(subscribe, () => deferred, () => null);
}

export function useHomeCardShowing(): boolean {
  return useSyncExternalStore(subscribe, () => homeCardShowing, () => false);
}

export function setHomeCardShowing(v: boolean): void {
  if (homeCardShowing === v) return;
  homeCardShowing = v;
  emit();
}

/** Shows the browser's own install prompt. True when the person accepted. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  emit();
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === "accepted";
}
