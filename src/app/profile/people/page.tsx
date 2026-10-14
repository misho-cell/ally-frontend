"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import DzIcon from "@/components/DzIcons";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// „ადამიანების პარამეტრები" (design phone 37; backend 0301, Misho's list,
// 14 Oct). Everything the owner has put between Netai and people: who is
// kept out of which goal, the topics they asked not to be asked about, and
// the blocked list (its own page). Each can be undone here, by the id the
// server gave. A list that failed to load says so; it never shows as empty.

const L = {
  en: {
    title: "People settings",
    back: "Profile",
    exclusions: "My exceptions",
    noExclusions: "No exceptions.",
    boundaries: "Topic boundary",
    noBoundaries: "No topic limits set.",
    blocked: "Blocked",
    lift: "Remove",
    failed: "Could not load",
    saveFailed: "Could not save. Try again.",
  },
  ka: {
    title: "ადამიანების პარამეტრები",
    back: "პროფილი",
    exclusions: "ჩემი გამონაკლისები",
    noExclusions: "გამონაკლისები არ გაქვს.",
    boundaries: "თემის საზღვარი",
    noBoundaries: "თემის შეზღუდვა არ გაქვს.",
    blocked: "დაბლოკილები",
    lift: "მოხსნა",
    failed: "ვერ ჩაიტვირთა",
    saveFailed: "ვერ შეინახა. სცადე თავიდან.",
  },
};

type Exclusion = { id: string; contactId: string; name: string | null; text: string };
type Boundary = { id: string; topic: string; terms: string[] };
type Settings = { exclusions: Exclusion[]; boundaries: Boundary[] };

const idOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);

function parse(raw: unknown): Settings | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  return {
    exclusions: recordItems(pickArray(d.exclusions)).flatMap((e) => {
      const id = idOf(e.id);
      const contactId = idOf(e.contact_id);
      if (!id || !contactId) return [];
      return [{ id, contactId, name: typeof e.name === "string" && e.name.trim() ? e.name : null, text: typeof e.excluded_for === "string" ? e.excluded_for : "" }];
    }),
    boundaries: recordItems(pickArray(d.boundaries)).flatMap((b) => {
      const id = idOf(b.id);
      if (!id || typeof b.topic !== "string" || !b.topic.trim()) return [];
      return [{ id, topic: b.topic, terms: pickArray(b.terms).filter((t): t is string => typeof t === "string" && t.trim() !== "") }];
    }),
  };
}

export default function PeopleSettingsPage() {
  const s = L[getLocale()];
  const [data, setData] = useState<Settings | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/profile/people-settings")
      .then((raw) => { if (alive) setData(parse(raw)); })
      .catch(() => { if (alive) setData(null); });
    return () => { alive = false; };
  }, []);

  async function remove(key: string, path: string, drop: (d: Settings) => Settings) {
    setBusy(key);
    setErr(false);
    try {
      await apiFetch(path, { method: "DELETE" });
      setData((prev) => (prev ? drop(prev) : prev));
    } catch {
      setErr(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back}>
      {data === undefined && <span className="sk-bar" style={{ width: "70%" }} />}
      {data === null && <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.failed}</p>}
      {err && <p role="status" className="nx-note" style={{ color: "var(--danger)" }}>{s.saveFailed}</p>}
      {data && (
        <>
          <div className="nx-card">
            <h3>{s.exclusions}</h3>
            {data.exclusions.length === 0 ? <p className="nx-note">{s.noExclusions}</p> : data.exclusions.map((e) => (
              <div key={e.id} className="nx-row between" style={{ marginTop: 0, flexWrap: "nowrap" }}>
                <div className="min-w-0">
                  <Link href={`/profile/contacts/${encodeURIComponent(e.contactId)}`} className="nx-contact-name">{e.name ?? "…"}</Link>
                  {e.text && <p className="nx-note" style={{ margin: 0 }}>{e.text}</p>}
                </div>
                <div className="nx-links shrink-0">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => remove(`e${e.id}`, `/contacts/${encodeURIComponent(e.contactId)}/exclusions/${encodeURIComponent(e.id)}`, (d) => ({ ...d, exclusions: d.exclusions.filter((x) => x.id !== e.id) }))}
                  >
                    {s.lift}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="nx-card">
            <h3>{s.boundaries}</h3>
            {data.boundaries.length === 0 ? <p className="nx-note">{s.noBoundaries}</p> : data.boundaries.map((b) => (
              <div key={b.id} className="nx-row between" style={{ marginTop: 0, flexWrap: "nowrap" }}>
                <div className="min-w-0">
                  <p style={{ margin: 0 }}>{b.topic}</p>
                  {b.terms.length > 0 && <p className="nx-note" style={{ margin: 0 }}>{b.terms.join(", ")}</p>}
                </div>
                <div className="nx-links shrink-0">
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => remove(`b${b.id}`, `/profile/boundaries/${encodeURIComponent(b.id)}`, (d) => ({ ...d, boundaries: d.boundaries.filter((x) => x.id !== b.id) }))}
                  >
                    {s.lift}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <nav className="pd-nav">
        <Link href="/profile/blocked">{s.blocked}<DzIcon name="right" size={16} /></Link>
      </nav>
    </SheetPage>
  );
}
