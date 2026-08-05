"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { authHeaders, handleAdminTokenMisuse } from "@/lib/deviceId";
import { t, tf } from "@/lib/i18n";
import {
  ThreadsContext,
  updateThreadState,
  taskStatusOf,
  forceLogin,
  type Thread,
  type ThreadState,
  type TokenBalance,
  type TaskStatus,
} from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REQ_KEY = "netai_req_resolved";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

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
  return arr.filter((th) => {
    const key = String(th.id);
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

function isStaleRun(ts: ThreadState, eventRunId: unknown): boolean {
  return Boolean(ts.runId && eventRunId && String(eventRunId) !== String(ts.runId));
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function AnimBox({ status, size }: { status: TaskStatus; size: number }) {
  const clip =
    status === "needs_you" ? "ally-walk" :
    status === "failed" ? "ally-error" :
    status === "done" ? null :
    "ally-loading";
  if (!clip) return null;
  return (
    <span className="anim-box" style={{ width: size, height: size }}>
      <video
        autoPlay muted loop playsInline
        src={`/assets/ally/anim/${clip}.mp4`}
        poster={`/assets/ally/anim/${clip}-poster.jpg`}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    </span>
  );
}

function StatusPill({ status }: { status: TaskStatus }) {
  const label =
    status === "working" ? t("stWorking") :
    status === "waiting" ? t("stWaiting") :
    status === "needs_you" ? t("stNeedsYou") :
    status === "failed" ? t("stFailed") :
    t("stDone");
  return <span className={`task-pill ${status}`}>{label}</span>;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [threadStates, setThreadStates] = useState<Record<string, ThreadState>>({});
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [tokens, setTokens] = useState<TokenBalance | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [threadBumps, setThreadBumps] = useState<Record<string, number>>({});
  const [resolvedRequests, setResolvedRequests] = useState<Record<string, { action: string; at: number }>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [homeInput, setHomeInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const abortRef = useRef<AbortController | null>(null);
  const sawFirstOpenRef = useRef(false);
  const pathnameRef = useRef(pathname);
  const homeInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const threadsRef = useRef<Thread[]>([]);
  pathnameRef.current = pathname;
  threadsRef.current = threads;

  const isOnThread = pathname !== "/chat";

  useEffect(() => {
    setResolvedRequests(loadJson<Record<string, { action: string; at: number }>>(REQ_KEY, {}));
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/threads`, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) { forceLogin(); return; }
        const body = await res.json().catch(() => ({}));
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

  // Push subscribe: re-register on EVERY app open when permission is granted.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) return;
    if (Notification.permission !== "granted") return;
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
                  dedup([data.thread, ...prev.filter((th) => String(th.id) !== String(data.thread.id))])
                );
              }
              break;

            // Partial patch: merge only the fields that arrived. Also bumps the
            // thread so an open view refetches messages (task engine can write
            // without any user action — v68 #5).
            case "thread_updated": {
              const patch = data.thread;
              if (patch?.id != null) {
                setThreads((prev) =>
                  prev.map((th) => {
                    if (String(th.id) !== String(patch.id)) return th;
                    return {
                      ...th,
                      ...(patch.status !== undefined ? { status: patch.status } : null),
                      ...(patch.status_line !== undefined ? { status_line: patch.status_line } : null),
                      ...(patch.is_task !== undefined ? { is_task: patch.is_task } : null),
                      ...(patch.request_ref !== undefined ? { request_ref: patch.request_ref } : null),
                      ...(patch.title ? { title: patch.title } : null),
                    };
                  })
                );
                setThreadBumps((prev) => ({
                  ...prev,
                  [String(patch.id)]: (prev[String(patch.id)] ?? 0) + 1,
                }));
              }
              break;
            }

            case "tokens_debited":
              refreshTokens();
              break;

            case "answer_delta": {
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
                      result: data.result && typeof data.result === "object" ? data.result : null,
                    };
                  })
                );
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
        return 4000;
      },
    });

    return () => ctrl.abort();
  }, [loadThreads, refreshTokens]);

  const sendIntoThread = useCallback(async (threadId: string, text: string, echo: boolean) => {
    const sentinel = `pending-${crypto.randomUUID()}`;
    setThreadStates((prev) =>
      updateThreadState(prev, threadId, (ts) => ({
        ...ts,
        messages: echo
          ? [...ts.messages, { id: crypto.randomUUID(), role: "user" as const, content: text, kind: "message" as const, runId: null }]
          : ts.messages,
        options: [],
        choices: [],
        error: null,
        loading: true,
        runId: sentinel,
        streaming: null,
        result: null,
      }))
    );
    const res = await fetch(`${BASE_URL}/threads/${threadId}/message`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: text }),
    });
    if (res.status === 401) { forceLogin(); return; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.success === false) throw new Error(json.error ?? String(res.status));
    const runId: string | null = json.runId ?? json.data?.runId ?? null;
    setThreadStates((prev) =>
      updateThreadState(prev, threadId, (ts) => (ts.runId === sentinel ? { ...ts, runId } : ts))
    );
  }, []);

  const createThread = useCallback(async () => {
    homeInputRef.current?.focus();
  }, []);

  const createTask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/threads`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (!res.ok) {
        if (res.status === 401) { forceLogin(); return; }
        const body = await res.json().catch(() => ({}));
        if (handleAdminTokenMisuse(res.status, body)) return;
        if (isSubscriptionError(res.status, body)) {
          router.replace("/pricing");
        }
        return;
      }
      const json = await res.json();
      const thread: Thread = json.data ?? json;
      setThreads((prev) => dedup([thread, ...prev.filter((th) => String(th.id) !== String(thread.id))]));
      setTitles((prev) => ({
        ...prev,
        [String(thread.id)]: trimmed.length > 42 ? trimmed.slice(0, 42) + "…" : trimmed,
      }));
      setHomeInput("");
      router.push(`/chat/${thread.id}`);
      await sendIntoThread(String(thread.id), trimmed, true);
    } catch {}
    finally {
      setCreating(false);
    }
  }, [creating, router, sendIntoThread]);

  const resolveRequest = useCallback((threadId: string, action: "accept" | "deny" | "later") => {
    const next = { ...resolvedRequests, [threadId]: { action, at: Date.now() } };
    setResolvedRequests(next);
    try { localStorage.setItem(REQ_KEY, JSON.stringify(next)); } catch {}

    const unresolve = () => {
      setResolvedRequests((prev) => {
        const copy = { ...prev };
        delete copy[threadId];
        try { localStorage.setItem(REQ_KEY, JSON.stringify(copy)); } catch {}
        return copy;
      });
    };

    const ref = threadsRef.current.find((x) => String(x.id) === threadId)?.request_ref;
    const fallbackMsg = action === "accept" ? t("reqAcceptMsg") : action === "deny" ? t("reqDenyMsg") : t("reqLaterMsg");

    (async () => {
      for (let i = 0; i < 3; i++) {
        try {
          if (ref) {
            const path = action === "accept" ? "accept" : action === "deny" ? "decline" : "snooze";
            const res = await fetch(`${BASE_URL}/requests/${ref}/${path}`, {
              method: "POST",
              headers: authHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({}),
            });
            if (res.status === 401) { forceLogin(); return; }
            if (res.ok) return;
            if (res.status === 409) {
              const body = await res.json().catch(() => ({}));
              if (body?.error) showToast(body.error);
              return;
            }
            if (res.status === 404 || res.status === 400) { unresolve(); return; }
            throw new Error(String(res.status));
          } else {
            await sendIntoThread(threadId, fallbackMsg, true);
            return;
          }
        } catch {
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
      unresolve();
    })();
  }, [resolvedRequests, sendIntoThread, showToast]);

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

  function startHomeMic() {
    const SR = getSpeechRecognition();
    if (!SR) {
      homeInputRef.current?.focus();
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    setRecording(true);
    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? " " : "") + tr.trim();
        else interim += tr;
      }
      setHomeInput([finalText, interim.trim()].filter(Boolean).join(" "));
    };
    rec.onend = () => { recognitionRef.current = null; setRecording(false); };
    rec.onerror = () => { recognitionRef.current = null; setRecording(false); };
    rec.start();
  }

  // ---- Derived lists ----
  const now = Date.now();
  const visibleRequests = threads.filter((th) => {
    if (th.type !== "incoming_request") return false;
    const r = resolvedRequests[String(th.id)];
    if (!r) return true;
    if (r.action === "later") return now - r.at > SNOOZE_MS;
    return false;
  });

  // incoming_ask (v68): another user's assistant asking this user — plain
  // chat threads, shown with a badge, never treated as goals or legacy.
  const asks = threads.filter((th) => th.type === "incoming_ask");

  const goalThreads: { thread: Thread; status: TaskStatus }[] = [];
  const legacyThreads: Thread[] = [];
  for (const th of threads) {
    if (th.type === "incoming_request" || th.type === "incoming_ask") continue;
    const st = taskStatusOf(th, threadStates[String(th.id)]);
    if (st) goalThreads.push({ thread: th, status: st });
    else legacyThreads.push(th);
  }
  const active = goalThreads.filter((g) => g.status !== "done");
  const finished = goalThreads.filter((g) => g.status === "done");
  const presenceN = goalThreads.filter((g) => g.status === "working" || g.status === "waiting").length;

  const user = getUserInfo();

  const sidebarClass = isOnThread ? "hidden md:flex" : "flex w-full md:flex";
  const mainClass = isOnThread ? "flex flex-1 flex-col min-w-0" : "hidden md:flex md:flex-1 md:flex-col";

  function goalTitle(th: Thread): string {
    const backend = th.title;
    if (backend && backend !== "New task" && backend !== "ახალი დავალება" && backend !== "New chat") return backend;
    return titles[String(th.id)] || backend || t("taskFallback");
  }

  return (
    <ThreadsContext.Provider
      value={{
        threads, setThreads, threadsLoaded, threadStates, setThreadStates,
        reconnectNonce, tokens, refreshTokens, createThread, createTask,
        titles, resolveRequest, resolvedRequests, threadBumps,
      }}
    >
      <div className="flex h-full" style={{ background: "var(--bg)" }}>
        {toast && (
          <div className="toast" role="status" aria-live="polite">{toast}</div>
        )}
        <aside
          className={`${sidebarClass} sidebar flex-col shrink-0 w-full md:w-[300px] lg:w-[380px]`}
          style={{
            background: "var(--sidebar-bg)",
            borderRight: "1px solid var(--sidebar-border)",
            padding: "14px 12px 12px",
            gap: "12px",
          }}
        >
          <div className="flex items-center gap-2.5 pl-1">
            <span className="ally-avatar" style={{ width: 30, height: 30 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ally/ally-avatar.jpg" alt="Netai" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </span>
            <div className="flex flex-col min-w-0">
              <span style={{ font: "500 20px/24px var(--font-bricolage)", color: "var(--ink)" }}>
                Netai
              </span>
              <span style={{ font: "500 11.5px/15px var(--font-system)", color: "var(--accent)" }}>
                {presenceN > 0 ? tf("presenceWorking", { n: presenceN }) : t("presenceReady")}
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col gap-[3px]">
            {!threadsLoaded ? (
              <div className="flex flex-col gap-2 pt-1">
                <span className="sk-bar" style={{ width: "84%" }} />
                <span className="sk-bar" style={{ width: "70%" }} />
                <span className="sk-bar" style={{ width: "76%" }} />
                <span className="sk-bar" style={{ width: "62%" }} />
                <span className="sk-bar" style={{ width: "78%" }} />
              </div>
            ) : (
              <>
                {visibleRequests.length > 0 && (
                  <section className="mb-2 flex flex-col gap-2">
                    <p className="section-label" style={{ padding: "0 6px 2px" }}>{t("requestsLabel")}</p>
                    {visibleRequests.map((th) => (
                      <RequestActionRow
                        key={th.id}
                        thread={th}
                        resolved={resolvedRequests[String(th.id)]?.action}
                        onResolve={(a) => resolveRequest(String(th.id), a)}
                        active={pathname === `/chat/${th.id}`}
                      />
                    ))}
                  </section>
                )}

                {asks.length > 0 && (
                  <section className="mb-2 flex flex-col gap-[3px]">
                    <p className="section-label" style={{ padding: "0 6px 2px" }}>{t("asksLabel")}</p>
                    {asks.map((th) => (
                      <Link
                        key={th.id}
                        href={`/chat/${th.id}`}
                        className="task-row thread-row"
                        style={{
                          background: pathname === `/chat/${th.id}` ? "var(--thread-active-bg)" : undefined,
                          boxShadow: pathname === `/chat/${th.id}` ? "inset 3px 0 0 var(--request-accent)" : undefined,
                        }}
                        onMouseEnter={(e) => { if (pathname !== `/chat/${th.id}`) e.currentTarget.style.background = "var(--request-tint)"; }}
                        onMouseLeave={(e) => { if (pathname !== `/chat/${th.id}`) e.currentTarget.style.background = ""; }}
                      >
                        <span className="flex-1 truncate" style={{ font: "500 13.5px/18px var(--font-system)", color: "var(--ink)" }}>
                          {th.title || "…"}
                        </span>
                        <span className="task-pill needs_you">{t("askBadge")}</span>
                      </Link>
                    ))}
                  </section>
                )}

                <section className="flex flex-col gap-[3px]">
                  <p className="section-label" style={{ padding: "0 6px 2px" }}>{t("inProgress")}</p>
                  {active.map(({ thread, status }) => (
                    <TaskRow
                      key={thread.id}
                      title={goalTitle(thread)}
                      status={status}
                      href={`/chat/${thread.id}`}
                      active={pathname === `/chat/${thread.id}`}
                    />
                  ))}
                  {active.length === 0 && (
                    <p style={{ padding: "2px 6px", fontSize: "12px", color: "var(--meta)" }}>
                      {t("threadsHint")}
                    </p>
                  )}
                </section>

                {finished.length > 0 && (
                  <section className="mt-2 flex flex-col gap-[3px]" style={{ opacity: 0.65 }}>
                    <p className="section-label" style={{ padding: "0 6px 2px" }}>{t("finishedLabel")}</p>
                    {(showAllDone ? finished : finished.slice(0, 5)).map(({ thread, status }) => (
                      <TaskRow
                        key={thread.id}
                        title={goalTitle(thread)}
                        status={status}
                        href={`/chat/${thread.id}`}
                        active={pathname === `/chat/${thread.id}`}
                      />
                    ))}
                    {finished.length > 5 && !showAllDone && (
                      <button
                        onClick={() => setShowAllDone(true)}
                        className="self-start"
                        style={{ padding: "2px 6px", font: "600 12px/16px var(--font-system)", color: "var(--ink-soft)" }}
                      >
                        {t("viewAll")}
                      </button>
                    )}
                  </section>
                )}

                {legacyThreads.length > 0 && (
                  <section className="mt-3 flex flex-col gap-[2px]">
                    <button
                      onClick={() => setShowLegacy((v) => !v)}
                      className="self-start transition-colors"
                      style={{ padding: "2px 6px", font: "500 12.5px/17px var(--font-system)", color: "var(--meta)" }}
                    >
                      {t("legacyChats")}
                    </button>
                    {showLegacy && legacyThreads.map((th) => (
                      <Link
                        key={th.id}
                        href={`/chat/${th.id}`}
                        className="thread-row flex items-center transition-colors"
                        style={{
                          padding: "7px 10px",
                          borderRadius: "var(--radius-row)",
                          background: pathname === `/chat/${th.id}` ? "var(--thread-active-bg)" : undefined,
                          boxShadow: pathname === `/chat/${th.id}` ? "inset 3px 0 0 var(--accent)" : undefined,
                        }}
                      >
                        <span className="flex-1 truncate" style={{ font: "400 13px/18px var(--font-system)", color: "var(--ink-soft)" }}>
                          {th.title || "…"}
                        </span>
                      </Link>
                    ))}
                  </section>
                )}
              </>
            )}
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); createTask(homeInput); }}
            className="flex items-center gap-2"
          >
            <div
              className="composer-pill flex flex-1 items-center gap-2 min-w-0"
              style={{ padding: "6px 6px 6px 14px", borderColor: recording ? "var(--danger)" : undefined }}
            >
              <input
                ref={homeInputRef}
                type="text"
                value={homeInput}
                onChange={(e) => setHomeInput(e.target.value)}
                placeholder={recording ? t("listening") : t("homePlaceholder")}
                className="flex-1 min-w-0 bg-transparent outline-none"
                style={{ color: "var(--ink)", fontSize: "14px", padding: "6px 0" }}
                disabled={creating}
              />
              {homeInput.trim() && (
                <button
                  type="submit"
                  disabled={creating}
                  aria-label={t("newTask")}
                  className="flex shrink-0 items-center justify-center rounded-full"
                  style={{ width: 34, height: 34, background: "var(--accent)", color: "#FBFAF4" }}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={startHomeMic}
              aria-label="voice"
              className="flex shrink-0 items-center justify-center rounded-full transition-colors"
              style={{
                width: 44, height: 44,
                background: recording ? "var(--danger)" : "var(--accent)",
                color: "#FBFAF4",
              }}
            >
              <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
                <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 10a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="7" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </form>

          <div className="flex items-center gap-2.5" style={{ borderTop: "1px solid var(--sidebar-border)", paddingTop: "10px" }}>
            <Link href="/profile" className="initial-avatar transition-opacity hover:opacity-80" style={{ width: 28, height: 28, fontSize: "12px" }}>
              {user.initial}
            </Link>
            <Link href="/profile" className="flex-1 truncate transition-opacity hover:opacity-70" style={{ color: "var(--ink)", fontWeight: 600, fontSize: "13px" }}>
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

function TaskRow({ title, status, href, active }: { title: string; status: TaskStatus; href: string; active: boolean }) {
  const edge = status === "needs_you" ? "var(--request-accent)" : "var(--accent)";
  return (
    <Link
      href={href}
      className="task-row thread-row"
      style={{
        background: active ? "var(--thread-active-bg)" : undefined,
        boxShadow: active ? `inset 3px 0 0 ${edge}` : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--skeleton)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ""; }}
    >
      <span className="flex-1 truncate" style={{ font: `${active ? 600 : 500} 13.5px/18px var(--font-system)`, color: "var(--ink)" }}>
        {title}
      </span>
      <StatusPill status={status} />
      <AnimBox status={status} size={40} />
    </Link>
  );
}

function RequestActionRow({
  thread, resolved, onResolve, active,
}: {
  thread: Thread;
  resolved: string | undefined;
  onResolve: (a: "accept" | "deny" | "later") => void;
  active: boolean;
}) {
  const router = useRouter();
  const quote = thread.last_message?.replace(/\s+/g, " ").trim();
  const confirmation =
    resolved === "accept" ? t("reqAccepted") :
    resolved === "deny" ? t("reqDenied") :
    resolved === "later" ? t("reqSnoozed") : null;

  return (
    <div
      onClick={() => router.push(`/chat/${thread.id}`)}
      className="req-card cursor-pointer"
      style={{ boxShadow: active ? "inset 3px 0 0 var(--request-accent)" : undefined, opacity: confirmation ? 0.72 : 1 }}
    >
      <p style={{ font: "600 14.5px/20px var(--font-system)", color: "var(--ink)" }} className="truncate">
        {thread.title}
      </p>
      <p style={{ font: "400 13px/19px var(--font-bricolage)", color: "var(--ink-2)" }}>
        {t("reqAsksIntro")}
      </p>
      {quote && (
        <p
          className="line-clamp-2"
          style={{
            font: "400 12.5px/18px var(--font-system)", color: "var(--ink-2)",
            borderLeft: "2px solid var(--request-quote-bar)", paddingLeft: "10px",
            overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
          }}
        >
          {quote}
        </p>
      )}
      {confirmation ? (
        <p style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent-strong)" }}>{confirmation}</p>
      ) : (
        <div className="flex gap-2 pt-0.5">
          <button className="req-btn accept" onClick={(e) => { e.stopPropagation(); onResolve("accept"); }}>{t("reqAccept")}</button>
          <button className="req-btn deny" onClick={(e) => { e.stopPropagation(); onResolve("deny"); }}>{t("reqDeny")}</button>
          <button className="req-btn later" onClick={(e) => { e.stopPropagation(); onResolve("later"); }}>{t("reqLater")}</button>
        </div>
      )}
    </div>
  );
}
