"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// Identity (31 Aug, D35): GET /admin/identity/summary (KPIs) + GET
// /admin/identity/candidates (the approval queue). Approve/reject call
// POST /admin/identity/candidates/:id/approve|reject — this exact path is
// ASSUMED (matches this backend's accept/decline/snooze convention
// elsewhere) and hasn't been confirmed against a live contract yet. If it
// 404s the button shows the real error instead of failing silently.

type Summary = Record<string, number | string>;

type Candidate = {
  id: number | string;
  name?: string | null;
  phone?: string | null;
  matched_name?: string | null;
  matched_phone?: string | null;
  confidence?: number | null;
  reason?: string | null;
  created_at?: string | null;
};

function fmtN(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function prettifyKey(key: string): string {
  return key.replace(/_/g, " ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeCandidates(raw: any): Candidate[] {
  const d = raw?.data ?? raw;
  const arr = Array.isArray(d) ? d : Array.isArray(d?.candidates) ? d.candidates : Array.isArray(d?.rows) ? d.rows : [];
  return arr.filter((x: unknown) => x && typeof x === "object");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeSummary(raw: any): Summary {
  const d = raw?.data ?? raw;
  if (!d || typeof d !== "object") return {};
  const out: Summary = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "number" || typeof v === "string") out[k] = v;
  }
  return out;
}

export default function AdminIdentityPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [sRes, cRes] = await Promise.all([
        apiFetch<unknown>("/admin/identity/summary", { admin: true }),
        apiFetch<unknown>("/admin/identity/candidates", { admin: true }),
      ]);
      setSummary(normalizeSummary(sRes));
      setCandidates(normalizeCandidates(cRes));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setCandidates([]);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(id: string | number, action: "approve" | "reject") {
    const key = String(id);
    setBusyId(key);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<unknown>(`/admin/identity/candidates/${encodeURIComponent(key)}/${action}`, {
        method: "POST",
        admin: true,
      });
      setNotice(action === "approve" ? `დამტკიცდა ✓ (#${key})` : `უარყოფილია (#${key})`);
      setCandidates((prev) => (prev ? prev.filter((c) => String(c.id) !== key) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ვერ შესრუცდა");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">იდენტობა (identity)</h1>
        </div>
        <button type="button" onClick={load} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">
          განახლება
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col gap-4">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

        {summary && Object.keys(summary).length > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(summary).map(([k, v]) => (
              <div key={k} className="rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm">
                <p className="text-2xl font-bold text-[#23261F]">{typeof v === "number" ? fmtN(v) : v}</p>
                <p className="mt-0.5 text-xs text-gray-500">{prettifyKey(k)}</p>
              </div>
            ))}
          </div>
        )}

        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">კანდიდატები</h2>

        {candidates === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : candidates.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">კანდიდატები ვერ მოიძებნა</p>
        ) : (
          <div className="flex flex-col gap-2">
            {candidates.map((c) => {
              const key = String(c.id);
              const busy = busyId === key;
              return (
                <div key={key} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-[#23261F]">{c.name || "—"} {c.phone && <span className="font-mono text-xs text-gray-400">{c.phone}</span>}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        → {c.matched_name || "—"} {c.matched_phone && <span className="font-mono">{c.matched_phone}</span>}
                        {c.confidence != null && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 font-semibold">{Math.round(c.confidence * 100)}%</span>}
                      </p>
                      {c.reason && <p className="mt-1 text-xs text-gray-400">{c.reason}</p>}
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(c.id, "approve")}
                        className="rounded-lg bg-[#23261F] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                      >
                        დამტკიცება
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(c.id, "reject")}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-40"
                      >
                        უარყოფა
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
