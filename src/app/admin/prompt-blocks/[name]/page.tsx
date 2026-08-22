"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrap, fmtN, type PromptBlock } from "../shared";

const NAME_RE = /^[a-z0-9_]{2,40}$/;
// Fallback only — the live limit comes from GET /admin/prompt-blocks
// (mode_totals.budget_chars); hardcoding it stranded a valid 20,515-char
// block when the backend budget moved to 30,000 (22 Aug).
const FALLBACK_BLOCK_LIMIT = 20000;

type ListData = {
  blocks: PromptBlock[];
  modes: string[];
  mode_totals?: { mode: string; enabled_chars: number; budget_chars: number }[];
};

type HistoryEntry = {
  id: number;
  name: string;
  action: string;
  content: string;
  modes: string[];
  sort_order: number;
  enabled: boolean;
  enabled_for_user_ids: number[];
  changed_at: string;
};

function fmtDateFull(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function PromptBlockEditorPage() {
  const params = useParams();
  const router = useRouter();
  const rawName = params.name as string;
  const isNew = rawName === "new";

  const [tab, setTab] = useState<"edit" | "history">("edit");
  const [modes, setModes] = useState<string[]>([]);
  const [blockLimit, setBlockLimit] = useState(FALLBACK_BLOCK_LIMIT);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState(isNew ? "" : rawName);
  const [content, setContent] = useState("");
  const [blockModes, setBlockModes] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState("100");
  const [enabled, setEnabled] = useState(true);
  const [userIds, setUserIds] = useState("");

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/prompt-blocks", { admin: true });
      const data = unwrap<ListData>(res);
      setModes(data.modes ?? []);
      const budgets = (data.mode_totals ?? [])
        .map((mt) => mt.budget_chars)
        .filter((n) => Number.isFinite(n) && n > 0);
      if (budgets.length > 0) setBlockLimit(Math.max(...budgets));
      if (!isNew) {
        const b = data.blocks.find((x) => x.name === rawName);
        if (!b) {
          setNotFound(true);
        } else {
          setContent(b.content);
          setBlockModes(b.modes);
          setSortOrder(String(b.sort_order));
          setEnabled(b.enabled);
          setUserIds(b.enabled_for_user_ids.join(", "));
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }, [isNew, rawName]);

  useEffect(() => {
    load();
  }, [load]);

  async function loadHistory() {
    setHistoryError(null);
    try {
      const res = await apiFetch<unknown>(`/admin/prompt-blocks/${rawName}/history`, { admin: true });
      const arr = unwrap<HistoryEntry[]>(res);
      setHistory(Array.isArray(arr) ? arr : []);
    } catch (err) {
      setHistoryError(err instanceof ApiError ? err.message : "ისტორია ვერ ჩაიტვირთა");
    }
  }

  function parsedUserIds(): number[] | null {
    const trimmed = userIds.trim();
    if (!trimmed) return [];
    const parts = trimmed.split(/[,\s]+/).filter(Boolean);
    const nums = parts.map((p) => parseInt(p, 10));
    if (nums.some((n) => !Number.isFinite(n) || n <= 0)) return null;
    return nums;
  }

  const effectiveName = isNew ? name.trim() : rawName;
  const nameValid = NAME_RE.test(effectiveName);
  const chars = content.length;

  async function save() {
    setError(null);
    setNotice(null);
    if (!nameValid) {
      setError("სახელი: მხოლოდ a-z, 0-9 და _, 2-40 სიმბოლო.");
      return;
    }
    if (isNew && !content.trim()) {
      setError("შექმნისას content სავალდებულოა.");
      return;
    }
    const ids = parsedUserIds();
    if (ids === null) {
      setError("ტესტ-ექაუნთები: მხოლოდ დადებითი რიცხვები, მძიმით გამოყოფილი.");
      return;
    }
    setSaving(true);
    try {
      await apiFetch<unknown>(`/admin/prompt-blocks/${effectiveName}`, {
        method: "PUT",
        body: {
          content,
          modes: blockModes,
          sort_order: parseInt(sortOrder, 10) || 0,
          enabled,
          enabled_for_user_ids: ids,
        },
        admin: true,
      });
      if (isNew) {
        router.replace(`/admin/prompt-blocks/${effectiveName}`);
      } else {
        setNotice("შენახულია ✓");
        await load();
      }
    } catch (err) {
      // 400: ბექის ვალიდაციის ტექსტი (მაგ. ჭერის გადაჭარბება) ვერბატიმ ჩანს.
      setError(err instanceof ApiError ? err.message : "ვერ შეინახა");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    if (deleteConfirm !== rawName) return;
    setDeleting(true);
    setError(null);
    try {
      await apiFetch<unknown>(`/admin/prompt-blocks/${rawName}`, { method: "DELETE", admin: true });
      router.replace("/admin/prompt-blocks");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "წაშლა ვერ მოხერხდა");
      setDeleting(false);
    }
  }

  async function restore(entry: HistoryEntry) {
    const ok = window.confirm(`დავაბრუნო ბლოკი ${fmtDateFull(entry.changed_at)}-ის ვერსიაზე?`);
    if (!ok) return;
    setError(null);
    try {
      await apiFetch<unknown>(`/admin/prompt-blocks/${rawName}`, {
        method: "PUT",
        body: {
          content: entry.content,
          modes: entry.modes,
          sort_order: entry.sort_order,
          enabled: entry.enabled,
          enabled_for_user_ids: entry.enabled_for_user_ids,
        },
        admin: true,
      });
      setNotice("აღდგენილია ✓");
      await load();
      await loadHistory();
      setTab("edit");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "აღდგენა ვერ მოხერხდა");
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-gray-50">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-full bg-gray-50 p-8">
        <p className="text-sm text-gray-500">ბლოკი „{rawName}“ ვერ მოიძებნა.</p>
        <Link href="/admin/prompt-blocks" className="mt-3 inline-block text-sm font-semibold text-[#23261F] underline">
          ← სიასთან დაბრუნება
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/admin/prompt-blocks" className="text-sm text-gray-500 hover:text-gray-700">← ბლოკები</Link>
          <h1 className="font-mono text-lg font-bold text-[#23261F]">{isNew ? "ახალი ბლოკი" : rawName}</h1>
        </div>
        {!isNew && (
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            <button
              onClick={() => setTab("edit")}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "edit" ? "bg-white text-[#23261F] shadow-sm" : "text-gray-500"}`}
            >
              რედაქტირება
            </button>
            <button
              onClick={() => { setTab("history"); if (!history) loadHistory(); }}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${tab === "history" ? "bg-white text-[#23261F] shadow-sm" : "text-gray-500"}`}
            >
              ისტორია
            </button>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-5">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

        {tab === "edit" && (
          <>
            <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm flex flex-col gap-4">
              {isNew ? (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">
                    სახელი <span className="text-gray-400">(a-z, 0-9, _ · 2-40 · შემდეგ აღარ შეიცვლება)</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value.toLowerCase())}
                    placeholder="მაგ. tone_rules"
                    className={`rounded-xl border px-4 py-3 font-mono text-sm outline-none transition-colors focus:ring-2 focus:ring-[#3E7A56]/10 ${
                      name && !nameValid ? "border-red-300 focus:border-red-400" : "border-gray-200 focus:border-[#3E7A56]"
                    }`}
                  />
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">ტექსტი (content)</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={16}
                  className="rounded-xl border border-gray-200 px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
                />
                <p className={`text-xs ${chars > blockLimit ? "font-semibold text-red-600" : "text-gray-400"}`}>
                  {fmtN(chars)} სიმბოლო · ≈{fmtN(Math.round(chars / 3))} ტოკენი · ლიმიტი {fmtN(blockLimit)}
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">რეჟიმები</label>
                <div className="flex flex-wrap gap-3">
                  {modes.map((m) => (
                    <label key={m} className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={blockModes.includes(m)}
                        onChange={(e) =>
                          setBlockModes((prev) =>
                            e.target.checked ? [...prev, m] : prev.filter((x) => x !== m)
                          )
                        }
                      />
                      <span className="font-mono">{m}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-gray-700">რიგითობა (sort_order)</label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-32 rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none focus:border-[#3E7A56]"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 self-end pb-3 text-sm font-medium text-gray-700">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                  ჩართული
                </label>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">ტესტ-ექაუნთები (user id-ები, მძიმით)</label>
                <input
                  type="text"
                  value={userIds}
                  onChange={(e) => setUserIds(e.target.value)}
                  placeholder="მაგ. 501, 502"
                  className="rounded-xl border border-gray-200 px-4 py-3 font-mono text-sm outline-none focus:border-[#3E7A56]"
                />
                <p className="text-xs text-gray-400">
                  ცარიელი — ყველა იუზერი; შევსებული — მხოლოდ ეს ექაუნთები (ტესტისთვის).
                </p>
              </div>

              <button
                type="button"
                onClick={save}
                disabled={saving || (isNew && (!nameValid || !content.trim()))}
                className="flex h-11 w-full items-center justify-center rounded-xl bg-[#23261F] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {saving ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : isNew ? (
                  "შექმნა"
                ) : (
                  "შენახვა"
                )}
              </button>
            </div>

            {!isNew && (
              <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm flex flex-col gap-3">
                <h2 className="text-sm font-bold text-red-700">ბლოკის წაშლა</h2>
                <p className="text-xs text-gray-500">
                  მოქმედებს ცოცხალ პროდზე. ბოლო მდგომარეობა ისტორიაში რჩება და აღდგენა შესაძლებელია.
                  დასადასტურებლად გადაბეჭდე ბლოკის სახელი: <span className="font-mono font-bold">{rawName}</span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={rawName}
                    className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-red-400"
                  />
                  <button
                    type="button"
                    onClick={doDelete}
                    disabled={deleteConfirm !== rawName || deleting}
                    className="h-11 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    {deleting ? "…" : "წაშლა"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <section className="flex flex-col gap-3">
            {historyError && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{historyError}</div>}
            {history === null ? (
              <div className="flex justify-center py-12">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-sm text-gray-400">ისტორია ცარიელია.</p>
            ) : (
              history.map((h) => (
                <div key={h.id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => setOpenEntry(openEntry === h.id ? null : h.id)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        h.action === "delete" ? "bg-red-100 text-red-700" :
                        h.action === "create" ? "bg-green-100 text-green-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {h.action}
                      </span>
                      <span className="text-sm text-gray-600">{fmtDateFull(h.changed_at)}</span>
                      <span className="text-xs text-gray-400">{fmtN(h.content.length)} სიმბ. · {h.modes.join(", ")}</span>
                    </div>
                    <span className="text-gray-400">{openEntry === h.id ? "▾" : "▸"}</span>
                  </button>
                  {openEntry === h.id && (
                    <div className="flex flex-col gap-3 border-t border-gray-100 p-4">
                      <div className="grid gap-3 lg:grid-cols-2">
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">ეს ვერსია</p>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                            {h.content}
                          </pre>
                        </div>
                        <div>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">მიმდინარე</p>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
                            {content}
                          </pre>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => restore(h)}
                        className="self-start rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-[#23261F] transition-colors hover:bg-gray-50"
                      >
                        ამ ვერსიაზე დაბრუნება
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </section>
        )}
      </div>
    </div>
  );
}
