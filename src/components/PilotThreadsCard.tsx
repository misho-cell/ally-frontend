"use client";

import { useState, useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";

// Task 16 (9 Sept, D147): during the pilot the founder's admin login can read
// any user↔Netai conversation from the user page. Any 403 (other admin, pilot
// ended, switched off) hides the card entirely — it is not an error. Nothing
// is written on the user's side. The route disables itself after 15 Oct.

type Thread = { id: number | string; type?: string; title?: string | null; status?: string | null; status_line?: string | null; last_message?: string | null; updated_at?: string | null };
type Message = { role?: string; content?: string; created_at?: string | null };

function fmt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function PilotThreadsCard({ userId }: { userId: string }) {
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [hidden, setHidden] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, Message[]>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/admin/pilot/threads?user_id=${encodeURIComponent(userId)}`, { admin: true })
      .then((res) => { if (alive) setThreads(recordItems(pickArray(unwrapData(res), ["threads"])) as Thread[]); })
      .catch((err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 403) { setHidden(true); return; }
        setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
        setThreads([]);
      });
    return () => { alive = false; };
  }, [userId]);

  if (hidden) return null;

  async function open(t: Thread) {
    const key = String(t.id);
    if (openId === key) { setOpenId(null); return; }
    setOpenId(key);
    if (messages[key]) return;
    try {
      const res = await apiFetch<unknown>(`/admin/pilot/threads/${encodeURIComponent(key)}/messages`, { admin: true });
      const d = unwrapData(res);
      const arr = recordItems(pickArray(isRecord(d) ? d : {}, ["messages"])) as Message[];
      setMessages((prev) => ({ ...prev, [key]: arr }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">საუბრები (პილოტი)</h2>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {threads === null ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F] inline-block" />
      ) : threads.length === 0 ? (
        <p className="text-sm text-gray-400">საუბარი არ არის</p>
      ) : (
        <div className="flex flex-col gap-2">
          {threads.map((t) => {
            const key = String(t.id);
            const isOpen = openId === key;
            const ms = messages[key];
            return (
              <div key={key} className="rounded-xl border border-gray-100">
                <button type="button" onClick={() => open(t)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-gray-400">#{key}</span>
                      <span className="text-sm font-semibold text-[#23261F] truncate">{t.title || "—"}</span>
                      {t.type && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t.type}</span>}
                      {t.status && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t.status}</span>}
                    </div>
                    {t.last_message && <p className="mt-0.5 truncate text-xs text-gray-500">{t.last_message}</p>}
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{fmt(t.updated_at)} {isOpen ? "▾" : "▸"}</span>
                </button>
                {isOpen && (
                  <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
                    {!ms ? (
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F] inline-block" />
                    ) : ms.length === 0 ? (
                      <p className="text-xs text-gray-400">შეტყობინება არ არის</p>
                    ) : ms.map((m, i) => (
                      <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${m.role === "user" ? "self-end bg-[#23261F] text-white" : "self-start bg-gray-100 text-gray-800"}`}>
                        {m.content}
                        {m.created_at && <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-white/60" : "text-gray-400"}`}>{fmt(m.created_at)}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
