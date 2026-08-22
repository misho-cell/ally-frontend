"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// Product-facts editor (task 57): the nine texts the assistant serves via
// get_netai_info. GET /admin/netai-info lists them; PUT /admin/netai-info/:topic
// upserts without a deploy.

type InfoTopic = {
  topic: string;
  content: string;
  updated_at: string | null;
};

function fmtDateFull(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// The endpoint shape is young — accept an array, {topics: []}, or an object
// map, wrapped in {success,data} or bare.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): InfoTopic[] {
  const d = raw?.data ?? raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let arr: any[] = [];
  if (Array.isArray(d)) arr = d;
  else if (Array.isArray(d?.topics)) arr = d.topics;
  else if (d && typeof d === "object") {
    arr = Object.entries(d)
      .filter(([k]) => k !== "success")
      .map(([topic, v]) =>
        v && typeof v === "object" ? { topic, ...(v as object) } : { topic, content: String(v ?? "") }
      );
  }
  return arr
    .filter((x) => x && x.topic)
    .map((x) => ({
      topic: String(x.topic),
      content: String(x.content ?? ""),
      updated_at: x.updated_at ?? null,
    }));
}

export default function NetaiInfoAdminPage() {
  const router = useRouter();
  const [topics, setTopics] = useState<InfoTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openTopic, setOpenTopic] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/netai-info", { admin: true });
      setTopics(normalize(res));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setTopics([]);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function openEditor(t: InfoTopic) {
    setOpenTopic(t.topic);
    setDraft(t.content);
    setNotice(null);
    setError(null);
  }

  async function save(topic: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<unknown>(`/admin/netai-info/${encodeURIComponent(topic)}`, {
        method: "PUT",
        body: { content: draft },
        admin: true,
      });
      setNotice(`შენახულია ✓ (${topic})`);
      setOpenTopic(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ვერ შეინახა");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">პროდუქტის ფაქტები (netai-info)</h1>
        </div>
        <a
          href="/admin/prompt-blocks"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[#23261F] text-sm hover:bg-gray-50 transition"
        >
          პრომპტის ბლოკები →
        </a>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          ეს ტექსტები წყვეტს, რას ეუბნება ასისტენტი მომხმარებელს პროდუქტზე.
          შენახვა მაშინვე მოქმედებს, დეპლოი არ სჭირდება.
        </p>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

        {topics === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : topics.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">თემები ვერ მოიძებნა</p>
        ) : (
          topics.map((tp) => (
            <div key={tp.topic} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => (openTopic === tp.topic ? setOpenTopic(null) : openEditor(tp))}
                className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold text-[#23261F]">{tp.topic}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {tp.content ? tp.content.slice(0, 110) : "ცარიელია"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-[11px] text-gray-400">განახლდა: {fmtDateFull(tp.updated_at)}</span>
                  <span className="text-gray-400">{openTopic === tp.topic ? "▾" : "▸"}</span>
                </div>
              </button>

              {openTopic === tp.topic && (
                <div className="flex flex-col gap-3 border-t border-gray-100 p-5">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={10}
                    className="rounded-xl border border-gray-200 px-4 py-3 font-mono text-xs leading-relaxed outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
                  />
                  <p className="text-xs text-gray-400">{draft.length.toLocaleString("en-US")} სიმბოლო</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => save(tp.topic)}
                      disabled={saving || !draft.trim()}
                      className="flex h-10 w-32 items-center justify-center rounded-xl bg-[#23261F] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {saving ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        "შენახვა"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setOpenTopic(null)}
                      disabled={saving}
                      className="h-10 rounded-xl border border-gray-200 px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      გაუქმება
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
