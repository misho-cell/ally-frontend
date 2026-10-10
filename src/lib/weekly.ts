import { isRecord, recordItems } from "@/lib/payload";

// Shared by /updates (the due card) and /updates/weekly (the past ones).

// Row 230 (23 Sept, D462). The weekly summary used to be written into every
// open goal's thread: on 21 September Lika had 36 open goals and the same
// 9,607-character text went into 32 of them in nine seconds. She still did not
// find it — she found it by opening chats one at a time. The founder's whole
// criterion for this card was therefore "cannot be missed", and he chose a
// card of its own at the top rather than a row in the list.
export type WeeklyGoal = {
  task_id?: number | string | null;
  title?: string | null;
  asks_sent?: number | null;
  asks_answered?: number | null;
  pending_question?: string | null;
};

export const WEEKLY_KIND = "weekly_summary";

// 28 Sept. The weekly payload carries the same week in two shapes: `goals`,
// the structured list, and `text`, a composed paragraph. The card drew BOTH,
// which is how a tester met twenty-four goals listed twice across eight
// screens. That was not a rendering mistake — the server sent both and never
// said which was the screen's.
//
// `card_source` says. It names the authoritative representation, and it is
// read rather than assumed: if it ever says something this build does not
// know, nothing is drawn from the payload body and the heading and the line
// still stand on their own. Guessing wrong here is what produced the wall.
export function cardSource(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const v = payload.card_source;
  return typeof v === "string" && v ? v : null;
}

// One name, pinned on the server with a test. This used to read three
// spellings because the shape was described loosely and "whatever you have
// will work" felt helpful — which is exactly how two names for one thing
// become permanent, as they did for the request ref that blocked the
// tester's seat for a week.
export function weeklyGoals(payload: unknown): WeeklyGoal[] {
  if (!isRecord(payload)) return [];
  const v = payload.goals;
  return Array.isArray(v) ? (recordItems(v) as WeeklyGoal[]) : [];
}

export function weekStart(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const v = payload.week_start;
  return typeof v === "string" && v ? v : null;
}
