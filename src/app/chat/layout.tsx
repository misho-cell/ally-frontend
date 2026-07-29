"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { authHeaders, handleAdminTokenMisuse } from "@/lib/deviceId";
import { t } from "@/lib/i18n";
import {
  ThreadsContext,
  updateThreadState,
  type Thread,
  type ThreadState,
  type TokenBalance,
} from "@/contexts/ThreadsContext";

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

function isSubscriptionError(status: number, body: { error?: string; success?: boolean }): boolean {
  return status === 403 || body?.error === "subscription_required" || (body?.success === false && body?.error === "subscription_required");
}

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

// Should a run event apply to this thread's CURRENT run? Events from a
// replaced/stale run (old runId) are dropped so a new message cleanly takes
// over the UI. ts.runId is a sentinel between send and the 202 response.
function isStaleRun(ts: ThreadState, eventRunId: unknown): boolean {
  return Boolean(ts.runId && eventRunId && String(eventRunId) !== String(ts.runId));
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [threadStates, setThreadStates] = useState<Record<string, ThreadState>>({});
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [tokens, setTokens] = useState<TokenBalance | null>(null);
  const [unread, setUnread] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const abortRef = useRef<AbortController | null>(null);
  const sawFirstOpenRef = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const isOnThread = pathname !== "/chat";

  // Opening a thread clears its unread dot.
  useEffect(() => {
    const m = pathname.match(/^\/chat\/(.+)$/);
    if (!m) return;
    const id = m[1];
    setUnread((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, [pathname]);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/threads`, {
        headers: authHeaders(),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // Leftover admin JWT on a user endpoint — reset to phone login.
        if (handleAdminTokenMisuse(res.status, body)) return;
        if (isSubscriptionError(res.status, body)) {
          router.replace("/pricing");
          return;
        }
        return;
      }
      const json = await res.json();
      const fetched: Thread[] = json.data ?? json;
      setThreads(dedup(fetched));
    } catch {}
    finally {
      setThreadsLoaded(true);
    }
  }, [router]);

  // Token wallet balance. First call of the month also triggers the backend's
  // automatic grant. On failure keep the last known value (do not block chat).
  const refreshTokens = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/billing/tokens`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      if (json?.data && typeof json.data.enabled === "boolean") {
        setTokens(json.data as TokenBalance);
      }
    } catch {}
  }, []);

  // Silent push re-subscribe: permission already granted but no stored
  // endpoint (new device/cleared storage). No prompt is shown — the manual
  // opt-in stays in NotificationButton.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "granted") return;
    if (localStorage.getItem("push_endpoint")) return;
    (async () => {
      try {
        const keyRes = await fetch(`${BASE_URL}/notifications/vapid-public-key`, { headers: authHeaders() });
        const keyJson = await keyRes.json();
        const vapidKey = keyJson.data?.key ?? keyJson.key;
        if (!vapidKey) return;
        const reg = await navigator.serviceWorker.ready;
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey),
        });
        const sub = subscription.toJSON();
        await fetch(`${BASE_URL}/notifications/subscribe`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(sub),
        });
        localStorage.setItem("push_endpoint", sub.endpoint ?? "");
      } catch {}
    })();
  }, []);

  // One persistent SSE connection for the whole chat session. It lives above the
  // page so navigation between threads never tears it down — events are never
  // buffered server-side, so a closed socket means a lost run_complete. Auto-
  // reconnects on drop (onerror returns a retry delay). NOTE: device-id is not
  // sent here — best-effort fingerprinting lives on POSTs; SSE keeps Bearer only.
  useEffect(() => {
    loadThreads();
    refreshTokens();

    abortRef.current = new AbortController();
    const ctrl = abortRef.current;

    fetchEventSource(`${BASE_URL}/threads/stream`, {
      headers: { Authorization: `Bearer ${getToken()}` },
      signal: ctrl.signal,
      openWhenHidden: true,
      onopen: async () => {
        // Skip the first open (page mount already fetches). On every reconnect
        // after that, bump the nonce so the open thread re-fetches /messages for
        // catch-up before resuming live events.
        if (sawFirstOpenRef.current) {
          setReconnectNonce((n) => n + 1);
        } else {
          sawFirstOpenRef.current = true;
        }
      },
      onmessage(ev) {
        if (!ev.data) return;
        try {
          const data = JSON.parse(ev.data);
          switch (data.event) {
            case "thread_created":
              if (data.thread) {
                setThreads((prev) =>
                  dedup([data.thread, ...prev.filter((t) => String(t.id) !== String(data.thread.id))])
                );
              }
              break;

            case "tokens_debited":
              // Refetch instead of local subtraction — authoritative and simple.
              refreshTokens();
              break;

            case "answer_delta": {
              // Token-by-token final answer. Append per runId; a new runId
              // starts a fresh buffer. run_complete replaces the buffer with
              // the authoritative full reply (reconcile), so a lost delta
              // never corrupts the final message.
              const delta: string | undefined = data.delta;
              if (data.threadId != null && typeof delta === "string" && delta.length > 0) {
                setThreadStates((prev) =>
                  updateThreadState(prev, data.threadId, (ts) => {
                    if (isStaleRun(ts, data.runId)) return ts;
                    const sameRun = ts.streaming && ts.streaming.runId === (data.runId ?? null);
                    return {
                      ...ts,
                      streaming: {
                        runId: data.runId ?? null,
                        text: sameRun ? ts.streaming!.text + delta : delta,
                      },
                    };
                  })
                );
              }
              break;
            }

            case "tool_progress":
            case "step_summary": {
              // Append every intermediate update as a durable step item so none
              // get lost. tool_progress carries `message`, step_summary carries
              // `text`. Skip a consecutive duplicate of the same line.
              const line: string | undefined = data.text ?? data.message;
              if (data.threadId != null && line) {
                setThreadStates((prev) =>
                  updateThreadState(prev, data.threadId, (ts) => {
                    if (isStaleRun(ts, data.runId)) return ts;
                    const last = ts.messages[ts.messages.length - 1];
                    if (last && last.kind === "step" && last.content === line) return ts;
                    return {
                      ...ts,
                      messages: [
                        ...ts.messages,
                        {
                          id: crypto.randomUUID(),
                          role: "assistant",
                          content: line,
                          kind: "step",
                          runId: data.runId ?? null,
                        },
                      ],
                    };
                  })
                );
              }
              break;
            }

            case "run_complete":
              if (data.threadId != null) {
                setThreadStates((prev) =>
                  updateThreadState(prev, data.threadId, (ts) => {
                    if (isStaleRun(ts, data.runId)) return ts;
                    return {
                      ...ts,
                      messages: [
                        ...ts.messages,
                        {
                          id: crypto.randomUUID(),
                          role: "assistant",
                          content: data.reply ?? "",
                          kind: "message",
                          runId: data.runId ?? null,
                        },
                      ],
                      options: Array.isArray(data.options) ? data.options : [],
                      choices: Array.isArray(data.choices) ? data.choices : [],
                      loading: false,
                      runId: null,
                      error: null,
                      streaming: null,
                    };
                  })
                );
                // Unread dot for threads the user is not currently viewing.
                if (pathnameRef.current !== `/chat/${data.threadId}`) {
                  setUnread((prev) => new Set(prev).add(String(data.threadId)));
                }
                // bump thread to top of sidebar
                loadThreads();
              }
              break;

            case "run_error":
              if (data.threadId != null) {
                setThreadStates((prev) =>
                  updateThreadState(prev, data.threadId, (ts) => {
                    if (isStaleRun(ts, data.runId)) return ts;
                    return {
                      ...ts,
                      loading: false,
                      runId: null,
                      error: data.message ?? "Something went wrong.",
                      streaming: null,
                    };
                  })
                );
              }
              break;
          }
        } catch {}
      },
      onerror() {
        // reconnect after 4s; throwing here would stop retries
        return 4000;
      },
    });

    return () => ctrl.abort();
  }, [loadThreads, refreshTokens]);

  const createThread = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/threads`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        if (handleAdminTokenMisuse(res.status, body)) return;
        if (isSubscriptionError(res.status, body)) {
          router.replace("/pricing");
        }
        return;
      }
      const json = await res.json();
      const thread: Thread = json.data ?? json;
      setThreads((prev) => dedup([thread, ...prev.filter((t) => String(t.id) !== String(thread.id))]));
      router.push(`/chat/${thread.id}`);
    } catch {}
    finally {
      setCreating(false);
    }
  }, [router]);

  async function handleSignOut() {
    const token = getToken();
    const endpoint = localStorage.getItem("push_endpoint");
    if (token && endpoint) {
      try {
        await fetch(`${BASE_URL}/notifications/subscribe`, {
          method: "DELETE",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      localStorage.removeItem("push_endpoint");
    }
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  const filtered = threads.filter((th) =>
    (th.title ?? "").toLowerCase().includes(search.toLowerCase())
  );
  const incoming = filtered.filter((th) => th.type === "incoming_request");
  const mine = filtered.filter((th) => th.type !== "incoming_request");

  const user = getUserInfo();

  const sidebarClass = isOnThread
    ? "hidden md:flex"
    : "flex w-full md:flex";

  const mainClass = isOnThread
    ? "flex flex-1 flex-col min-w-0"
    : "hidden md:flex md:flex-1 md:flex-col";

  return (
    <ThreadsContext.Provider
      value={{ threads, setThreads, threadsLoaded, threadStates, setThreadStates, reconnectNonce, tokens, refreshTokens, createThread }}
    >
      <div className="flex h-full" style={{ background: "var(--bg)" }}>
        <aside
          className={`${sidebarClass} sidebar flex-col shrink-0 w-full md:w-[240px] lg:w-[268px]`}
          style={{
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--sidebar-border)",
            padding: "14px 12px 12px",
            gap: "12px",
          }}
        >
          {/* Logo row: avatar mark + wordmark, quick new-task on the right */}
          <div className="flex items-center justify-between pl-1">
            <div className="flex items-center gap-2">
              <span className="ally-avatar">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/ally/ally-avatar.jpg" alt="Netai" onError={(e) => { e.currentTarget.style.display = "none"; }} />
              </span>
              <span style={{ font: "500 20px/26px var(--font-bricolage)", color: "var(--ink)" }}>
                Netai
              </span>
            </div>
            <button
              onClick={createThread}
              disabled={creating}
              aria-label={t("newTask")}
              className="flex items-center justify-center transition-colors disabled:opacity-50"
              style={{ width: 28, height: 28, borderRadius: 8, color: "var(--ink-soft)", fontSize: "18px" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--skeleton)"; e.currentTarget.style.color = "var(--ink)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-soft)"; }}
            >
              +
            </button>
          </div>

          <button
            onClick={createThread}
            disabled={creating}
            className="btn-secondary w-full"
            style={{ padding: "9px 0" }}
          >
            + {creating ? "…" : t("newTask")}
          </button>

          <div
            className="flex items-center gap-2"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--header-border)",
              borderRadius: "var(--radius-pill)",
              padding: "8px 14px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.75" stroke="var(--meta)" strokeWidth="1.75" />
              <path d="M13 13l3.5 3.5" stroke="var(--meta)" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchTasks")}
              className="flex-1 bg-transparent outline-none"
              style={{ color: "var(--ink)", fontSize: "13px" }}
            />
          </div>

          {/* Lists */}
          <div className="flex-1 overflow-y-auto flex flex-col gap-[2px]">
            {!threadsLoaded ? (
              <div className="flex flex-col gap-2 pt-1">
                <p className="section-label" style={{ padding: "0 6px 4px" }}>{t("myTasks")}</p>
                <span className="sk-bar" style={{ width: "84%" }} />
                <span className="sk-bar" style={{ width: "70%" }} />
                <span className="sk-bar" style={{ width: "76%" }} />
                <span className="sk-bar" style={{ width: "62%" }} />
                <span className="sk-bar" style={{ width: "78%" }} />
              </div>
            ) : (
              <>
                {incoming.length > 0 && (
                  <section className="mb-1 flex flex-col gap-[2px]">
                    <p className="section-label" style={{ padding: "0 6px 4px" }}>{t("incomingRequests")}</p>
                    {incoming.map((th) => (
                      <RequestRow key={th.id} thread={th} active={pathname === `/chat/${th.id}`} />
                    ))}
                  </section>
                )}
                <section className="flex flex-col gap-[2px]">
                  {incoming.length > 0 && mine.length > 0 && (
                    <p className="section-label" style={{ padding: "0 6px 4px" }}>{t("myTasks")}</p>
                  )}
                  {mine.map((th) => (
                    <ThreadRow key={th.id} thread={th} active={pathname === `/chat/${th.id}`} unread={unread.has(String(th.id))} />
                  ))}
                  {threads.length === 0 && (
                    <p style={{ padding: "2px 6px", fontSize: "12px", color: "var(--meta)" }}>
                      {t("threadsHint")}
                    </p>
                  )}
                </section>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-2.5" style={{ borderTop: "1px solid var(--sidebar-border)", paddingTop: "10px" }}>
            <Link
              href="/profile"
              className="initial-avatar transition-opacity hover:opacity-80"
              style={{ width: 28, height: 28, fontSize: "12px" }}
            >
              {user.initial}
            </Link>
            <Link
              href="/profile"
              className="flex-1 truncate transition-opacity hover:opacity-70"
              style={{ color: "var(--ink)", fontWeight: 600, fontSize: "13px" }}
            >
              {user.name}
            </Link>
            <button
              onClick={handleSignOut}
              className="transition-colors"
              style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-soft)"; }}
            >
              {t("signOut")}
            </button>
          </div>
        </aside>

        <main className={mainClass}>{children}</main>
      </div>
    </ThreadsContext.Provider>
  );
}

function ThreadRow({ thread, active, unread }: { thread: Thread; active: boolean; unread: boolean }) {
  return (
    <Link
      href={`/chat/${thread.id}`}
      className="thread-row flex items-center transition-colors"
      style={{
        padding: "8px 10px",
        borderRadius: "var(--radius-row)",
        background: active ? "var(--thread-active-bg)" : undefined,
        boxShadow: active ? "inset 3px 0 0 var(--accent)" : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--skeleton)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ""; }}
    >
      <span
        className="flex-1 truncate"
        style={{ font: `${active || unread ? 600 : 500} 13px/18px var(--font-system)`, color: "var(--ink)" }}
      >
        {thread.type === "outgoing_request" && <span style={{ color: "var(--meta)", marginRight: "4px" }}>↑</span>}
        {thread.title ?? t("taskFallback")}
      </span>
      {unread && !active && (
        <span className="ml-2 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />
      )}
    </Link>
  );
}

function RequestRow({ thread, active }: { thread: Thread; active: boolean }) {
  return (
    <Link href={`/chat/${thread.id}`} className={`row-request${active ? " active" : ""}`}>
      <span className="req-chip">→</span>
      <span className="req-names">{thread.title ?? t("taskFallback")}</span>
    </Link>
  );
}
