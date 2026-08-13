"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";

// Data rights (C2): show what we store (GET /privacy/my-data/summary) and the
// two-step account deletion (dry_run preview → final delete → logout).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    back: "← Profile",
    title: "My data",
    intro: "Here is what Netai stores about you. You can request full deletion below.",
    summaryTitle: "What we store",
    empty: "Nothing to show yet",
    deleteTitle: "Delete my account",
    deleteBody: "This permanently removes your account and data. First you'll see a preview of what gets deleted and what we must retain (for example payment records required by law).",
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
    intro: "აქ ხედავ, რას ინახავს Netai შენზე. ქვემოთ შეგიძლია სრული წაშლა მოითხოვო.",
    summaryTitle: "რას ვინახავთ",
    empty: "ჯერ არაფერია საჩვენებელი",
    deleteTitle: "ანგარიშის წაშლა",
    deleteBody: "ეს სამუდამოდ შლის შენს ანგარიშს და მონაცემებს. ჯერ ნახავ, რა წაიშლება და რა დარჩება (მაგალითად გადახდის ჩანაწერები, რომლებსაც კანონი ითხოვს).",
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

function prettifyKey(key: string): string {
  return key.replace(/_/g, " ");
}

// Render any summary/preview value the backend sends without assuming its
// exact shape: primitives inline, arrays as lists, objects as nested rows.
function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === "") return <span style={{ color: "var(--meta)" }}>-</span>;
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

function Rows({ obj, nested }: { obj: Dict; nested?: boolean }) {
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
          <span style={{ fontSize: "12.5px", color: "var(--ink-soft)", textTransform: "capitalize", flex: "0 0 auto" }}>
            {prettifyKey(k)}
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Dict | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ success?: boolean; data?: Dict } & Dict>("/privacy/my-data/summary")
      .then((res) => setSummary((res.data ?? res) as Dict))
      .catch((err) => setError(err instanceof ApiError ? err.message : s.genericError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

        {/* Stored data summary */}
        <div className="card flex flex-col gap-2">
          <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.summaryTitle}</h2>
          {loading ? (
            <span className="sk-bar" style={{ width: "100%", height: 80 }} />
          ) : summary && Object.keys(summary).length > 0 ? (
            <Rows obj={summary} />
          ) : (
            <p className="text-sm" style={{ color: "var(--meta)" }}>{s.empty}</p>
          )}
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
      </div>
    </div>
  );
}
