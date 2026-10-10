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
  // 10 Oct (4294): the newest credit, or null for someone never credited.
  // Absent on an older server, which reads the same as null here.
  lastTopUp?: { amount: number; at: string } | null;
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

// 30 Sept. The backend sent the actual contract, so the guessing stops:
// GET /billing/tokens → { success, data: { enabled, balance, grantedThisPeriod,
// spentThisPeriod, window, resetsAt } }, camelCase throughout, no snake_case
// anywhere. The alternative spellings this function used to accept are gone.
// A reader that tolerates names the server does not send cannot tell a
// contract change from a normal response: it would quietly read null forever.
// Reading only the documented names means a change shows up as a badge that
// disappears, which somebody notices.
//
// Note `balance` is SUM(token_transactions.amount) and CAN BE NEGATIVE — an
// account can overspend inside a run. Negative is not a display value; every
// caller clamps at zero, because "you have -40" is not a thing anyone is owed
// an answer about. It is still distinct from null: a negative balance is the
// server telling us there is nothing left, and null is the server not telling
// us anything.
export function parseTokenBalance(raw: unknown): TokenBalance | null {
  const body = unwrapData(raw);
  if (!isRecord(body)) return null;
  if (typeof body.enabled !== "boolean") return null;
  return {
    enabled: body.enabled,
    balance: num(body, "balance"),
    grantedThisPeriod: num(body, "grantedThisPeriod"),
    spentThisPeriod: num(body, "spentThisPeriod"),
    window: str(body, "window") ?? undefined,
    resetsAt: str(body, "resetsAt"),
    lastTopUp: isRecord(body.lastTopUp) && typeof body.lastTopUp.amount === "number" && typeof body.lastTopUp.at === "string"
      ? { amount: body.lastTopUp.amount, at: body.lastTopUp.at }
      : null,
  };
}
