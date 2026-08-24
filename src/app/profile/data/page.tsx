"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";

// Data rights (C2): show what we store (GET /privacy/my-data/summary), export
// everything (GET /privacy/my-data/export, 22 Aug #6), re-import contacts
// (23 Aug #3, task 53) and the two-step account deletion.
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    back: "← Profile",
    title: "My data",
    intro: "Here is what Netai stores about you. You can download everything or request full deletion below.",
    summaryTitle: "What we store",
    empty: "Nothing to show yet",
    exportBtn: "Download my data",
    exportError: "Export failed. Try again.",
    contactsTitle: "Contacts",
    contactsBody: "Add or refresh your imported contacts at any time. Your device will ask for permission again.",
    contactsBtn: "Add / update contacts",
    deleteTitle: "Delete my account",
    deleteBody: "This permanently removes your account and data. First you'll see a preview of what gets deleted and what we must retain (for example payment history required by law).",
    deleteBtn: "Delete my account",
    previewTitle: "Deletion preview",
    previewNote: "Nothing has been deleted yet. Review the lists below.",
    finalBtn: "Delete permanently",
    finalConfirm: "This cannot be undone. Delete your account permanently?",
    cancel: "Cancel",
    genericError: "Something went wrong",
  },
  ka: {
    back: "← პროფილი",
    title: "ჩემი მონაცემები",
    intro: "აქ ხედავ, რას ინახავს Netai შენზე. შეგიძლია ყველაფრის გადმოწერა ან სრული წაშლა.",
    summaryTitle: "რას ვინახავთ",
    empty: "ჯერ არაფერია საჩვენებელი",
    exportBtn: "მონაცემების გადმოწერა",
    exportError: "გადმოწერა ვერ მოხერხდა. სცადე თავიდან.",
    contactsTitle: "კონტაქტები",
    contactsBody: "დაამატე ან გაანახლე შენი კონტაქტები ნებისმიერ დროს. მოწყობილობა ნებართვას თავიდან გკითხავს.",
    contactsBtn: "კონტაქტების დამატება/განახლება",
    deleteTitle: "ანგარიშის წაშლა",
    deleteBody: "ეს სამუდამოდ შლის შენს ანგარიშს და მონაცემებს. ჯერ ნახავ, რა წაიშლება და რა დარჩება (მაგალითად გადახდის ისტორია, რომელსაც კანონი ითხოვს).",
    deleteBtn: "ანგარიშის წაშლა",
    previewTitle: "წაშლის გადახედვა",
    previewNote: "ჯერ არაფერი წაშლილა. გადახედე სიებს ქვემოთ.",
    finalBtn: "წაშალე სამუდამოდ",
    finalConfirm: "ამის დაბრუნება შეუძლებელია. წავშალო ანგარიში სამუდამოდ?",
    cancel: "გაუქმება",
    genericError: "რაღაც შეცდომა მოხდა",
  },
};

type Dict = Record<string, unknown>;

// Human labels for the erasure-summary table keys (ticket 6 #15) — the raw
// backend table names must never reach the user. Kept as a fallback for when
// the backend sends only the legacy `records`/bare object shape; the current
// contract's `labels` map (Part H #4) is preferred whenever present.
const TABLE_LABELS: Record<string, { ka: string; en: string }> = {
  conversations: { ka: "საუბრის შეტყობინებები", en: "Conversation messages" },
  threads: { ka: "საუბრები", en: "Conversations" },
  tasks: { ka: "მიზნები", en: "Goals" },
  task_asks: { ka: "გაგზავნილი კითხვები", en: "Sent questions" },
  user_notes: { ka: "შენი ჩანაწერები", en: "Your notes" },
  user_private_context: { ka: "პირადი კონტექსტი", en: "Private context" },
  user_profile_kv: { ka: "პროფილის ველები", en: "Profile fields" },
  contact_insights: { ka: "კონტაქტების შენიშნები", en: "Contact notes" },
  contact_facts: { ka: "კონტაქტების ფაქტები", en: "Contact facts" },
  contact_exclusions: { ka: "გამონაკლისები", en: "Exclusions" },
  contact_relationship_scores: { ka: "კავშირის ქულები", en: "Relationship scores" },
  contact_enrichment: { ka: "გამდიდრებული პროფილები", en: "Enriched profiles" },
  weak_tie_signals: { ka: "კავშირის სიგნალები", en: "Connection signals" },
  search_activity: { ka: "ძებნის ისტორია", en: "Search history" },
  run_prompt_stamps: { ka: "სისტემური აღრიცხვა", en: "System accounting" },
  pending_updates: { ka: "მოლოდინში მყოფი განახლებები", en: "Pending updates" },
  user_avatars: { ka: "პროფილის ფოტო", en: "Profile photo" },
  ai_notification_log: { ka: "შეტყობინებების ჟურნალი", en: "Notification log" },
  ai_notification_settings: { ka: "შეტყობინებების პარამეტრები", en: "Notification settings" },
  push_subscriptions: { ka: "შეტყობინებების გამოწერები", en: "Push subscriptions" },
  device_fingerprints: { ka: "მოწყობილობები", en: "Devices" },
  oauth_tokens: { ka: "დაკავშირებული სერვისები", en: "Connected services" },
  product_events: { ka: "გამოყენების სტატისტიკა", en: "Usage statistics" },
  introduction_requests: { ka: "გაცნობის მოთხოვნები", en: "Intro requests" },
  UserAlias: { ka: "შენახული კონტაქტები", en: "Saved contacts" },
  UserTags: { ka: "კონტაქტების თეგები", en: "Contact tags" },
  UserBlock: { ka: "დაბლოკილი ნომრები", en: "Blocked numbers" },
  ContactDeceased: { ka: "გარდაცვლილად მონიშნული კონტაქტები", en: "Contacts marked deceased" },
  UserPhone: { ka: "შენი ნომერი", en: "Your number" },
};

function labelFor(key: string): string {
  const hit = TABLE_LABELS[key];
  if (hit) return getLocale() === "ka" ? hit.ka : hit.en;
  // Unknown key — prettify snake_case and CamelCase into words.
  return key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

// Render any summary/preview value the backend sends without assuming its
// exact shape: counts get a human unit (task 22 i), arrays render as lists,
// objects as nested rows.
function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span style={{ color: "var(--meta)" }}>-</span>;
  if (typeof v === "number") {
    const unit = getLocale() === "ka" ? "ჩანაწერი" : v === 1 ? "record" : "records";
    return <span>{v.toLocaleString("en-US")} {unit}</span>;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return <span style={{ color: "var(--meta)" }}>0</span>;
    return (
      <ul className="flex flex-col gap-0.5">
        {v.map((item, i) => (
          <li key={i}>{typeof item === "object" ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof v === "object") return <Rows obj={v as Dict} nested />;
  if (typeof v === "boolean") return <span>{v ? "✓" : "-"}</span>;
  return <span>{String(v)}</span>;
}

// labelMap: Part H #4 — the backend's own `labels` map (table key → human
// name) wins over the client-side dictionary whenever present, so a label we
// don't recognise (or haven't translated) still never falls back to a raw
// key. deletion-preview objects have no labels map, so they use labelFor().
function Rows({ obj, nested, labelMap }: { obj: Dict; nested?: boolean; labelMap?: Record<string, string> }) {
  const entries = Object.entries(obj);
  if (entries.length === 0) return <span style={{ color: "var(--meta)" }}>-</span>;
  return (
    <div className="flex flex-col" style={{ gap: nested ? 2 : 0 }}>
      {entries.map(([k, v]) => (
        <div
          key={k}
          className="flex items-start justify-between gap-4"
          style={nested ? { fontSize: "12.5px" } : { padding: "9px 0", borderBottom: "1px solid var(--skeleton)" }}
        >
          <span style={{ fontSize: "12.5px", color: "var(--ink-soft)", flex: "0 0 auto" }}>
            {labelMap?.[k] ?? labelFor(k)}
          </span>
          <span className="text-right" style={{ fontSize: "13px", color: "var(--ink)", overflowWrap: "anywhere" }}>
            <Value v={v} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DataRightsPage() {
  const s = L[getLocale()];
  const [summary, setSummary] = useState<Dict | null>(null);
  const [summaryLabels, setSummaryLabels] = useState<Record<string, string> | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    apiFetch<{ success?: boolean; data?: Dict } & Dict>("/privacy/my-data/summary")
      .then((res) => {
        const body = (res.data ?? res) as Dict;
        // Part H #4: the contract now sends `counts` (the data, same shape as
        // the legacy `records`) plus `labels` (table key → Georgian name).
        // Prefer that pair so a raw table key never reaches the screen; fall
        // back to the legacy bare-object shape (`records`, or the object
        // itself) for older backends.
        const counts = body.counts as Dict | undefined;
        const labels = body.labels as Record<string, string> | undefined;
        if (counts && typeof counts === "object") {
          setSummary(counts);
          setSummaryLabels(labels);
        } else if (body.records && typeof body.records === "object") {
          setSummary(body.records as Dict);
        } else {
          setSummary(body);
        }
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : s.genericError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 22 Aug #6: full data export — saved as a local JSON file.
  async function exportData() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      const res = await apiFetch<{ success?: boolean; data?: unknown } & Dict>("/privacy/my-data/export");
      const payload = (res as Dict).data ?? res;
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "netai-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.exportError);
    } finally {
      setExporting(false);
    }
  }

  // Step 1: dry-run preview. Nothing is deleted; the server returns what would
  // be removed and what it must retain.
  async function previewDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ success?: boolean; data?: Dict } & Dict>("/privacy/my-data/delete", {
        method: "POST",
        body: { confirm: "DELETE MY ACCOUNT", dry_run: true },
      });
      setPreview((res.data ?? res) as Dict);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.genericError);
    } finally {
      setBusy(false);
    }
  }

  // Step 2: the real deletion (same call without dry_run), then full logout.
  async function confirmDelete() {
    if (!window.confirm(s.finalConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/privacy/my-data/delete", {
        method: "POST",
        body: { confirm: "DELETE MY ACCOUNT" },
      });
      localStorage.removeItem("token");
      localStorage.removeItem("netai_profile_name");
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.genericError);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/profile" className="transition-colors" style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}>
            {s.back}
          </Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</span>
        </div>

        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.intro}</p>

        {error && (
          <div className="px-4 py-3 text-sm" style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}>
            {error}
          </div>
        )}

        {loading ? (
          // Full loading state (ticket 6 #15) — the page never stands empty.
          <div className="flex flex-col gap-3">
            <span className="sk-bar" style={{ width: "100%", height: 220, borderRadius: "var(--radius-card)" }} />
            <span className="sk-bar" style={{ width: "100%", height: 120, borderRadius: "var(--radius-card)" }} />
          </div>
        ) : (
          <>
            {/* Stored data summary */}
            <div className="card flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3">
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.summaryTitle}</h2>
                <button
                  type="button"
                  onClick={exportData}
                  disabled={exporting}
                  className="btn-secondary shrink-0 disabled:opacity-60"
                  style={{ padding: "8px 16px", fontSize: "12px" }}
                >
                  {exporting ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--cta-border)", borderTopColor: "var(--accent-strong)" }} />
                  ) : (
                    s.exportBtn
                  )}
                </button>
              </div>
              {summary && Object.keys(summary).length > 0 ? (
                <Rows obj={summary} labelMap={summaryLabels} />
              ) : (
                <p className="text-sm" style={{ color: "var(--meta)" }}>{s.empty}</p>
              )}
            </div>

            {/* Contacts re-import (23 Aug #3, task 53) — the same flow as
                onboarding; the OS asks for permission again. */}
            <div className="card flex flex-col gap-3">
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.contactsTitle}</h2>
              <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>{s.contactsBody}</p>
              <Link href="/onboarding/contacts" className="btn-primary self-start">
                {s.contactsBtn}
              </Link>
            </div>

            {/* Account deletion */}
            <div className="card flex flex-col gap-3">
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--danger)" }}>{s.deleteTitle}</h2>
              <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>{s.deleteBody}</p>

              {!preview ? (
                <button type="button" onClick={previewDelete} disabled={busy} className="btn-destructive self-start disabled:opacity-60">
                  {s.deleteBtn}
                </button>
              ) : (
                <div className="flex flex-col gap-3">
                  <div style={{ background: "var(--terra-tint)", borderRadius: "var(--radius-tile)", padding: "12px 14px" }}>
                    <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--danger)" }}>{s.previewTitle}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--ink-2)" }}>{s.previewNote}</p>
                  </div>
                  <Rows obj={preview} />
                  <div className="flex gap-2">
                    <button type="button" onClick={confirmDelete} disabled={busy} className="btn-destructive disabled:opacity-60">
                      {s.finalBtn}
                    </button>
                    <button type="button" onClick={() => setPreview(null)} disabled={busy} className="btn-secondary">
                      {s.cancel}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
