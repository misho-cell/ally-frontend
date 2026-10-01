// ბექის კონტრაქტის საერთო ტიპები/ჰელპერები — page-ფაილებიდან ექსპორტი
// Next-ში დაუშვებელია, ამიტომ ცალკე მოდულია.

// Row 290 (1 Oct). GPT writes the final Georgian text and had no prompt of
// its own. Every block now belongs to one model, each model keeps its own
// budget per mode, and the console edits them the same way.
//
// Every block that existed before this is Claude's, so an ABSENT model means
// claude. That is a real default and not a guess: the backend set every
// existing row to "claude" in the same deploy. Anything unrecognised is also
// read as claude, because the alternative is a block that belongs to no model
// and so appears on no screen — silently unreachable is worse than filed
// under the wrong heading, where somebody can see it and move it.
export type PromptModel = "claude" | "gpt";

export function asModel(v: unknown): PromptModel {
  return v === "gpt" ? "gpt" : "claude";
}

export const MODEL_LABELS: Record<PromptModel, string> = {
  claude: "Claude",
  gpt: "GPT",
};

export type PromptBlock = {
  name: string;
  content: string;
  modes: string[];
  sort_order: number;
  enabled: boolean;
  enabled_for_user_ids: number[];
  updated_at: string;
  model?: string;
};

// პასუხი შეიძლება მოვიდეს {success,data} კონვერტით ან შიშველი ობიექტით.
export function unwrap<T>(res: unknown): T {
  const r = res as { data?: T };
  return r && typeof r === "object" && r !== null && "data" in r ? (r.data as T) : (res as T);
}

export function fmtN(n: number): string {
  return Number(n).toLocaleString("en-US");
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
