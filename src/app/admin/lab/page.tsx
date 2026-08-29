"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// Lab: a single viewer for the raw-JSON-only admin endpoints (25 Aug round —
// target-list T7, chorus/campaigns T8, unmet-needs T6, lab-report T16). No
// editing here, just tables — none of these have a dedicated page yet.
// 27 Aug (F4): render every array found in the response as its own table
// (T8/T16 previously fell back to raw JSON), round floats, and give empty
// cities a readable fallback instead of an em dash.

type Tab = { key: string; label: string; path: string };

const TABS: Tab[] = [
  { key: "target-list", label: "Target list (T7)", path: "/admin/target-list" },
  { key: "campaigns", label: "Chorus campaigns (T8)", path: "/admin/chorus/campaigns" },
  { key: "unmet-needs", label: "Unmet needs (T6)", path: "/admin/unmet-needs" },
  { key: "lab-report", label: "Lab report (T16)", path: "/admin/lab-report" },
];

// Friendlier titles for known nested arrays; anything else falls back to a
// prettified version of its object key.
const TABLE_TITLES: Record<string, string> = {
  technique_conversion: "ტექნიკის კონვერსია",
};

// Tables whose null cells read better as "უცნობი" than a plain dash.
const UNKNOWN_LABEL_TABLES = new Set(["technique_conversion"]);

type Table = { key: string; title: string; rows: Record<string, unknown>[] };

function prettifyKey(key: string): string {
  return key.replace(/_/g, " ");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractTables(raw: any): Table[] {
  const d = raw?.data ?? raw;
  if (Array.isArray(d)) {
    const rows = d.filter((x) => x && typeof x === "object");
    return rows.length > 0 ? [{ key: "main", title: "", rows }] : [];
  }
  if (!d || typeof d !== "object") return [];

  const tables: Table[] = [];
  // A wrapper array under a conventional key (rows/items/<tab-key>) is the
  // PRIMARY table and gets no header; every other array-of-objects found
  // anywhere in the body renders as its own secondary table.
  const primaryKeys = ["rows", "items", "results", "list"];
  for (const [key, value] of Object.entries(d)) {
    if (!Array.isArray(value) || value.length === 0) continue;
    const rows = value.filter((x) => x && typeof x === "object");
    if (rows.length === 0) continue;
    tables.push({
      key,
      title: primaryKeys.includes(key) ? "" : TABLE_TITLES[key] ?? prettifyKey(key),
      rows,
    });
  }
  if (tables.length === 0) {
    // No array anywhere — treat the object itself as a single-row table.
    const flat = Object.entries(d).filter(([, v]) => typeof v !== "object" || v === null);
    if (flat.length > 0) tables.push({ key: "main", title: "", rows: [Object.fromEntries(flat)] });
  }
  return tables;
}

function cell(v: unknown, colKey: string, nullLabel: string): string {
  if (v == null) {
    if (/city/i.test(colKey)) return "ქალაქი უცნობია";
    return nullLabel;
  }
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function DataTable({ table }: { table: Table }) {
  const columns = table.rows.length > 0 ? Object.keys(table.rows[0]) : [];
  const nullLabel = UNKNOWN_LABEL_TABLES.has(table.key) ? "უცნობი" : "—";
  return (
    <div className="flex flex-col gap-2">
      {table.title && (
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{table.title}</h2>
      )}
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
            {table.rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 last:border-0">
                {columns.map((col) => (
                  <td key={col} className="whitespace-nowrap px-4 py-2.5 text-[#23261F]">
                    {cell(row[col], col, nullLabel)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LabPage() {
  const router = useRouter();
  const [active, setActive] = useState<Tab>(TABS[0]);
  const [tables, setTables] = useState<Table[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (tab: Tab) => {
    setTables(null);
    setError(null);
    try {
      const res = await apiFetch<unknown>(tab.path, { admin: true });
      setTables(extractTables(res));
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

        {!error && tables === null && (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        )}

        {tables && tables.length === 0 && !error && (
          <p className="py-8 text-center text-sm text-gray-400">მონაცემები ვერ მოიძებნა</p>
        )}

        {tables && tables.length > 0 && (
          <div className="flex flex-col gap-6">
            {tables.map((table) => (
              <DataTable key={table.key} table={table} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
