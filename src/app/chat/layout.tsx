"use client";

import { useState, useEffect, useRef, useCallback, memo } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { authHeaders, handleAdminTokenMisuse } from "@/lib/deviceId";
import { t, tf, fmtDateShort } from "@/lib/i18n";
import { useUserName, clearUserName } from "@/lib/user";
import Modal from "@/components/Modal";
import {
  ThreadsContext,
  updateThreadState,
  taskStatusOf,
  forceLogin,
  PAGE_SIZE,
  type Thread,
  type ThreadState,
  type TokenBalance,
  type TaskStatus,
} from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const REQ_KEY = "netai_req_resolved";
const READ_KEY = "netai_last_read";
const COLLAPSE_KEY = "netai_sidebar_collapsed";
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
// FE-5 (30 Aug): the backend's snooze status_line, pushed via thread_updated
// to every device — the cross-device signal to hide a snoozed request.
const SNOOZE_STATUS_LINE = "გადადებულია";

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
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

function readChunk(data: Record<string, unknown>): string | null {
  for (const key of ["chunk", "delta", "text"]) {
    const v = data[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function fmtClock(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : fmtDateShort(d);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Row animation box. Memoized (22 Aug #7): list re-renders were recreating the
// <video> element (readyState back to 0, AbortError on play), freezing the
// character. With memo the element survives re-renders unless status/size
// change. The poster <img> underneath is the ANIM-rule fallback pair.
const AnimBox = memo(function AnimBox({ status, size }: { status: TaskStatus; size: number }) {
  const clip =
    status === "needs_you" ? "ally-walk" :
    status === "failed" ? "ally-error" :
    status === "done" ? null :
    "ally-loading";
  if (!clip) return null;
  return (
    <span className="anim-box" style={{ width: size, height: size, position: "relative" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="anim-fallback"
        src={`/assets/ally/anim/${clip}-poster.jpg`}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      <video
        autoPlay muted loop playsInline
        src={`/assets/ally/anim/${clip}.mp4`}
        poster={`/assets/ally/anim/${clip}-poster.jpg`}
        style={{ position: "relative", zIndex: 1 }}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    </span>
  );
});

// Badge lives only on needs_you (tester C.1); waiting keeps its quiet pill,
// working keeps green, done rows carry NO pill — the section already says it.
function StatusPill({ status }: { status: TaskStatus }) {
  if (status === "done") return null;
  const label =
    status === "working" ? t("stWorking") :
    status === "waiting" ? t("stWaiting") :
    status === "needs_you" ? t("stNeedsYou") :
    t("stFailed");
  return <span className={`task-pill ${status}`}>{label}</span>;
}

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [threadsHasMore, setThreadsHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [threadStates, setThreadStates] = useState<Record<string, ThreadState>>({});
  const [reconnectNonce, setReconnectNonce] = useState(0);
  const [tokens, setTokens] = useState<TokenBalance | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [threadBumps, setThreadBumps] = useState<Record<string, number>>({});
  const [resolvedRequests, setResolvedRequests] = useState<Record<string, { action: string; at: number }>>({});
  const [lastRead, setLastRead] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const [homeInput, setHomeInput] = useState("");
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  // 22 Aug #5: the header counter comes from GET /tasks/summary (open_goals) —
  // the same number the assistant reports. Local count stays as fallback only.
  const [openGoals, setOpenGoals] = useState<number | null>(null);
  // Ticket 6 #7/#14: design-system rename modal, opened by long-press or
  // right-click on a row.
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const abortRef = useRef<AbortController | null>(null);
  const sawFirstOpenRef = useRef(false);
  // FT-8 (2 Sept): ts.runId goes back to null the instant a run completes, so
  // isStaleRun() can no longer tell a genuine new run from the SAME
  // run_complete arriving twice (a reconnect replay, or the backend resending
  // after a dropped ack). A second delivery used to re-apply
  // data.choices/data.options verbatim — and when the replay's payload didn't
  // carry them, that wiped the buttons the user had just seen. Track the last
  // run_complete actually applied per thread and ignore an exact repeat.
  const lastCompletedRunIdRef = useRef<Record<string, string>>({});
  const pathnameRef = useRef(pathname);
  const homeInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const threadsRef = useRef<Thread[]>([]);
  const loadingMoreRef = useRef(false);
  // Unread baseline (ticket 6 #13): updated_at of every thread when it was
  // first seen. A thread is unread when its updated_at moves past what the
  // user last read (or past the baseline for never-opened threads).
  const knownIdsRef = useRef<Map<string, string> | null>(null);
  pathnameRef.current = pathname;
  threadsRef.current = threads;

  const isOnThread = pathname !== "/chat";
  const user = useUserName();

  useEffect(() => {
    setResolvedRequests(loadJson<Record<string, { action: string; at: number }>>(REQ_KEY, {}));
    setLastRead(loadJson<Record<string, string>>(READ_KEY, {}));
    setCollapsed(loadJson<boolean>(COLLAPSE_KEY, false));
  }, []);

  // 23 Aug #1: select-all must survive touch/long-press opening — onFocus
  // alone was collapsed by the events that follow the press.
  useEffect(() => {
    if (!renameTarget) return;
    const tm = setTimeout(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
        el.setSelectionRange(0, el.value.length);
      }
    }, 60);
    return () => clearTimeout(tm);
  }, [renameTarget]);

  function toggleCollapsed() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Opening a thread marks it read (up to its current updated_at); stays
  // marked while it keeps updating on screen.
  useEffect(() => {
    const m = pathname.match(/^\/chat\/(.+)$/);
    if (!m) return;
    const id = m[1];
    const th = threads.find((x) => String(x.id) === id);
    const stamp = th?.updated_at ?? new Date().toISOString();
    setLastRead((prev) => {
      if (prev[id] === stamp) return prev;
      const next = { ...prev, [id]: stamp };
      try { localStorage.setItem(READ_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [pathname, threads]);

  function isUnread(th: Thread): boolean {
    const id = String(th.id);
    if (pathname === `/chat/${id}`) return false;
    const read = lastRead[id];
    const baseline = knownIdsRef.current?.get(id);
    // The read watermark: whatever is newest between "opened it" and "it was
    // already there when the list first loaded".
    const watermark = [read, baseline].filter((x): x is string => Boolean(x)).sort().pop();
    if (watermark === undefined) {
      // Never opened, not in the first load: it arrived live — unread.
      return knownIdsRef.current !== null;
    }
    return Boolean(th.updated_at && th.updated_at > watermark);
  }

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/tasks/summary`, { headers: authHeaders() });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      const n = json?.data?.open_goals ?? json?.open_goals;
      if (typeof n === "number") setOpenGoals(n);
    } catch {}
  }, []);

  const loadThreads = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/threads?limit=${PAGE_SIZE}`, { headers: authHeaders() });
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
      setThreads((prev) => dedup([...fetched, ...prev]));
      if (fetched.length < PAGE_SIZE) setThreadsHasMore(false);
      if (!knownIdsRef.current) {
        knownIdsRef.current = new Map(fetched.map((th) => [String(th.id), th.updated_at ?? ""]));
      }
    } catch {}
    finally {
      setThreadsLoaded(true);
    }
  }, [router]);

  const loadMoreThreads = useCallback(async () => {
    if (loadingMoreRef.current || !threadsHasMore) return;
    // The cursor must be a regular conversation, never an open goal: the
    // first page is [open goals, any age] + [conversations], so the last row
    // is only a goal when the user has no conversations at all (then there
    // is nothing to page). If goals ever get mixed in elsewhere, pick the
    // last non-goal row here instead of the raw tail.
    const last = threadsRef.current[threadsRef.current.length - 1];
    if (!last?.updated_at) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const q = new URLSearchParams({
        limit: String(PAGE_SIZE),
        before: last.updated_at,
        before_id: String(last.id),
      });
      const res = await fetch(`${BASE_URL}/threads?${q.toString()}`, { headers: authHeaders() });
      if (!res.ok) {
        if (res.status === 401) forceLogin();
        return;
      }
      const json = await res.json();
      const older: Thread[] = json.data ?? json;
      if (older.length > 0) {
        setThreads((prev) => dedup([...prev, ...older]));
        // Older pages are history — never bold.
        older.forEach((th) => knownIdsRef.current?.set(String(th.id), th.updated_at ?? ""));
      }
      if (older.length < PAGE_SIZE) setThreadsHasMore(false);
    } catch {}
    finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [threadsHasMore]);

  function onListScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      loadMoreThreads();
    }
  }

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
    fetchSummary();

    // Push notifications (31 Aug): the server only knows to push once it
    // sees the SSE connection actually close. openWhenHidden used to keep
    // it open in the background indefinitely, so a backgrounded/closed tab
    // still looked "connected" and no push went out. Now the client closes
    // the connection itself the moment the tab is hidden, and reopens it
    // the moment it's visible again — the server sees a real disconnect
    // within the same tick, not after some idle timeout.
    function connect() {
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
                  fetchSummary();
                }
                break;

              case "thread_updated": {
                const patch = data.thread;
                if (patch?.id != null) {
                  // Stamp updated_at so unread detection sees the change even when
                  // the SSE patch doesn't carry a timestamp (ticket 6 #13).
                  const stamp = patch.updated_at ?? new Date().toISOString();
                  setThreads((prev) =>
                    prev.map((th) => {
                      if (String(th.id) !== String(patch.id)) return th;
                      return {
                        ...th,
                        updated_at: stamp,
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
                  fetchSummary();
                }
                break;
              }

              case "tokens_debited":
                refreshTokens();
                break;

              case "answer_delta": {
                const chunk = readChunk(data);
                if (data.threadId != null && chunk) {
                  setThreadStates((prev) =>
                    updateThreadState(prev, data.threadId, (ts) => {
                      if (isStaleRun(ts, data.runId)) return ts;
                      const sameRun = ts.streaming && ts.streaming.runId === (data.runId ?? null);
                      return {
                        ...ts,
                        streaming: {
                          runId: data.runId ?? null,
                          text: sameRun ? ts.streaming!.text + chunk : chunk,
                        },
                      };
                    })
                  );
                }
                break;
              }

              case "answer_reset":
                if (data.threadId != null) {
                  setThreadStates((prev) =>
                    updateThreadState(prev, data.threadId, (ts) => {
                      if (isStaleRun(ts, data.runId)) return ts;
                      return { ...ts, streaming: null };
                    })
                  );
                }
                break;

              case "tool_progress":
              case "step_summary": {
                const line: string | undefined = data.text ?? data.message;
                if (data.threadId != null && line) {
                  const isProgress = data.event === "tool_progress";
                  setThreadStates((prev) =>
                    updateThreadState(prev, data.threadId, (ts) => {
                      if (isStaleRun(ts, data.runId)) return ts;
                      const last = ts.messages[ts.messages.length - 1];
                      const dup = last && last.kind === "step" && last.content === line;
                      return {
                        ...ts,
                        progress: isProgress ? line : ts.progress,
                        messages: dup
                          ? ts.messages
                          : [
                              ...ts.messages,
                              {
                                id: crypto.randomUUID(),
                                role: "assistant",
                                content: line,
                                kind: "step",
                                runId: data.runId ?? null,
                                pending: true,
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
                  const tKey = String(data.threadId);
                  const rKey = data.runId != null ? String(data.runId) : null;
                  if (rKey && lastCompletedRunIdRef.current[tKey] === rKey) break;
                  if (rKey) lastCompletedRunIdRef.current[tKey] = rKey;
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
                            pending: true,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                        options: Array.isArray(data.options) ? data.options : [],
                        choices: Array.isArray(data.choices) ? data.choices : [],
                        loading: false,
                        runId: null,
                        error: null,
                        streaming: null,
                        progress: null,
                        result: data.result && typeof data.result === "object" ? data.result : null,
                      };
                    })
                  );
                  loadThreads();
                  fetchSummary();
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
                        progress: null,
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
    }

    connect();

    function onVisibilityChange() {
      if (document.hidden) {
        // Tear down now — an aborted signal is a clean close, not an error,
        // so fetchEventSource won't try to retry it.
        abortRef.current?.abort();
      } else {
        connect();
        loadThreads();
        refreshTokens();
        fetchSummary();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      abortRef.current?.abort();
    };
  }, [loadThreads, refreshTokens, fetchSummary]);

  const sendIntoThread = useCallback(async (threadId: string, text: string, echo: boolean) => {
    const sentinel = `pending-${crypto.randomUUID()}`;
    setThreadStates((prev) =>
      updateThreadState(prev, threadId, (ts) => ({
        ...ts,
        messages: echo
          ? [...ts.messages, { id: crypto.randomUUID(), role: "user" as const, content: text, kind: "message" as const, runId: null, pending: true, createdAt: new Date().toISOString() }]
          : ts.messages,
        options: [],
        choices: [],
        error: null,
        loading: true,
        runId: sentinel,
        streaming: null,
        progress: null,
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
    setCollapsed(false);
    homeInputRef.current?.focus();
    // Desktop composer lives in the main pane (ticket 6 #1) — ask it to focus.
    window.dispatchEvent(new Event("netai:focus-composer"));
  }, []);

  const createTask = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || creating) return;
    setCreating(true);
    setHomeInput("");
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
        setHomeInput(trimmed);
        return;
      }
      const json = await res.json();
      const thread: Thread = json.data ?? json;
      knownIdsRef.current?.set(String(thread.id), thread.updated_at ?? new Date().toISOString());
      setThreads((prev) => dedup([thread, ...prev.filter((th) => String(th.id) !== String(thread.id))]));
      setTitles((prev) => ({
        ...prev,
        [String(thread.id)]: trimmed.length > 42 ? trimmed.slice(0, 42) + "…" : trimmed,
      }));
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
    clearUserName();
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

  function openRename(th: Thread, fallbackTitle: string) {
    setRenameTarget({ id: String(th.id), title: th.title || fallbackTitle });
    setRenameValue(th.title || fallbackTitle);
  }

  async function saveRename() {
    if (!renameTarget || renameBusy) return;
    const trimmed = renameValue.trim().slice(0, 80);
    if (!trimmed || trimmed === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    setRenameBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/threads/${renameTarget.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.status === 401) { forceLogin(); return; }
      if (!res.ok) {
        showToast(t("renameFailed"));
        return;
      }
      setThreads((prev) =>
        prev.map((th) => (String(th.id) === renameTarget.id ? { ...th, title: trimmed } : th))
      );
      setRenameTarget(null);
    } catch {
      showToast(t("renameFailed"));
    } finally {
      setRenameBusy(false);
    }
  }

  // ---- Derived lists ----
  const now = Date.now();
  const q = searchQ.trim().toLowerCase();

  function goalTitle(th: Thread): string {
    const backend = th.title;
    if (backend && backend !== "New task" && backend !== "ახალი დავალება" && backend !== "New chat") return backend;
    return titles[String(th.id)] || backend || t("taskFallback");
  }

  const matches = (th: Thread) => !q || goalTitle(th).toLowerCase().includes(q) || (th.last_message ?? "").toLowerCase().includes(q);

  const visibleRequests = threads.filter((th) => {
    if (th.type !== "incoming_request" || !matches(th)) return false;
    // FE-5 (30 Aug): the backend now pushes the same thread_updated SSE event
    // (status_line "გადადებულია") to every open device on snooze, so hiding
    // on that server-driven field — not just the local resolvedRequests map
    // — is what keeps phone and desktop in sync.
    if (th.status_line === SNOOZE_STATUS_LINE) return false;
    const r = resolvedRequests[String(th.id)];
    if (!r) return true;
    if (r.action === "later") return now - r.at > SNOOZE_MS;
    return false;
  });

  // FE-3 (4 Sept): this list used to show every incoming_ask thread
  // regardless of status — a thread the assistant had already answered
  // (status: "done") stayed here forever with an "unanswered" badge, out of
  // sync with the API's own status field. done means it no longer needs you.
  const asks = threads.filter((th) => th.type === "incoming_ask" && th.status !== "done" && matches(th));

  const goalThreads: { thread: Thread; status: TaskStatus }[] = [];
  const legacyThreads: Thread[] = [];
  for (const th of threads) {
    if (th.type === "incoming_request" || th.type === "incoming_ask" || !matches(th)) continue;
    const st = taskStatusOf(th, threadStates[String(th.id)]);
    if (st) goalThreads.push({ thread: th, status: st });
    else legacyThreads.push(th);
  }
  const active = goalThreads.filter((g) => g.status !== "done");
  const finished = goalThreads.filter((g) => g.status === "done");
  // Header counter: /tasks/summary open_goals when available (22 Aug #5),
  // otherwise the local server-status count (ticket 6 #8).
  const localPresenceN = threads.filter(
    (th) => th.is_task === true && (th.status === "working" || th.status === "waiting")
  ).length;
  const presenceN = openGoals ?? localPresenceN;
  const nothingFound =
    q && visibleRequests.length === 0 && asks.length === 0 && active.length === 0 && finished.length === 0 && legacyThreads.length === 0;

  const sidebarClass = isOnThread ? "hidden md:flex" : "flex w-full md:flex";
  const mainClass = isOnThread ? "flex flex-1 flex-col min-w-0" : "hidden md:flex md:flex-1 md:flex-col";

  const renameModal = renameTarget && (
    <Modal onClose={() => setRenameTarget(null)}>
      <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>{t("modalRenameTitle")}</p>
      <input
        ref={renameInputRef}
        type="text"
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        value={renameValue}
        maxLength={80}
        onChange={(e) => setRenameValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") saveRename(); }}
        className="input-pill"
        placeholder={t("renamePrompt")}
      />
      <div className="flex justify-end gap-3">
        <button type="button" disabled={renameBusy} onClick={() => setRenameTarget(null)} className="btn-secondary disabled:opacity-50">
          {t("cancel")}
        </button>
        <button type="button" disabled={renameBusy || !renameValue.trim()} onClick={saveRename} className="btn-primary disabled:opacity-60">
          {t("save")}
        </button>
      </div>
    </Modal>
  );

  // Collapsed rail (desktop only — the drawer behaviour on phones is the route
  // split, collapse does not apply there). Keeps + AND the profile link
  // (ticket 6 #1); the composer itself lives in the main pane.
  if (collapsed) {
    return (
      <ThreadsContext.Provider
        value={{
          threads, setThreads, threadsLoaded, threadStates, setThreadStates,
          reconnectNonce, tokens, refreshTokens, createThread, createTask,
          titles, resolveRequest, resolvedRequests, threadBumps,
        }}
      >
        <div className="flex h-full" style={{ background: "var(--bg)" }}>
          {toast && <div className="toast" role="status" aria-live="polite">{toast}</div>}
          <aside
            className={`${sidebarClass} sidebar flex-col items-center shrink-0 w-full md:w-[56px]`}
            style={{
              background: "var(--sidebar-bg)",
              borderRight: "1px solid var(--sidebar-border)",
              padding: "14px 8px 12px",
              gap: "14px",
            }}
          >
            <button onClick={toggleCollapsed} aria-label="expand" className="ally-avatar" style={{ width: 30, height: 30, cursor: "pointer" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ally/ally-avatar.jpg" alt="Netai" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </button>
            <button
              onClick={() => { router.push("/chat"); window.dispatchEvent(new Event("netai:focus-composer")); }}
              aria-label={t("newTask")}
              className="flex items-center justify-center rounded-full"
              style={{ width: 32, height: 32, background: "var(--accent)", color: "#FBFAF4", fontSize: "18px" }}
            >
              +
            </button>
            <Link
              href="/profile"
              prefetch
              aria-label={t("profileLink")}
              title={t("profileLink")}
              className="initial-avatar mt-auto transition-opacity hover:opacity-80"
              style={{ width: 28, height: 28, fontSize: "12px" }}
            >
              {user.initial}
            </Link>
            <button
              onClick={toggleCollapsed}
              aria-label="expand sidebar"
              className="flex items-center justify-center rounded-lg transition-colors hover:bg-black/5"
              style={{ width: 32, height: 32, color: "var(--ink-soft)" }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M7.5 4l6 6-6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </aside>
          <main className={mainClass}>{children}</main>
          {renameModal}
        </div>
      </ThreadsContext.Provider>
    );
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
            <div className="flex min-w-0 flex-1 flex-col">
              <span style={{ font: "500 20px/24px var(--font-bricolage)", color: "var(--ink)" }}>
                Netai
              </span>
              <span style={{ font: "500 11.5px/15px var(--font-system)", color: "var(--accent)" }}>
                {presenceN > 0 ? tf("presenceWorking", { n: presenceN }) : t("presenceReady")}
              </span>
            </div>
            {/* Task 22 (d): new-goal button in the EXPANDED sidebar too — desktop
                and phone list alike. */}
            <button
              onClick={() => {
                router.push("/chat");
                homeInputRef.current?.focus();
                window.dispatchEvent(new Event("netai:focus-composer"));
              }}
              aria-label={t("newTask")}
              title={t("newTask")}
              className="flex items-center justify-center rounded-full"
              style={{ width: 28, height: 28, background: "var(--accent)", color: "#FBFAF4", fontSize: "16px", lineHeight: 1 }}
            >
              +
            </button>
            <button
              onClick={toggleCollapsed}
              aria-label="collapse sidebar"
              className="hidden md:flex items-center justify-center rounded-lg transition-colors hover:bg-black/5"
              style={{ width: 28, height: 28, color: "var(--ink-soft)" }}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none">
                <path d="M12.5 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          {/* Search over everything already loaded (E2). */}
          <div
            className="flex items-center gap-2"
            style={{
              background: "#FFFFFF",
              border: "1px solid var(--header-border)",
              borderRadius: "var(--radius-pill)",
              padding: "7px 12px",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <circle cx="8.5" cy="8.5" r="5.75" stroke="var(--meta)" strokeWidth="1.75" />
              <path d="M13 13l3.5 3.5" stroke="var(--meta)" strokeWidth="1.75" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder={t("searchGoals")}
              className="flex-1 min-w-0 bg-transparent outline-none"
              style={{ color: "var(--ink)", fontSize: "13px" }}
            />
            {searchQ && (
              <button onClick={() => setSearchQ("")} aria-label="clear" style={{ color: "var(--meta)", fontSize: "14px", lineHeight: 1 }}>
                ×
              </button>
            )}
          </div>

          <div
            className="flex-1 overflow-y-auto flex flex-col gap-[3px]"
            onScroll={onListScroll}
          >
            {!threadsLoaded ? (
              <div className="flex flex-col gap-2 pt-1">
                <span className="sk-bar" style={{ width: "84%" }} />
                <span className="sk-bar" style={{ width: "70%" }} />
                <span className="sk-bar" style={{ width: "76%" }} />
                <span className="sk-bar" style={{ width: "62%" }} />
                <span className="sk-bar" style={{ width: "78%" }} />
              </div>
            ) : nothingFound ? (
              <p style={{ padding: "8px 6px", fontSize: "12.5px", color: "var(--meta)" }}>
                {t("noMatches")}
              </p>
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
                        prefetch
                        className={`task-row thread-row${isUnread(th) ? " unread" : ""}`}
                        style={{
                          background: pathname === `/chat/${th.id}` ? "var(--thread-active-bg)" : undefined,
                          boxShadow: pathname === `/chat/${th.id}` ? "inset 3px 0 0 var(--request-accent)" : undefined,
                        }}
                        onMouseEnter={(e) => { if (pathname !== `/chat/${th.id}`) e.currentTarget.style.background = "var(--request-tint)"; }}
                        onMouseLeave={(e) => { if (pathname !== `/chat/${th.id}`) e.currentTarget.style.background = ""; }}
                      >
                        <span className="flex-1 truncate" style={{ font: `${isUnread(th) ? 700 : 500} 13.5px/18px var(--font-system)`, color: "var(--ink)" }}>
                          {th.title || "…"}
                        </span>
                        <span className="shrink-0" style={{ font: "400 11px/16px var(--font-system)", color: "var(--meta)" }}>
                          {fmtClock(th.updated_at)}
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
                      unread={isUnread(thread)}
                      onLongPress={() => openRename(thread, goalTitle(thread))}
                    />
                  ))}
                  {active.length === 0 && !q && (
                    <p style={{ padding: "2px 6px", fontSize: "12px", color: "var(--meta)" }}>
                      {t("threadsHint")}
                    </p>
                  )}
                </section>

                {finished.length > 0 && (
                  <section className="mt-2 flex flex-col gap-[3px]" style={{ opacity: 0.65 }}>
                    <p className="section-label" style={{ padding: "0 6px 2px" }}>{t("finishedLabel")}</p>
                    {(showAllDone || q ? finished : finished.slice(0, 5)).map(({ thread, status }) => (
                      <TaskRow
                        key={thread.id}
                        title={goalTitle(thread)}
                        status={status}
                        href={`/chat/${thread.id}`}
                        active={pathname === `/chat/${thread.id}`}
                        unread={isUnread(thread)}
                        onLongPress={() => openRename(thread, goalTitle(thread))}
                      />
                    ))}
                    {finished.length > 5 && !showAllDone && !q && (
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
                    {(showLegacy || !!q) && legacyThreads.map((th) => (
                      <Link
                        key={th.id}
                        href={`/chat/${th.id}`}
                        prefetch
                        className={`thread-row flex items-center transition-colors${isUnread(th) ? " unread" : ""}`}
                        style={{
                          padding: "7px 10px",
                          borderRadius: "var(--radius-row)",
                          background: pathname === `/chat/${th.id}` ? "var(--thread-active-bg)" : undefined,
                          boxShadow: pathname === `/chat/${th.id}` ? "inset 3px 0 0 var(--accent)" : undefined,
                        }}
                      >
                        <span className="flex-1 truncate" style={{ font: `${isUnread(th) ? 600 : 400} 13px/18px var(--font-system)`, color: "var(--ink-soft)" }}>
                          {th.title || "…"}
                        </span>
                      </Link>
                    ))}
                  </section>
                )}

                {loadingMore && (
                  <div className="flex flex-col gap-2 py-3">
                    <span className="sk-bar" style={{ width: "72%" }} />
                    <span className="sk-bar" style={{ width: "58%" }} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Mobile home composer — D20 (22 Aug): mic AND send together while
              text exists; mic stays available during typing. */}
          <form
            onSubmit={(e) => { e.preventDefault(); createTask(homeInput); }}
            className="flex items-center gap-2 md:hidden"
          >
            <div
              className="composer-pill flex flex-1 items-center gap-2 min-w-0"
              style={{ padding: "6px 14px", borderColor: recording ? "var(--danger)" : undefined }}
            >
              <input
                ref={homeInputRef}
                type="text"
                value={homeInput}
                onChange={(e) => setHomeInput(e.target.value)}
                placeholder={recording ? t("listening") : t("homePlaceholder")}
                className="flex-1 min-w-0 bg-transparent outline-none"
                style={{ color: "var(--ink)", fontSize: "14px", padding: "6px 0" }}
              />
            </div>
            <button
              type="button"
              onClick={startHomeMic}
              aria-label={recording ? t("voiceStop") : t("voiceStart")}
              className="flex shrink-0 items-center justify-center rounded-full transition-colors"
              style={{
                width: 44, height: 44,
                background: recording ? "var(--danger)" : "var(--accent)",
                color: "#FBFAF4",
              }}
            >
              {recording ? (
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <rect x="5" y="5" width="10" height="10" rx="1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
                  <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <path d="M4 10a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  <line x1="7" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              )}
            </button>
            {homeInput.trim() && !recording && (
              <button
                type="submit"
                aria-label={t("send")}
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{ width: 44, height: 44, background: "var(--accent)", color: "#FBFAF4" }}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </form>

          <div className="flex items-center gap-2.5" style={{ borderTop: "1px solid var(--sidebar-border)", paddingTop: "10px" }}>
            <Link href="/profile" prefetch className="initial-avatar transition-opacity hover:opacity-80" style={{ width: 28, height: 28, fontSize: "12px" }}>
              {user.initial}
            </Link>
            <Link href="/profile" prefetch className="flex-1 truncate transition-opacity hover:opacity-70" style={{ color: "var(--ink)", fontWeight: 600, fontSize: "13px" }}>
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
        {renameModal}
      </div>
    </ThreadsContext.Provider>
  );
}

function TaskRow({
  title, status, href, active, unread, onLongPress,
}: {
  title: string;
  status: TaskStatus;
  href: string;
  active: boolean;
  unread: boolean;
  onLongPress: () => void;
}) {
  const edge = status === "needs_you" ? "var(--request-accent)" : "var(--accent)";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);

  // Ticket 6 #14: long-press (550ms) on a row opens rename; the click that
  // follows the release is swallowed so the thread doesn't open.
  const startPress = () => {
    firedRef.current = false;
    timer.current = setTimeout(() => {
      firedRef.current = true;
      onLongPress();
    }, 550);
  };
  const cancelPress = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <Link
      href={href}
      prefetch
      className={`task-row thread-row${unread && !active ? " unread" : ""}`}
      style={{
        background: active ? "var(--thread-active-bg)" : undefined,
        boxShadow: active ? `inset 3px 0 0 ${edge}` : undefined,
      }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--skeleton)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = ""; }}
      onTouchStart={startPress}
      onTouchEnd={cancelPress}
      onTouchMove={cancelPress}
      onContextMenu={(e) => {
        // Ticket 7 #4: right-click (and the synthetic contextmenu some phones
        // fire on long-press) opens rename too.
        e.preventDefault();
        cancelPress();
        if (!firedRef.current) onLongPress();
      }}
      onClick={(e) => {
        if (firedRef.current) {
          e.preventDefault();
          firedRef.current = false;
        }
      }}
    >
      <span className="flex-1 truncate" style={{ font: `${active || unread ? 700 : 500} 13.5px/18px var(--font-system)`, color: "var(--ink)" }}>
        {title}
      </span>
      {unread && !active && (
        <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: "var(--accent)" }} />
      )}
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
      <div className="flex items-baseline justify-between gap-2">
        <p style={{ font: "600 14.5px/20px var(--font-system)", color: "var(--ink)" }} className="truncate">
          {thread.title}
        </p>
        {/* E20: when the request arrived. */}
        <span className="shrink-0" style={{ font: "400 11px/16px var(--font-system)", color: "var(--meta)" }}>
          {fmtClock(thread.updated_at)}
        </span>
      </div>
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
