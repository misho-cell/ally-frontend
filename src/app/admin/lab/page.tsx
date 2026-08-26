"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// Lab: a single viewer for the raw-JSON-only admin endpoints (25 Aug round —
// target-list T7, chorus/campaigns T8, unmet-needs T6, lab-report T16). No
// editing here, just tables — none of these have a dedicated page yet.

type Tab = { key: string; label: string; path: string };

const TABS: Tab[] = [
  { key: "target-list", label: "Target list (T7)", path: "/admin/target-list" },
  { key: "campaigns", label: "Chorus campaigns (T8)", path: "/admin/chorus/campaigns" },
  { key: "unmet-needs", label: "Unmet needs (T6)", path: "/admin/unmet-needs" },
  { key: "lab-report", label: "Lab report (T16)", path: "/admin/lab-report" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowsOf(raw: any): Record<string, unknown>[] {
  const d = raw?.data ?? raw;
  const arr = Array.isArray(d)
    ? d
    : Array.isArray(d?.rows)
    ? d.rows
    : Array.isArray(d?.items)
    ? d.items
    : null;
  if (arr) return arr.filter((x: unknown) => x && typeof x === "object");
  return [];
}

function cell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function LabPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>(TABS[0]);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tab: Tab) => {
    setRows(null);
    setRaw(null);
    setError(null);
    try {
      const res = await apiFetch<unknown>(tab.path, { admin: true });
      const parsed = rowsOf(res);
      if (parsed.length > 0) setRows(parsed);
      else setRaw(res);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    }
  }, [router]);

  useEffect(() => {
    load(active);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.key]);

  const columns = rows && rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">Lab</h1>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-4">
        <div className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                active.key === tab.key
                  ? "bg-[#23261F] text-white"
                  : "border border-gray-200 text-[#23261F] hover:bg-gray-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {!error && rows === null && raw === null && (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-2.5 font-semibold text-gray-500">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {columns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5 text-[#23261F]">
                        {cell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {rows && rows.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-gray-400">მონაცემები ვერ მოიძებნა</p>
        )}

        {raw !== null && (
          <pre className="overflow-x-auto rounded-2xl border border-gray-200 bg-white p-4 text-xs text-[#23261F] shadow-sm">
            {JSON.stringify(raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
