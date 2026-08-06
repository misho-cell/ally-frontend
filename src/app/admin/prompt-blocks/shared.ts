// ბექის კონტრაქტის საერთო ტიპები/ჰელპერები — page-ფაილებიდან ექსპორტი
// Next-ში დაუშვებელია, ამიტომ ცალკე მოდულია.

export type PromptBlock = {
  name: string;
  content: string;
  modes: string[];
  sort_order: number;
  enabled: boolean;
  enabled_for_user_ids: number[];
  updated_at: string;
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
