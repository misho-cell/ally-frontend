// #508 (3 Oct, Ninia reading the profile cold). The profile carried two boxes
// headed „შეტყობინებების დიაგნოსტიკა" and „მიკროფონის დიაგნოსტიკა". They
// exist for a real reason (row 6: an iPhone has no console, so a tester
// reporting a push problem has no other way to read the three values that
// separate a permission fault from a delivery one), and to everybody else
// they are two boxes of words that mean nothing on their own settings page.
//
// Deleting them would take the only instrument the testers have. So they are
// kept and hidden: off for everyone, on for whoever is told how to turn them
// on. /profile?diag=1 switches them on and remembers it; /profile?diag=0
// switches them off again. No account flag is involved, because the server
// has no notion of a tester and inventing one here would be a guess about a
// person rather than about this browser.
//
// It is exposed as an external store rather than as a piece of page state
// because that is what it is: a value the server cannot know, read from this
// browser. The server snapshot is false, so the markup React sends and the
// markup it first renders here agree, and the switch arrives on the next
// render instead of as a hydration mismatch.
const KEY = "netai_diagnostics";

let on = false;
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    // Private windows and blocked site data throw on read. Diagnostics stay
    // off there, which is the right answer for an ordinary visitor.
    return false;
  }
}

// Called once from the page, inside an effect: it writes, so it is never a
// snapshot function. `?diag=1` switches the boxes on for this browser and
// remembers it; `?diag=0` switches them off; no parameter leaves the
// remembered answer alone.
export function applyDiagnosticsFromLocation(search: string): void {
  const asked = new URLSearchParams(search).get("diag");
  if (asked === "1" || asked === "0") {
    try {
      if (asked === "1") window.localStorage.setItem(KEY, "1");
      else window.localStorage.removeItem(KEY);
    } catch {
      // The switch still applies to this visit even when nothing is stored.
    }
  }
  const next = asked === "1" || asked === "0" ? asked === "1" : read();
  if (next === on) return;
  on = next;
  for (const fn of listeners) fn();
}

export function subscribeDiagnostics(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function diagnosticsSnapshot(): boolean {
  return on;
}

export function diagnosticsServerSnapshot(): boolean {
  return false;
}
