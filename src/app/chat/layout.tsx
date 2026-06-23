"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { ThreadsContext, type Thread } from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function getUserInfo(): { name: string; initial: string } {
  try {
    const token = getToken();
    if (!token) return { name: "Me", initial: "M" };
    const payload = JSON.parse(atob(token.split(".")[1]));
    const name: string = payload.name || payload.phone || "Me";
    return { name, initial: name.charAt(0).toUpperCase() };
  } catch {
    return { name: "Me", initial: "M" };
  }
}

function dedup(arr: Thread[]): Thread[] {
  const seen = new Set<string>();
  return arr.filter((t) => {
    const key = String(t.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [search, setSearch] = useState("");
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
      const fetched: Thread[] = json.data ?? json;
      setThreads(dedup(fetched));
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
            setThreads((prev) =>
              dedup([data.thread, ...prev.filter((t) => String(t.id) !== String(data.thread.id))])
            );
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
      setThreads((prev) => dedup([thread, ...prev.filter((t) => String(t.id) !== String(thread.id))]));
      router.push(`/chat/${thread.id}`);
    } catch {}
    finally {
      setCreating(false);
    }
  }

  async function handleSignOut() {
    const token = getToken();
    const endpoint = localStorage.getItem("push_endpoint");
    if (token && endpoint) {
      try {
        await fetch(`${BASE_URL}/notifications/subscribe`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      localStorage.removeItem("push_endpoint");
    }
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  const filtered = threads.filter((t) =>
    (t.title ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const incoming = filtered.filter((t) => t.type === "incoming_request");
  const mine = filtered.filter((t) => t.type !== "incoming_request");

  const user = getUserInfo();

  const sidebarClass = isOnThread
    ? "hidden md:flex"
    : "flex w-full md:flex";

  const mainClass = isOnThread
    ? "flex flex-1 flex-col min-w-0"
    : "hidden md:flex md:flex-1 md:flex-col";

  return (
    <ThreadsContext.Provider value={{ threads, setThreads }}>
      <div className="flex h-full" style={{ background: "var(--bg)" }}>
        {/* Sidebar */}
        <aside
          className={`${sidebarClass} flex-col shrink-0`}
          style={{
            width: "268px",
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--sidebar-border)",
          }}
        >
          {/* Wordmark */}
          <div className="flex items-center gap-2.5 px-5 pt-5 pb-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/ally-logo.svg"
              alt="Ally"
              style={{ borderRadius: "26%", width: 24, height: 24 }}
            />
            <span
              style={{
                fontFamily: "var(--font-bricolage)",
                fontSize: "22px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--ink-strong)",
              }}
            >
              Ally
            </span>
          </div>

          {/* New chat button */}
          <div className="px-4 pb-3">
            <button
              onClick={createThread}
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-xl border bg-white px-4 py-2.5 transition-colors hover:bg-gray-50 disabled:opacity-50"
              style={{
                borderColor: "var(--sidebar-border)",
                color: "var(--ink-2)",
                fontSize: "14.5px",
                fontWeight: 500,
              }}
            >
              <span style={{ color: "var(--accent)", fontWeight: 600, fontSize: "16px" }}>+</span>
              {creating ? "..." : "New chat"}
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: "#e8e2d8", border: "1px solid var(--sidebar-border)" }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                <circle cx="8.5" cy="8.5" r="5.75" stroke="var(--placeholder)" strokeWidth="1.75" />
                <path d="M13 13l3.5 3.5" stroke="var(--placeholder)" strokeWidth="1.75" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search chats"
                className="flex-1 bg-transparent outline-none"
                style={{ color: "var(--ink)", fontSize: "13.5px" }}
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="flex-1 overflow-y-auto px-2">
            {incoming.length > 0 && (
              <section className="mb-1">
                <p
                  className="px-3 pb-1 pt-2"
                  style={{
                    fontFamily: "var(--font-ibm-mono), monospace",
                    fontSize: "10.5px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--meta)",
                  }}
                >
                  შემოსული მოთხოვნები
                </p>
                {incoming.map((t) => (
                  <ThreadRow key={t.id} thread={t} active={pathname === `/chat/${t.id}`} />
                ))}
              </section>
            )}

            <section>
              {incoming.length > 0 && mine.length > 0 && (
                <p
                  className="px-3 pb-1 pt-2"
                  style={{
                    fontFamily: "var(--font-ibm-mono), monospace",
                    fontSize: "10.5px",
                    fontWeight: 500,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: "var(--meta)",
                  }}
                >
                  ჩემი სრედები
                </p>
              )}
              {mine.map((t) => (
                <ThreadRow key={t.id} thread={t} active={pathname === `/chat/${t.id}`} />
              ))}
              {threads.length === 0 && (
                <p className="px-3 py-6 text-center" style={{ color: "var(--placeholder)", fontSize: "13px" }}>
                  სრედები არ არის
                </p>
              )}
            </section>
          </div>

          {/* Account row */}
          <div
            className="flex items-center gap-3 px-4 py-3.5"
            style={{ borderTop: "1px solid var(--sidebar-border)" }}
          >
            <Link
              href="/profile"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-70"
              style={{ background: "var(--thread-active-bg)", color: "var(--ink-2)" }}
            >
              {user.initial}
            </Link>
            <Link
              href="/profile"
              className="flex-1 truncate transition-opacity hover:opacity-70"
              style={{ color: "var(--ink-2)", fontWeight: 500, fontSize: "13.5px" }}
            >
              {user.name}
            </Link>
            <button
              onClick={handleSignOut}
              className="transition-opacity hover:opacity-60"
              style={{
                fontFamily: "var(--font-ibm-mono), monospace",
                fontSize: "11px",
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--meta)",
              }}
            >
              Sign out
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className={mainClass}>{children}</main>
      </div>
    </ThreadsContext.Provider>
  );
}

function ThreadRow({ thread, active }: { thread: Thread; active: boolean }) {
  return (
    <Link
      href={`/chat/${thread.id}`}
      className="flex items-center rounded-xl px-3 py-2.5 transition-colors"
      style={{
        background: active ? "var(--thread-active-bg)" : "transparent",
        marginBottom: "1px",
      }}
      onMouseEnter={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "rgba(0,0,0,0.04)";
      }}
      onMouseLeave={(e) => {
        if (!active) (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        className="truncate"
        style={{
          fontSize: "14px",
          fontWeight: active ? 600 : 400,
          color: active ? "var(--ink-strong)" : "var(--ink-muted)",
        }}
      >
        {thread.type === "incoming_request" && (
          <span style={{ color: "var(--accent)", marginRight: "4px" }}>↓</span>
        )}
        {thread.type === "outgoing_request" && (
          <span style={{ color: "var(--meta)", marginRight: "4px" }}>↑</span>
        )}
        {thread.title ?? "ახალი სრედი"}
      </span>
    </Link>
  );
}
