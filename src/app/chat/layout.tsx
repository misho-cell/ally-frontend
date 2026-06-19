"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchEventSource } from "@microsoft/fetch-event-source";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const abortRef = useRef<AbortController | null>(null);

  const isOnThread = pathname !== "/chat";

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/threads`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const json = await res.json();
      setThreads(json.data ?? json);
    } catch {}
  }, []);

  useEffect(() => {
    loadThreads();

    abortRef.current = new AbortController();
    const ctrl = abortRef.current;

    fetchEventSource(`${BASE_URL}/threads/stream`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: ctrl.signal,
      onmessage(ev) {
        if (!ev.data) return;
        try {
          const data = JSON.parse(ev.data);
          if (data.event === "thread_created" && data.thread) {
            setThreads((prev) => [
              data.thread,
              ...prev.filter((t) => t.id !== data.thread.id),
            ]);
          }
        } catch {}
      },
      onerror() {
        return 4000;
      },
    });

    return () => ctrl.abort();
  }, [loadThreads]);

  async function createThread() {
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
      });
      const json = await res.json();
      const thread: Thread = json.data ?? json;
      setThreads((prev) => [thread, ...prev]);
      router.push(`/chat/${thread.id}`);
    } catch {} finally {
      setCreating(false);
    }
  }

  const incoming = threads.filter((t) => t.type === "incoming_request");
  const mine = threads.filter((t) => t.type !== "incoming_request");

  const sidebarClass = isOnThread
    ? "hidden md:flex md:w-80 md:shrink-0"
    : "flex w-full md:w-80 md:shrink-0";

  const mainClass = isOnThread ? "flex flex-1 flex-col min-w-0" : "hidden md:flex md:flex-1 md:flex-col";

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className={`${sidebarClass} flex-col border-r border-gray-200 bg-white`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h1 className="text-lg font-bold text-[#1a1a2e]">Ally</h1>
          <button
            onClick={createThread}
            disabled={creating}
            className="rounded-lg border border-[#1a1a2e] px-3 py-1.5 text-xs font-medium text-[#1a1a2e] transition-colors hover:bg-[#1a1a2e] hover:text-white disabled:opacity-50"
          >
            {creating ? "..." : "+ ახალი"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {incoming.length > 0 && (
            <section>
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                შემოსული მოთხოვნები
              </p>
              {incoming.map((t) => (
                <ThreadRow key={t.id} thread={t} active={pathname === `/chat/${t.id}`} />
              ))}
            </section>
          )}

          <section>
            {incoming.length > 0 && (
              <p className="px-4 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                ჩემი სრედები
              </p>
            )}
            {mine.map((t) => (
              <ThreadRow key={t.id} thread={t} active={pathname === `/chat/${t.id}`} />
            ))}
            {threads.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-gray-400">
                სრედები არ არის
              </p>
            )}
          </section>
        </div>
      </aside>

      {/* Main */}
      <main className={mainClass}>{children}</main>
    </div>
  );
}

function ThreadRow({ thread, active }: { thread: Thread; active: boolean }) {
  return (
    <Link
      href={`/chat/${thread.id}`}
      className={`flex flex-col gap-0.5 border-b border-gray-100 px-4 py-3 transition-colors ${
        active ? "bg-[#1a1a2e]/5" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex items-center gap-2">
        {thread.type === "incoming_request" && (
          <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700">↓</span>
        )}
        {thread.type === "outgoing_request" && (
          <span className="shrink-0 rounded-full bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">↑</span>
        )}
        <span className="truncate text-sm font-medium text-[#1a1a2e]">{thread.title}</span>
      </div>
      {thread.last_message && (
        <p className="truncate text-xs text-gray-400">{thread.last_message}</p>
      )}
    </Link>
  );
}
