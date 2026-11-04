// #8385 (4 Nov). The case header "jumps" when the iPhone keyboard opens or
// closes, and nothing in a desktop browser reproduces it: the keyboard, and
// the way Safari pans the visual viewport for it, exist only on the phone.
// Two fixes have been reasoned about and neither has been observed.
//
// So the phone measures it. While diagnostics are on for this browser
// (/profile?diag=1), every keyboard open or close in a case chat records,
// frame by frame for about a second, where the header actually was and what
// the visual viewport said. The last such trace is kept here and shown on the
// diagnostics card, in a form a tester can screenshot. "The header moved by
// 0 px" and "the header moved by 38 px" are then facts, not impressions.

const KEY = "nx-kb-trace";
const MAX_SAMPLES = 120;

export type KbSample = {
  t: number;          // ms since the trace started
  h: number;          // visualViewport.height
  o: number;          // visualViewport.offsetTop
  sy: number;         // window.scrollY
  hd: number | null;  // header's top on screen, null if there was none
};

export type KbTrace = { at: number; standalone: boolean; samples: KbSample[] };

export function saveKeyboardTrace(samples: KbSample[]): void {
  if (samples.length === 0) return;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const trace: KbTrace = { at: Date.now(), standalone, samples: samples.slice(0, MAX_SAMPLES) };
  try { localStorage.setItem(KEY, JSON.stringify(trace)); } catch { /* storage refused */ }
}

export function lastKeyboardTrace(): KbTrace | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as KbTrace;
    return Array.isArray(v?.samples) ? v : null;
  } catch {
    return null;
  }
}

export const KB_TRACE_MAX = MAX_SAMPLES;

// What the card shows. The header's travel is measured from where it stood in
// the first frame, so a header that slides away and comes back still counts
// as moved, which is exactly what "it jumps" means.
export function summariseTrace(tr: KbTrace): {
  frames: number; headerTravel: number | null; maxOffset: number; heightFrom: number; heightTo: number;
} {
  const s = tr.samples;
  const first = s.find((x) => x.hd !== null)?.hd ?? null;
  let travel: number | null = first === null ? null : 0;
  let maxOffset = 0;
  for (const x of s) {
    if (first !== null && x.hd !== null) travel = Math.max(travel ?? 0, Math.abs(x.hd - first));
    maxOffset = Math.max(maxOffset, Math.abs(x.o), Math.abs(x.sy));
  }
  return {
    frames: s.length,
    headerTravel: travel === null ? null : Math.round(travel),
    maxOffset: Math.round(maxOffset),
    heightFrom: Math.round(s[0]?.h ?? 0),
    heightTo: Math.round(s[s.length - 1]?.h ?? 0),
  };
}
