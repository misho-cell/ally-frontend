"use client";

import { useEffect, useState } from "react";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateShort } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 4126 item 5 (backend, 10 Oct; Misho's yes 9 Oct): every fact kept about
// the person's own number, and a way to remove each for good. The server
// never says who saved a fact, and nothing here may suggest it: the origin
// is drawn as a kind of source, never as a person.
//
// The fixed texts below are drafts until Giorgi (G-045) and Misho approve
// them; the page is not linked from the profile until then.

const L = {
  en: {
    title: "Facts kept about me",
    back: "Profile",
    intro: "What Netai knows about you: found on public pages, or told by people who keep your number. Remove any of them and it stops showing anywhere.",
    empty: "Nothing is kept about you yet.",
    failed: "Could not load",
    remove: "Remove",
    removing: "Removing…",
    removeFailed: "Could not remove it. Try again.",
    source: "Source",
    origin: { research: "From a public page", label: "From how your number is saved", saved_by_someone: "From a contact" },
    status: { confirmed: "Confirmed", possible: "Possible", rough: "Approximate" },
    field: { occupation: "Occupation", employer: "Workplace", city: "City", industry: "Field", note: "Note" },
  },
  ka: {
    title: "ჩემზე შენახული ფაქტები",
    back: "პროფილი",
    intro: "რაც Netai-მ შენზე იცის: საჯარო გვერდებზე ნაპოვნი, ან რაც შენი ნომრის შემნახველებმა უთხრეს. ნებისმიერი წაშალე და ის აღარსად გამოჩნდება.",
    empty: "შენზე ჯერ არაფერია შენახული.",
    failed: "ვერ ჩაიტვირთა",
    remove: "წაშლა",
    removing: "იშლება…",
    removeFailed: "ვერ წაიშალა. სცადე თავიდან.",
    source: "წყარო",
    origin: { research: "საჯარო გვერდიდან", label: "ნომრის შენახული სახელიდან", saved_by_someone: "კონტაქტისგან" },
    status: { confirmed: "დადასტურებული", possible: "შესაძლოა", rough: "დაახლოებით" },
    field: { occupation: "პროფესია", employer: "სამსახური", city: "ქალაქი", industry: "სფერო", note: "შენიშვნა" },
  },
};

type Origin = "research" | "label" | "saved_by_someone";
type Status = "confirmed" | "possible" | "rough";
type Field = "occupation" | "employer" | "city" | "industry" | "note";
type Fact = { id: string; field: Field | null; value: string; origin: Origin | null; sourceUrl: string | null; date: string | null; status: Status | null };

const ORIGINS: readonly Origin[] = ["research", "label", "saved_by_someone"];
// "unknown" is drawn as no word at all, the same as a fact with no status.
const STATUSES: readonly Status[] = ["confirmed", "possible", "rough"];
const FIELDS: readonly Field[] = ["occupation", "employer", "city", "industry", "note"];
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

function safeUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch {
    return null;
  }
}

function parse(raw: unknown): Fact[] | null {
  const d = unwrapData(raw);
  if (!isRecord(d) || !Array.isArray(d.facts)) return null;
  return recordItems(pickArray(d.facts)).flatMap((r) => {
    const id = typeof r.id === "number" ? String(r.id) : str(r.id);
    const value = str(r.value);
    if (!id || !value) return [];
    return [{
      id,
      // A kind we do not know is drawn without a label rather than as its key.
      field: FIELDS.includes(r.field as Field) ? (r.field as Field) : null,
      value,
      origin: ORIGINS.includes(r.origin as Origin) ? (r.origin as Origin) : null,
      sourceUrl: safeUrl(r.source_url),
      date: str(r.date),
      status: STATUSES.includes(r.status as Status) ? (r.status as Status) : null,
    }];
  });
}

export default function FactsAboutMePage() {
  const s = L[getLocale()];
  const [list, setList] = useState<Fact[] | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/privacy/facts-about-me")
      .then((raw) => { if (alive) setList(parse(raw)); })
      .catch(() => { if (alive) setList(null); });
    return () => { alive = false; };
  }, []);

  async function remove(id: string) {
    if (busy) return;
    setBusy(id);
    setFailedId(null);
    try {
      await apiFetch(`/privacy/facts-about-me/${encodeURIComponent(id)}`, { method: "DELETE" });
      setList((prev) => prev?.filter((f) => f.id !== id) ?? prev);
    } catch (e) {
      // 404: the fact is not there any more, which is what was asked for.
      if (e instanceof ApiError && e.status === 404) {
        setList((prev) => prev?.filter((f) => f.id !== id) ?? prev);
      } else {
        setFailedId(id);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back}>
      <p className="nx-intro">{s.intro}</p>
      {list === undefined && <span className="sk-bar" style={{ width: "70%" }} />}
      {list === null && <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.failed}</p>}
      {list && list.length === 0 && <p className="nx-empty">{s.empty}</p>}
      {list && list.map((f) => {
        const meta = [
          f.origin ? s.origin[f.origin] : null,
          f.status ? s.status[f.status] : null,
          f.date ? fmtDateShort(f.date) : null,
        ].filter(Boolean).join(" · ");
        return (
          <div key={f.id} className="nx-card">
            {f.field && <span className="nx-note">{s.field[f.field]}</span>}
            <div className="nx-row between" style={{ marginTop: 2, flexWrap: "nowrap", alignItems: "flex-start" }}>
              <b style={{ font: "600 15px/1.4 var(--font-system)", color: "var(--nx-ink)", minWidth: 0, overflowWrap: "anywhere" }}>{f.value}</b>
              <button
                type="button"
                className="nx-btn danger shrink-0"
                disabled={busy !== null}
                onClick={() => void remove(f.id)}
              >
                {busy === f.id ? s.removing : s.remove}
              </button>
            </div>
            {(meta || f.sourceUrl) && (
              <p className="nx-note" style={{ margin: "4px 0 0" }}>
                {meta}
                {f.sourceUrl && (
                  <>
                    {meta ? " · " : ""}
                    <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="nx-link">{s.source}</a>
                  </>
                )}
              </p>
            )}
            {failedId === f.id && <p className="nx-note" style={{ margin: "4px 0 0", color: "var(--danger)" }}>{s.removeFailed}</p>}
          </div>
        );
      })}
    </SheetPage>
  );
}
