"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import NotificationButton from "@/components/NotificationButton";
import { authHeaders, parseRetryAfter } from "@/lib/deviceId";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";
import { t, tf, stripEmoji } from "@/lib/i18n";
import {
  useThreads,
  updateThreadState,
  taskStatusOf,
  forceLogin,
  DEFAULT_THREAD_STATE,
  type ChatMessage,
  type TaskStatus,
} from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SUPPORTED_LANGS = [
  "en-US", "en-GB", "es-ES", "fr-FR", "de-DE",
  "it-IT", "pt-BR", "ja-JP", "ko-KR", "zh-CN",
  "ru-RU", "ar-SA",
];

function detectLang(): string {
  if (typeof navigator === "undefined") return "en-US";
  const nav = navigator.language;
  if (SUPPORTED_LANGS.includes(nav)) return nav;
  const base = nav.split("-")[0];
  return SUPPORTED_LANGS.find((l) => l.startsWith(base)) ?? "en-US";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

type VoiceState = "idle" | "recording" | "processing";

type TopupPackage = {
  id: number;
  paddlePriceId: string;
  tokens: number;
  label: string;
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function getUserInitial(): string {
  try {
    const token = getToken();
    if (!token) return "M";
    const payload = JSON.parse(atob(token.split(".")[1]));
    const name: string = payload.name || payload.phone || "M";
    return name.charAt(0).toUpperCase();
  } catch {
    return "M";
  }
}

function nextRenewalDate(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function fmtTokens(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function renderStepText(text: string): React.ReactNode {
  const parts = stripEmoji(text).split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

type RenderBlock =
  | { type: "message"; msg: ChatMessage }
  | { type: "steps"; steps: ChatMessage[]; trailing: boolean };

function toBlocks(messages: ChatMessage[]): RenderBlock[] {
  const blocks: RenderBlock[] = [];
  let i = 0;
  while (i < messages.length) {
    if (messages[i].kind === "step") {
      const steps: ChatMessage[] = [];
      while (i < messages.length && messages[i].kind === "step") {
        steps.push(messages[i]);
        i++;
      }
      blocks.push({ type: "steps", steps, trailing: i === messages.length });
    } else {
      blocks.push({ type: "message", msg: messages[i] });
      i++;
    }
  }
  return blocks;
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ marginBottom: "10px" }} className="last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  hr: () => <hr style={{ height: "1px", background: "var(--header-border)", border: 0, margin: "12px 0" }} />,
  ol: ({ children }: { children?: React.ReactNode }) => <ol style={{ paddingLeft: "20px", marginBottom: "10px", listStyleType: "decimal" }} className="space-y-1 last:mb-0">{children}</ol>,
  ul: ({ children }: { children?: React.ReactNode }) => <ul style={{ paddingLeft: "20px", marginBottom: "10px", listStyleType: "disc" }} className="space-y-1 last:mb-0">{children}</ul>,
  li: ({ children }: { children?: React.ReactNode }) => <li>{children}</li>,
};

function AllyAvatar() {
  return (
    <span className="ally-avatar" style={{ marginTop: "2px" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/assets/ally/ally-avatar.jpg" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
    </span>
  );
}

function AllyAnim({ clip, size, loop = true }: { clip: string; size?: "thinking" | "e3" | "inline"; loop?: boolean }) {
  const cls = size ? ` size-${size}` : "";
  return (
    <>
      <video
        className={`ally-anim${cls}`}
        autoPlay
        muted
        loop={loop}
        playsInline
        src={`/assets/ally/anim/${clip}.mp4`}
        poster={`/assets/ally/anim/${clip}-poster.jpg`}
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={`ally-anim-fallback${cls}`}
        src={`/assets/ally/anim/${clip}-poster.jpg`}
        alt=""
        onError={(e) => { e.currentTarget.style.display = "none"; }}
      />
    </>
  );
}

function workingClip(stepCount: number): string {
  if (stepCount === 0) return "ally-thinking";
  const clips = ["ally-loading", "ally-walk", "ally-slow"];
  return clips[Math.floor(stepCount / 3) % clips.length];
}

type LoadPhase = "loading" | "slow" | "failed" | "done";

function extractQuote(text: string): string | null {
  const m = text.match(/[„"«“]([^“”"»]{10,300})[“”"»]/);
  return m ? m[1].trim() : null;
}

// System-style error block (F1): distinct background, no emoji, never an
// assistant bubble. Used for BOTH persisted kind:'error' rows and live
// run_error — the two must look identical.
function ErrorBlock({ text, onRetry }: { text: string; onRetry: (() => void) | null }) {
  return (
    <div className="flex items-start" style={{ gap: "10px" }}>
      <div className="flex items-center" style={{ flex: "none" }}>
        <AllyAnim clip="ally-error" size="inline" />
      </div>
      <div className="flex flex-col gap-2" style={{ flex: 1, minWidth: 0 }}>
        <div
          className="px-4 py-3"
          style={{
            background: "var(--terra-tint)",
            color: "var(--danger)",
            fontSize: "14px",
            borderRadius: "var(--radius-tile)",
          }}
        >
          {text}
        </div>
        {onRetry && (
          <button type="button" onClick={onRetry} className="btn-secondary self-start">
            {t("retry")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.id as string;
  const router = useRouter();
  const {
    threads, threadStates, setThreadStates, reconnectNonce, tokens, refreshTokens,
    titles, resolveRequest, resolvedRequests, threadBumps,
  } = useThreads();

  const st = threadStates[threadId] ?? DEFAULT_THREAD_STATE;
  const { messages, options, choices, loading, error, streaming, result } = st;

  const [input, setInput] = useState("");
  const [loadPhase, setLoadPhase] = useState<LoadPhase>(st.loaded ? "done" : "loading");
  const [fetchNonce, setFetchNonce] = useState(0);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const rateLimited = rateLimitedUntil > Date.now();
  const [limitHit, setLimitHit] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const packagesFetchedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const inputBeforeRecordingRef = useRef("");
  const confirmedTranscriptRef = useRef("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceRef = useRef<number | null>(null);

  const thread = threads.find((th) => String(th.id) === threadId);
  const userInitial = getUserInitial();
  const isRequest = thread?.type === "incoming_request";
  const taskStatus: TaskStatus | null = thread ? taskStatusOf(thread, st) : null;
  const statusLine = thread?.status_line ?? null;

  const tokensEnabled = tokens?.enabled === true;
  const isTrialWallet = tokensEnabled && tokens.grantedThisPeriod === 120;
  const remainingPct =
    tokensEnabled && tokens.grantedThisPeriod > 0
      ? Math.max(0, tokens.balance) / tokens.grantedThisPeriod
      : null;
  const lowBalance = remainingPct !== null && remainingPct <= 0.05;

  const streamingActive = loading && !!streaming && streaming.text.length > 0;

  // v68 #5: the task engine can write into the thread without any user
  // action — thread_updated bumps this counter, and an open, idle thread
  // refetches its messages.
  const bump = threadBumps[threadId] ?? 0;
  const prevBumpRef = useRef(bump);
  useEffect(() => {
    if (bump !== prevBumpRef.current) {
      prevBumpRef.current = bump;
      if (!loading) setFetchNonce((n) => n + 1);
    }
  }, [bump, loading]);

  useEffect(() => {
    setSpeechSupported(!!getSpeechRecognition());
  }, []);

  useEffect(() => {
    if (tokensEnabled) balanceRef.current = tokens.balance;
  }, [tokensEnabled, tokens]);

  useEffect(() => {
    if (limitHit && tokensEnabled && tokens.balance > 0) {
      setLimitHit(false);
    }
  }, [limitHit, tokensEnabled, tokens]);

  useEffect(() => {
    if (!tokensEnabled || isTrialWallet || packagesFetchedRef.current) return;
    packagesFetchedRef.current = true;
    fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
      })
      .catch(() => {});
  }, [tokensEnabled, isTrialWallet]);

  useEffect(() => {
    const off = onCheckoutCompleted(() => {
      const startBalance = balanceRef.current ?? 0;
      let ticks = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(() => {
        ticks++;
        refreshTokens();
        if ((balanceRef.current ?? 0) > startBalance || ticks >= 15) {
          if ((balanceRef.current ?? 0) > startBalance) {
            showToast(t("tokensAdded"), true);
          }
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    });
    return () => {
      off();
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTokens]);

  async function buyPackage(pkg: TopupPackage) {
    try {
      await ensurePaddle();
      openCheckout(pkg.paddlePriceId);
    } catch {
      showToast(t("paymentWindowFailed"), false);
    }
  }

  useEffect(() => {
    if (remainingPct === null || remainingPct > 0.2 || remainingPct <= 0.05) return;
    const key = `token_warn20_${new Date().getFullYear()}-${new Date().getMonth() + 1}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    showToast(t("tokensLow"), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remainingPct]);

  useEffect(() => {
    if (rateLimitedUntil <= 0) return;
    const ms = rateLimitedUntil - Date.now();
    if (ms <= 0) {
      setRateLimitedUntil(0);
      return;
    }
    const tm = setTimeout(() => setRateLimitedUntil(0), ms);
    return () => clearTimeout(tm);
  }, [rateLimitedUntil]);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2400);
  }

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast(t("linkCopied"), true);
    } catch {}
  }

  // v68 #3: stop a running task. Idempotent server-side; the status flips to
  // done via thread_updated — no local state change needed here.
  async function stopTask() {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await fetch(`${BASE_URL}/tasks/${threadId}/stop`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (res.status === 401) { forceLogin(); return; }
      if (!res.ok) showToast(t("stopFailed"), false);
    } catch {
      showToast(t("stopFailed"), false);
    } finally {
      setStopping(false);
    }
  }

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setVoiceState("idle");
        setInput(inputBeforeRecordingRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  function stopRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }

  function startRecognition() {
    const SR = getSpeechRecognition();
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = detectLang();
    recognition.continuous = true;
    recognition.interimResults = true;

    inputBeforeRecordingRef.current = input;
    confirmedTranscriptRef.current = "";
    recognitionRef.current = recognition;
    setVoiceState("recording");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) {
          confirmedTranscriptRef.current += (confirmedTranscriptRef.current ? " " : "") + tr.trim();
        } else {
          interim += tr;
        }
      }
      const base = inputBeforeRecordingRef.current;
      const combined = [
        confirmedTranscriptRef.current,
        interim.trim(),
      ].filter(Boolean).join(" ");
      const joined = base ? base + " " + combined : combined;
      setInput(joined);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceState("idle");
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      recognitionRef.current = null;
      setVoiceState("idle");
      if (e.error === "not-allowed") {
        showToast(t("micNotAllowed"), false);
        setInput(inputBeforeRecordingRef.current);
      } else if (e.error === "network") {
        showToast(t("netRequired"), false);
        setInput(inputBeforeRecordingRef.current);
      }
    };

    recognition.start();
  }

  function handleMicClick() {
    if (voiceState === "recording") {
      stopRecognition();
    } else if (voiceState === "idle") {
      startRecognition();
    }
  }

  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    setLoadPhase("loading");
    const slowTimer = setTimeout(() => {
      if (!cancelled) setLoadPhase((p) => (p === "loading" ? "slow" : p));
    }, 8000);

    fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      headers: authHeaders(),
    })
      .then((r) => {
        if (r.status === 401) { forceLogin(); throw new Error("401"); }
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        const raw: Array<{
          role: string;
          content: string;
          kind?: string;
          run_id?: string | null;
        }> = json.data ?? json;
        const hydrated: ChatMessage[] = (Array.isArray(raw) ? raw : []).map((m) => ({
          id: crypto.randomUUID(),
          role: m.role as "user" | "assistant",
          content: m.content,
          kind: m.kind === "step" ? "step" : m.kind === "error" ? "error" : "message",
          runId: m.run_id ?? null,
        }));
        setThreadStates((prev) =>
          updateThreadState(prev, threadId, (ts) => ({
            ...ts,
            messages: hydrated,
            loaded: true,
          }))
        );
        setLoadPhase("done");
      })
      .catch(() => {
        if (!cancelled) setLoadPhase("failed");
      })
      .finally(() => {
        clearTimeout(slowTimer);
      });

    return () => {
      cancelled = true;
      clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, reconnectNonce, fetchNonce]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, error, streaming, result]);

  const sendMessage = useCallback(
    async (text: string, echo: boolean = true) => {
      if (voiceState === "recording") {
        stopRecognition();
      }
      const trimmed = text.trim();
      if (!trimmed || rateLimitedUntil > Date.now() || limitHit) return;

      const sentinel = `pending-${crypto.randomUUID()}`;
      setThreadStates((prev) =>
        updateThreadState(prev, threadId, (ts) => ({
          ...ts,
          messages: echo
            ? [
                ...ts.messages,
                {
                  id: crypto.randomUUID(),
                  role: "user",
                  content: trimmed,
                  kind: "message",
                  runId: null,
                },
              ]
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
      setInput("");

      try {
        const res = await fetch(`${BASE_URL}/threads/${threadId}/message`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ message: trimmed }),
        });

        if (res.status === 401) { forceLogin(); return; }

        if (res.status === 402) {
          const body = await res.json().catch(() => ({}));
          if (body.reason === "insufficient_tokens") {
            setLimitHit(true);
            refreshTokens();
            setThreadStates((prev) =>
              updateThreadState(prev, threadId, (ts) => ({ ...ts, loading: false, runId: null }))
            );
            return;
          }
        }

        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          const secs = parseRetryAfter(res);
          showToast(body.error ?? t("rateLimitedToast"), false);
          setRateLimitedUntil(Date.now() + secs * 1000);
          setThreadStates((prev) =>
            updateThreadState(prev, threadId, (ts) => ({ ...ts, loading: false, runId: null }))
          );
          return;
        }

        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
          throw new Error(json.error ?? `Request failed with status ${res.status}`);
        }
        const runId: string | null = json.runId ?? json.data?.runId ?? null;
        setThreadStates((prev) =>
          updateThreadState(prev, threadId, (ts) =>
            ts.runId === sentinel ? { ...ts, runId } : ts
          )
        );
      } catch (err) {
        setThreadStates((prev) =>
          updateThreadState(prev, threadId, (ts) => ({
            ...ts,
            loading: false,
            runId: null,
            error: err instanceof Error ? err.message : t("genericError"),
          }))
        );
      } finally {
        inputRef.current?.focus();
      }
    },
    [threadId, voiceState, setThreadStates, rateLimitedUntil, limitHit, refreshTokens]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const blocks = toBlocks(messages);
  const lastMsg = messages[messages.length - 1];
  const lastIsAssistantMessage = lastMsg?.kind === "message" && lastMsg.role === "assistant";
  const showOptions = !loading && lastIsAssistantMessage && options.length > 0;
  const showChoices = !loading && lastIsAssistantMessage && choices.length > 0;
  const composerBlocked = rateLimited || limitHit;
  const lastUserText = [...messages].reverse().find((m) => m.kind === "message" && m.role === "user")?.content;

  const showInitialLoad = loadPhase !== "done" && messages.length === 0;

  const trailingSteps = (() => {
    let n = 0;
    for (let i = messages.length - 1; i >= 0 && messages[i].kind === "step"; i--) n++;
    return n;
  })();

  const firstAssistant = isRequest ? messages.find((m) => m.kind === "message" && m.role === "assistant") : undefined;
  const reqQuote = firstAssistant ? extractQuote(firstAssistant.content) : null;
  const reqNames = isRequest && thread?.title.includes("→")
    ? thread.title.split("→").map((s) => s.trim())
    : null;
  const reqResolved = resolvedRequests[threadId]?.action;

  const statusLabel = taskStatus
    ? taskStatus === "working" ? t("stWorking")
      : taskStatus === "waiting" ? t("stWaiting")
      : taskStatus === "needs_you" ? t("stNeedsYou")
      : taskStatus === "failed" ? t("stFailed")
      : t("stDone")
    : null;

  const displayTitle = titles[threadId] && (thread?.title === "New task" || thread?.title === "ახალი დავალება" || !thread?.title)
    ? titles[threadId]
    : thread?.title ?? t("threadFallback");

  const resultRows: Array<{ key: "who" | "when" | "where" | "topic"; label: string }> = [
    { key: "who", label: t("rWho") },
    { key: "when", label: t("rWhen") },
    { key: "where", label: t("rWhere") },
    { key: "topic", label: t("rTopic") },
  ];

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast.ok && <span>✓</span>}
          {toast.msg}
        </div>
      )}

      <header
        className="thread-header flex items-center"
        style={{
          padding: "10px 24px",
          gap: "14px",
          borderBottom: "1px solid var(--header-border)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.push("/chat")}
          className="md:hidden rounded-lg p-1.5 transition-colors hover:bg-black/5"
          aria-label="back"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="flex-1 min-w-0 flex flex-col">
          <span
            className="title truncate"
            style={{ font: "500 17px/22px var(--font-bricolage)", color: "var(--ink)" }}
          >
            {isRequest && reqNames ? (
              <>
                {reqNames[0]} <span style={{ color: "var(--request-accent)" }}>→</span> {reqNames[1]}
              </>
            ) : (
              displayTitle
            )}
          </span>
          {statusLabel && (
            <span style={{ font: "600 11px/15px var(--font-system)", color: taskStatus === "needs_you" || taskStatus === "failed" ? "var(--request-accent)" : "var(--ink-soft)" }}>
              {statusLabel}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* v68 #3: stop a live goal — status flips via thread_updated */}
          {thread?.is_task === true && taskStatus && taskStatus !== "done" && (
            <button
              onClick={stopTask}
              disabled={stopping}
              className="transition-colors disabled:opacity-50"
              style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-soft)"; }}
            >
              {t("stopGoal")}
            </button>
          )}
          {tokensEnabled && (
            <span className={`token-badge${lowBalance ? " low" : ""}`}>
              <i className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: lowBalance ? "var(--request-accent)" : "var(--accent)", display: "inline-block" }} />
              <span className="count">
                {fmtTokens(Math.max(0, tokens.balance))}{lowBalance ? ` · ${t("lowSuffix")}` : ""}
              </span>
            </span>
          )}
          <NotificationButton />
          <button
            onClick={handleShare}
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}
            className="hidden sm:block transition-colors hover:text-[var(--ink)]"
          >
            {t("share")}
          </button>
          <div className="initial-avatar shrink-0" style={{ width: 30, height: 30, fontSize: "12px" }}>
            {userInitial}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        {showInitialLoad ? (
          loadPhase === "slow" || loadPhase === "failed" ? (
            <div className="empty h-full">
              <AllyAnim clip={loadPhase === "failed" ? "ally-error" : "ally-slow"} size="e3" />
              <h2>{loadPhase === "failed" ? t("loadFailed") : t("takingLonger")}</h2>
              {loadPhase === "slow" && <p>{t("stillOnIt")}</p>}
              <button type="button" className="btn-secondary" onClick={() => setFetchNonce((n) => n + 1)}>
                {t("retry")}
              </button>
            </div>
          ) : (
            <div>
              <div className="flex justify-center pt-8">
                <AllyAnim clip="ally-loading" />
              </div>
              <div className="sk-thread">
                <span className="sk-bubble right" style={{ width: "46%" }} />
                <div className="sk-ally">
                  <span className="sk-dot" style={{ width: 26, height: 26 }} />
                  <div>
                    <span className="sk-bar" style={{ width: "72%" }} />
                    <span className="sk-bar" style={{ width: "64%" }} />
                    <span className="sk-bar" style={{ width: "40%" }} />
                  </div>
                </div>
                <span className="sk-bubble right" style={{ width: "28%", height: 30 }} />
              </div>
            </div>
          )
        ) : (
          <div
            className="messages mx-auto flex flex-col"
            style={{ maxWidth: "720px", padding: "26px 24px", gap: "18px" }}
          >
            {taskStatus && messages.length > 0 && (
              <div className="card flex items-center gap-3" style={{ padding: "12px 14px", maxWidth: "520px" }}>
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className={`task-pill ${taskStatus}`} style={{ alignSelf: "flex-start" }}>{statusLabel}</span>
                  {statusLine && taskStatus !== "working" && (
                    <span className="truncate" style={{ font: "400 12.5px/18px var(--font-system)", color: taskStatus === "needs_you" ? "var(--request-accent)" : "var(--ink-soft)", fontWeight: taskStatus === "needs_you" ? 600 : 400 }}>
                      {statusLine}
                    </span>
                  )}
                </div>
                <span className="anim-box" style={{ width: 56, height: 56 }}>
                  {taskStatus !== "done" && (
                    <video
                      autoPlay muted loop playsInline
                      src={`/assets/ally/anim/${taskStatus === "needs_you" ? "ally-walk" : taskStatus === "failed" ? "ally-error" : "ally-loading"}.mp4`}
                      onError={(e) => { e.currentTarget.style.display = "none"; }}
                    />
                  )}
                </span>
              </div>
            )}

            {messages.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                <span className="ally-avatar" style={{ width: 44, height: 44 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/assets/ally/ally-avatar.jpg" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                </span>
                <p style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{t("hiIntro")}</p>
                <p style={{ fontSize: "14px", color: "var(--ink-soft)" }}>
                  {t("giveTaskEmpty")}
                </p>
              </div>
            )}

            {blocks.map((block, bi) => {
              if (block.type === "steps") {
                return (
                  <StepGroup
                    key={`steps-${bi}`}
                    steps={block.steps}
                  />
                );
              }
              const msg = block.msg;
              if (msg.kind === "error") {
                return (
                  <ErrorBlock
                    key={msg.id}
                    text={msg.content || t("genericError")}
                    onRetry={lastUserText ? () => sendMessage(lastUserText, false) : null}
                  />
                );
              }
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex justify-end">
                    <div
                      className="msg-user whitespace-pre-wrap"
                      style={{
                        alignSelf: "flex-end",
                        maxWidth: "74%",
                        background: "var(--user-bubble-bg)",
                        color: "var(--ink)",
                        padding: "12px 16px",
                        borderRadius: "16px 16px 4px 16px",
                        font: "400 15px/22px var(--font-system)",
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              }
              const isFirstAssistant = firstAssistant && msg.id === firstAssistant.id;
              return (
                <div key={msg.id} className="flex flex-col gap-3">
                  <div className="flex items-start" style={{ gap: "10px" }}>
                    <AllyAvatar />
                    <div className="msg-ally" style={{ font: "400 17px/27px var(--font-bricolage)", color: "var(--ink)", flex: 1, minWidth: 0 }}>
                      <ReactMarkdown components={markdownComponents}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                  {isFirstAssistant && isRequest && (reqNames || reqQuote) && (
                    <div style={{ marginLeft: "36px" }} className="flex flex-col gap-2">
                      <div className="request-card">
                        <div className="rc-label">{t("introRequestLabel")}</div>
                        {reqNames && (
                          <div className="rc-names">
                            <span>{reqNames[0]}</span><b>→</b><span>{reqNames[1]}</span>
                          </div>
                        )}
                        {reqQuote && <blockquote className="rc-quote">„{reqQuote}“</blockquote>}
                      </div>
                      {!reqResolved && (
                        <div className="flex gap-2">
                          <button className="req-btn accept" onClick={() => resolveRequest(threadId, "accept")}>{t("reqAccept")}</button>
                          <button className="req-btn deny" onClick={() => resolveRequest(threadId, "deny")}>{t("reqDeny")}</button>
                          <button className="req-btn later" onClick={() => resolveRequest(threadId, "later")}>{t("reqLater")}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {streamingActive && (
              <div className="flex items-start" style={{ gap: "10px" }}>
                <AllyAvatar />
                <div className="msg-ally" style={{ font: "400 17px/27px var(--font-bricolage)", color: "var(--ink)", flex: 1, minWidth: 0 }}>
                  <ReactMarkdown components={markdownComponents}>
                    {streaming!.text}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {!loading && result && resultRows.some((r) => result[r.key]) && (
              <div className="flex flex-col items-start gap-3" style={{ marginLeft: "36px" }}>
                <div className="result-card w-full">
                  <div className="result-label">{t("resultLabel")}</div>
                  {resultRows.map((r) =>
                    result[r.key] ? (
                      <div key={r.key} className="result-row">
                        <span className="k">{r.label}</span>
                        <span className="v">{result[r.key]}</span>
                      </div>
                    ) : null
                  )}
                </div>
                <video
                  className="ally-anim"
                  style={{ width: "auto", height: 130 }}
                  autoPlay muted playsInline
                  src="/assets/ally/anim/ally-success.mp4"
                  poster="/assets/ally/anim/ally-success-poster.jpg"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
            )}

            {showOptions && (
              <div className="flex flex-col gap-2 pl-9">
                {options.map((opt) => (
                  <button
                    key={opt.phone}
                    type="button"
                    onClick={() => sendMessage(`${opt.name} (${opt.phone})`)}
                    className="flex items-center gap-3 bg-white px-4 py-3 text-left transition-colors"
                    style={{
                      border: "1px solid var(--sidebar-border)",
                      borderRadius: "var(--radius-tile)",
                      boxShadow: "var(--shadow-card)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sidebar-border)"; }}
                  >
                    <span className="initial-avatar" style={{ width: 32, height: 32, fontSize: "12px" }}>
                      {opt.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="flex flex-col">
                      <span style={{ fontWeight: 500, color: "var(--ink)", fontSize: "14px" }}>{opt.name}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}

            {showChoices && (
              <div className="decision-card" style={{ marginLeft: "36px" }}>
                <div className="flex flex-wrap gap-2">
                  {choices.map((choice, ci) => (
                    <button
                      key={`${ci}-${choice}`}
                      type="button"
                      onClick={() => sendMessage(choice)}
                      className="bg-white px-4 py-2 text-left transition-colors"
                      style={{
                        border: "1px solid var(--cta-border)",
                        borderRadius: "var(--radius-pill)",
                        color: "var(--accent-strong)",
                        fontSize: "14px",
                        fontWeight: 500,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-tint)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#FFFFFF"; }}
                    >
                      {choice}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loading && !streamingActive && (
              <div className="flex items-center gap-3 pl-9">
                <AllyAnim clip={workingClip(trailingSteps)} size="inline" />
                <span style={{ fontSize: "13px", color: "var(--ink-soft)" }}>{t("workingOnIt")}</span>
              </div>
            )}

            {!loading && error && (
              <ErrorBlock
                text={error}
                onRetry={lastUserText ? () => sendMessage(lastUserText, false) : null}
              />
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {!limitHit && lowBalance && (
        <div className="px-4 pt-2">
          <div
            className="mx-auto px-4 py-2.5"
            style={{
              maxWidth: "720px",
              background: "var(--terra-tint)",
              color: "var(--request-accent)",
              borderRadius: "var(--radius-tile)",
              fontSize: "13.5px",
              fontWeight: 500,
            }}
          >
            {tf("tokensAlmostGone", { n: fmtTokens(Math.max(0, tokens!.balance)) })}
          </div>
        </div>
      )}

      {limitHit && (
        <div className="px-4 pt-2">
          <div className="card mx-auto flex flex-col gap-2" style={{ maxWidth: "720px" }}>
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
              {isTrialWallet ? t("trialUsedUp") : t("monthlyUsedUp")}
            </p>
            <p style={{ fontSize: "13.5px", color: "var(--ink-soft)" }}>
              {isTrialWallet
                ? t("subscribeToContinue")
                : packages.length > 0
                ? tf("renewsOrTopup", { date: nextRenewalDate() })
                : tf("renewsOn", { date: nextRenewalDate() })}
            </p>
            {isTrialWallet ? (
              <button
                type="button"
                onClick={() => router.push("/pricing")}
                className="btn-primary self-start"
              >
                {t("subscribe")}
              </button>
            ) : packages.length > 0 ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => buyPackage(pkg)}
                    className="btn-secondary flex-1"
                  >
                    {pkg.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      )}

      <div
        className="composer-wrap px-4 py-3"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          background: "var(--bg)",
          borderTop: "1px solid var(--header-border)",
        }}
      >
        <style>{`
          @keyframes micPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(179,64,46,0.4); }
            50% { box-shadow: 0 0 0 6px rgba(179,64,46,0); }
          }
        `}</style>
        <div className="mx-auto" style={{ maxWidth: "720px" }}>
          <div
            className="composer-pill flex items-end gap-2"
            style={{
              padding: "6px 6px 6px 18px",
              borderColor: voiceState === "recording" ? "var(--danger)" : undefined,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                voiceState === "recording"
                  ? t("listening")
                  : limitHit
                  ? t("outOfTokens")
                  : rateLimited
                  ? t("rateLimitedPlaceholder")
                  : result
                  ? t("resultFollowup")
                  : t("composerPlaceholder")
              }
              rows={1}
              disabled={composerBlocked}
              className="flex-1 resize-none bg-transparent outline-none disabled:opacity-60"
              style={{
                color: voiceState === "recording" ? "var(--placeholder)" : "var(--ink)",
                fontSize: "15px",
                lineHeight: "1.5",
                maxHeight: "120px",
                paddingTop: "7px",
                paddingBottom: "7px",
              }}
            />

            {speechSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={voiceState === "processing" || composerBlocked}
                aria-label={voiceState === "recording" ? "Stop recording" : "Start voice input"}
                className="flex shrink-0 items-center justify-center rounded-full transition-all"
                style={{
                  width: 38,
                  height: 38,
                  background: voiceState === "recording" ? "var(--danger)" : "transparent",
                  color: voiceState === "recording" ? "white" : "var(--meta)",
                  opacity: voiceState === "processing" || composerBlocked ? 0.4 : 1,
                  animation: voiceState === "recording" ? "micPulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                {voiceState === "processing" ? (
                  <span
                    className="h-4 w-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: "var(--placeholder)", borderTopColor: "transparent" }}
                  />
                ) : voiceState === "recording" ? (
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
            )}

            {voiceState !== "recording" && (
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || composerBlocked}
                className="flex shrink-0 items-center justify-center rounded-full transition-colors"
                style={{
                  width: 38,
                  height: 38,
                  background: input.trim() && !composerBlocked ? "var(--accent)" : "var(--skeleton)",
                  color: input.trim() && !composerBlocked ? "#FBFAF4" : "var(--meta)",
                }}
                onMouseEnter={(e) => {
                  if (input.trim() && !composerBlocked) e.currentTarget.style.background = "var(--accent-strong)";
                }}
                onMouseLeave={(e) => {
                  if (input.trim() && !composerBlocked) e.currentTarget.style.background = "var(--accent)";
                }}
                aria-label="Send"
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepGroup({ steps }: { steps: ChatMessage[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-start" style={{ gap: "10px" }}>
      <AllyAvatar />
      <div className="steps" style={{ marginLeft: 0, flex: 1 }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="steps-toggle"
        >
          <span style={{ fontSize: "10px" }}>{open ? "▾" : "▸"}</span>
          {tf("stepsToggle", { n: steps.length })}
        </button>
        {open && (
          <div className="steps-list">
            {steps.map((s) => (
              <div key={s.id} className="step">
                <span>✓</span>
                <p>{renderStepText(s.content)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
