"use client";

import { useSyncExternalStore } from "react";

// #5417 (Giorgi, 17 Oct): the „working" tile has two clips, and each visit
// or refresh shows one of them at random. The pick is made once per page
// load and kept, so the figure does not change while the person looks at
// it. The server has no pick (null), so nothing is drawn until the page runs.
const WORKING = ["ally-working-1", "ally-working-2"] as const;
let pick: string | null = null;

function choose(): string {
  if (pick === null) pick = WORKING[Math.floor(Math.random() * WORKING.length)];
  return pick;
}

const noSubscribe = () => () => {};

export function useWorkingClip(): string | null {
  return useSyncExternalStore(noSubscribe, choose, () => null);
}
