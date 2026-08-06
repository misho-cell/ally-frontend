"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrap, fmtN, fmtDate, type PromptBlock } from "./shared";

type ListData = {
  blocks: PromptBlock[];
  modes: string[];
  mode_totals: { mode: string; enabled_chars: number; budget_chars: number }[];
};

type PreviewData = {
  mode: string;
  system_prompt: string;
  block_names: string[];
  tools: { name: string; description: string }[];
  char_count: number;
  approx_tokens: number;
  not_rendered: string[];
};

type RunMode = {
  run_id: string;
  user_id: number;
  thread_id: number;
  mode: string;
  block_names: string[];
  created_at: string;
};

type Tab = "blocks" | "preview" | "runs";

export default function PromptBlocksPage() {
  const [tab, setTab] = useState<Tab>("blocks");
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/prompt-blocks", { admin: true });
      setData(unwrap<ListData>(res));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // სვიჩი სიიდანვე — გამორთვაზე დადასტურება (საავარიო მუხრუჭი).
  async function toggleBlock(block: PromptBlock) {
    if (block.enabled) {
      const ok = window.confirm(`ბლოკი ყველა იუზერზე გამოირთვება — გავაგრძელო?\n\n(${block.name})`);
      if (!ok) return;
    }
    setError(null);
    try {
      await apiFetch<unknown>(`/admin/prompt-blocks/${block.name}`, {
        method: "PUT",
        body: { enabled: !block.enabled },
        admin: true,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ვერ შეიცვალა");
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <h1 className="text-lg font-bold text-[#23261F]">პრომპტის ბლოკები</h1>
        <div className="flex items-center gap-2">
          <a href="/admin" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[#23261F] text-sm hover:bg-gray-50 transition">
            ← ადმინი
          </a>
          {tab === "blocks" && (
            <Link
              href="/admin/prompt-blocks/new"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#23261F] text-white text-sm hover:opacity-80 transition"
            >
              + ახალი ბლოკი
            </Link>
          )}
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6 flex flex-col gap-6">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 self-start">
          {([
            ["blocks", "ბლოკები"],
            ["preview", "Preview"],
            ["runs", "Run-ჟურნალი"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
                tab === key ? "bg-white text-[#23261F] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>
        )}

        {tab === "blocks" && (
          loading ? (
            <div className="flex justify-center py-12">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
            </div>
          ) : data ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {data.mode_totals.map((mt) => {
                  const pct = mt.budget_chars > 0 ? mt.enabled_chars / mt.budget_chars : 0;
                  const warn = pct >= 0.9;
                  return (
                    <div key={mt.mode} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-sm font-semibold text-[#23261F]">{mt.mode}</span>
                        <span className={`text-xs font-semibold ${warn ? "text-red-600" : "text-gray-500"}`}>
                          {fmtN(mt.enabled_chars)} / {fmtN(mt.budget_chars)}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                        <div
                          className={`h-full rounded-full ${warn ? "bg-red-500" : pct >= 0.7 ? "bg-amber-500" : "bg-green-600"}`}
                          style={{ width: `${Math.min(100, Math.round(pct * 100))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </section>

              <section className="flex flex-col gap-3">
                {data.blocks.length === 0 && (
                  <p className="text-sm text-gray-400">ბლოკები ჯერ არ არის.</p>
                )}
                {data.blocks.map((b) => (
                  <div key={b.name} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/admin/prompt-blocks/${b.name}`}
                        className="font-mono text-sm font-bold text-[#23261F] hover:underline"
                      >
                        {b.name}
                      </Link>
                      {b.modes.map((m) => (
                        <span key={m} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
                          {m}
                        </span>
                      ))}
                      {b.enabled_for_user_ids.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                          ტესტზეა: {b.enabled_for_user_ids.length} ექაუნთი
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-4">
                        <span className="text-xs text-gray-400">რიგი: {b.sort_order}</span>
                        <span className="text-xs text-gray-400">{fmtN(b.content.length)} სიმბ.</span>
                        <span className="text-xs text-gray-400">{fmtDate(b.updated_at)}</span>
                        <button
                          type="button"
                          onClick={() => toggleBlock(b)}
                          className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                            b.enabled
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {b.enabled ? "ჩართული" : "გამორთული"}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </section>
            </>
          ) : null
        )}

        {tab === "preview" && data && <PreviewTab modes={data.modes} />}
        {tab === "preview" && !data && !loading && (
          <p className="text-sm text-gray-400">ჯერ ბლოკების სია ჩაიტვირთეთ.</p>
        )}
        {tab === "runs" && <RunsTab />}
      </div>
    </div>
  );
}

function PreviewTab({ modes }: { modes: string[] }) {
  const [mode, setMode] = useState(modes[0] ?? "");
  const [userId, setUserId] = useState("");
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);

  async function loadPreview() {
    if (!mode) return;
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ mode });
      if (userId.trim()) q.set("user_id", userId.trim());
      const res = await apiFetch<unknown>(`/admin/prompt-preview?${q.toString()}`, { admin: true });
      setPreview(unwrap<PreviewData>(res));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Preview ვერ ჩაიტვირთა");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">რეჟიმი</label>
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm font-mono outline-none focus:border-[#3E7A56]"
          >
            {modes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">user_id (არასავალდებულო)</label>
          <input
            type="text"
            inputMode="numeric"
            value={userId}
            onChange={(e) => setUserId(e.target.value.replace(/\D/g, ""))}
            placeholder="default ტესტ-ექაუნთი"
            className="w-44 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#3E7A56]"
          />
        </div>
        <button
          type="button"
          onClick={loadPreview}
          disabled={loading || !mode}
          className="flex h-9 items-center justify-center rounded-xl bg-[#23261F] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            "ჩატვირთვა"
          )}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

      {preview && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-semibold text-[#23261F]">
              {fmtN(preview.char_count)} სიმბოლო · ≈{fmtN(preview.approx_tokens)} ტოკენი
            </span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">ჩატვირთული ბლოკები:</span>
            {preview.block_names.map((n) => (
              <span key={n} className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-mono text-gray-600">{n}</span>
            ))}
          </div>

          {preview.not_rendered.length > 0 && (
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-800">
              ეს სექციები მხოლოდ ცოცხალ მდგომარეობაში ჩნდება:
              <ul className="mt-1 list-disc pl-5">
                {preview.not_rendered.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          )}

          {preview.tools.length > 0 && (
            <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setToolsOpen((v) => !v)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[#23261F]"
              >
                ხელსაწყოების აღწერები ({preview.tools.length})
                <span className="text-gray-400">{toolsOpen ? "▾" : "▸"}</span>
              </button>
              {toolsOpen && (
                <div className="flex flex-col gap-3 border-t border-gray-100 p-4">
                  {preview.tools.map((tool) => (
                    <div key={tool.name}>
                      <p className="font-mono text-xs font-bold text-[#23261F]">{tool.name}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-gray-600">{tool.description}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-gray-200 bg-[#1e1e1e] p-4 text-xs leading-relaxed text-gray-100">
            {preview.system_prompt}
          </pre>
        </div>
      )}
    </section>
  );
}

function RunsTab() {
  const [threadFilter, setThreadFilter] = useState("");
  const [runs, setRuns] = useState<RunMode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (threadId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const q = threadId?.trim() ? `?thread_id=${encodeURIComponent(threadId.trim())}` : "";
      const res = await apiFetch<unknown>(`/admin/run-modes${q}`, { admin: true });
      const arr = unwrap<RunMode[]>(res);
      setRuns(Array.isArray(arr) ? arr : []);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ჟურნალი ვერ ჩაიტვირთა");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section className="flex flex-col gap-4">
      <form
        onSubmit={(e) => { e.preventDefault(); load(threadFilter); }}
        className="flex items-end gap-3"
      >
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">thread_id ფილტრი</label>
          <input
            type="text"
            inputMode="numeric"
            value={threadFilter}
            onChange={(e) => setThreadFilter(e.target.value.replace(/\D/g, ""))}
            placeholder="ყველა"
            className="w-44 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#3E7A56]"
          />
        </div>
        <button
          type="submit"
          className="h-9 rounded-xl bg-[#23261F] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          ძიება
        </button>
        {threadFilter && (
          <button
            type="button"
            onClick={() => { setThreadFilter(""); load(); }}
            className="h-9 rounded-xl border border-gray-200 px-4 text-sm text-gray-600 hover:bg-gray-50"
          >
            გასუფთავება
          </button>
        )}
      </form>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
        </div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-gray-400">ჩანაწერები არ არის.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-4 py-3">დრო</th>
                <th className="px-4 py-3">run_id</th>
                <th className="px-4 py-3">user</th>
                <th className="px-4 py-3">thread</th>
                <th className="px-4 py-3">რეჟიმი</th>
                <th className="px-4 py-3">ბლოკები</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.run_id} className="border-b border-gray-50 last:border-0">
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-500">{fmtDate(r.created_at)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400" title={r.run_id}>
                    {r.run_id.length > 10 ? r.run_id.slice(0, 10) + "…" : r.run_id}
                  </td>
                  <td className="px-4 py-2.5 text-xs">{r.user_id}</td>
                  <td className="px-4 py-2.5 text-xs">{r.thread_id}</td>
                  <td className="px-4 py-2.5">
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-mono text-gray-700">{r.mode}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {r.block_names.map((n) => (
                        <span key={n} className="rounded-full bg-gray-50 px-2 py-0.5 text-[11px] font-mono text-gray-500">{n}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
