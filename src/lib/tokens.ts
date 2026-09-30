import { isRecord, unwrapData } from "./payload";

// Row 282 (30 Sept). The badge and the banner said 0 while the account still
// had tokens.
//
// The wallet used to be taken from the response with `json.data as
// TokenBalance` — a cast, which checks nothing. Any field the server spells
// differently from this file arrives as `undefined`, and from there the two
// facts that must never look alike become identical: a number the server did
// not send and a number the server said was zero. `undefined <= 0` is false,
// `Math.max(0, undefined)` is NaN, and whichever way a given call site leaned
// decided what the person was told about their own money.
//
// So the fields are read, not asserted, and a missing one stays null all the
// way to the screen. A screen may then say "we do not know" — it may not say
// "you have none".
export type TokenBalance = {
  enabled: boolean;
  balance: number | null;
  grantedThisPeriod: number | null;
  spentThisPeriod: number | null;
  window?: string;
  resetsAt?: string | null;
};

function num(src: Record<string, unknown>, ...names: string[]): number | null {
  for (const n of names) {
    const v = src[n];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    // Some wallet fields arrive as decimal strings rather than numbers.
    if (typeof v === "string" && v.trim() !== "") {
      const parsed = Number(v);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function str(src: Record<string, unknown>, ...names: string[]): string | null {
  for (const n of names) {
    const v = src[n];
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

// Both spellings are accepted because this client cannot see which one the
// server sends, and the cost of being wrong lands on somebody's balance. If
// the server settles on one, the other simply never matches.
export function parseTokenBalance(raw: unknown): TokenBalance | null {
  const body = unwrapData(raw);
  if (!isRecord(body)) return null;
  if (typeof body.enabled !== "boolean") return null;
  return {
    enabled: body.enabled,
    balance: num(body, "balance", "tokens", "remaining", "tokens_remaining"),
    grantedThisPeriod: num(body, "grantedThisPeriod", "granted_this_period", "granted"),
    spentThisPeriod: num(body, "spentThisPeriod", "spent_this_period", "spent"),
    window: str(body, "window") ?? undefined,
    resetsAt: str(body, "resetsAt", "resets_at"),
  };
}
