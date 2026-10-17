"use client";

import { useSyncExternalStore } from "react";

// #5417 (Giorgi, 17 Oct): the „working" tile and the „waiting" tile each have
// two clips, and each visit or refresh shows one of them at random. The pick
// is made once per page load and kept, so the figure does not change while
// the person looks at it. The server has no pick (null), so nothing is drawn
// until the page runs.
const WORKING = ["ally-working-1", "ally-working-2"] as const;
const WAITING = ["ally-waiting-1", "ally-waiting-2"] as const;
let workingPick: string | null = null;
let waitingPick: string | null = null;

const any = (list: readonly string[]) => list[Math.floor(Math.random() * list.length)];

function chooseWorking(): string {
  if (workingPick === null) workingPick = any(WORKING);
  return workingPick;
}

function chooseWaiting(): string {
  if (waitingPick === null) waitingPick = any(WAITING);
  return waitingPick;
}

const noSubscribe = () => () => {};

export function useWorkingClip(): string | null {
  return useSyncExternalStore(noSubscribe, chooseWorking, () => null);
}

export function useWaitingClip(): string | null {
  return useSyncExternalStore(noSubscribe, chooseWaiting, () => null);
}
