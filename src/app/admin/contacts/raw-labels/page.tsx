"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { pickArray, recordItems, unwrapData } from "@/lib/payload";

// Raw contact labels (31 Aug, D40): GET /admin/contacts/raw-labels.
// Read-only — no write endpoint exists for this.

function rows(raw: unknown): Record<string, unknown>[] {
  return recordItems(pickArray(unwrapData(raw), ["rows", "labels"]));
}

function cell(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AdminContactsRawLabelsPage() {
  const router = useRouter();
  const [data, setData] = useState<Record<string, unknown>[] | null>([]);
  const [error, setError] = useState<string | null>(null);
  // Task 44 (9 Sept): the route wants a phone / contact id — no blind fetch.
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setError(null);
    setData(null);
    try {
      const key = /^\+?\d[\d\s-]*$/.test(q) ? "phone" : "contact_id";
      const res = await apiFetch<unknown>(`/admin/contacts/raw-labels?${key}=${encodeURIComponent(q)}`, { admin: true });
      setData(rows(res));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setData([]);
    }
  }, [router, query]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = data && data.length > 0 ? Object.keys(data[0]) : [];

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">კონტაქტების ნედლი ლეიბლები</h1>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(input); }} className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="ტელეფონი ან კონტაქტის id"
            className="w-52 rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
          />
          <button type="submit" disabled={!input.trim()} className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50">
            ძებნა
          </button>
        </form>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-4">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {data === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : data.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">{query.trim() ? "მონაცემები ვერ მოიძებნა" : "შეიყვანე ტელეფონი ან კონტაქტის id"}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-2.5 font-semibold text-gray-500">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    {columns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5 text-[#23261F]">{cell(row[col])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
