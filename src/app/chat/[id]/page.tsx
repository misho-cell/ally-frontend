"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import NotificationButton from "@/components/NotificationButton";
import Modal from "@/components/Modal";
import { authHeaders, parseRetryAfter } from "@/lib/deviceId";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";
import { fetchMessagePage } from "@/lib/messages";
import { t, tf, stripEmoji, linkifyPhones, preserveLineBreaks, getLocale, fmtDateLoc } from "@/lib/i18n";
import { useUserName } from "@/lib/user";
import {
  useThreads,
  updateThreadState,
  taskStatusOf,
  forceLogin,
  mergeMessages,
  prependOlder,
  PAGE_SIZE,
  DEFAULT_THREAD_STATE,
  type ChatMessage,
  type TaskStatus,
} from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const OLDER_TRIGGER_PX = 300;

const SEND = {
  en: { failed: "Not sent", resend: "Resend" },
  ka: { failed: "ვერ გაიგზავნა", resend: "ხელახლა" },
};

// Ticket 7 #5: the "running low" copy was wrong when the monthly grant is
// spent but the wallet still holds top-up credit. Georgian: no em-dashes.
const WALLET = {
  en: { spentAllowance: "Monthly allowance used up. Now spending from your balance." },
  ka: { spentAllowance: "თვის პაკეტი ამოიწურა, ახლა ბალანსიდან იხარჯება" },
};

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

function nextRenewalDate(): string {
  const now = new Date();
  return fmtDateLoc(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

function fmtTokens(n: number): string {
  return Number(n).toLocaleString("en-US");
}

// Message timestamps in the stream (ticket 7 #3): same-day → clock, older →
// date + clock. Quiet meta text, never a full sentence.
function fmtMsgClock(iso?: string | number | null): string {
  if (!iso) return "";
  const d = new Date(String(iso));
  if (isNaN(d.getTime())) return "";
  const clock = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? clock : `${d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} ${clock}`;
}

// Assistant markdown pipeline: tappable phone links + single-\n preservation
// (task 22 j — markdown swallows lone newlines otherwise).
function mdSource(text: string): string {
  return preserveLineBreaks(linkifyPhones(text));
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

// react-markdown strips non-http protocols by default, which nulled the tel:
// anchors from linkifyPhones (ticket 6 #3) — allow tel: explicitly.
function mdUrlTransform(url: string): string {
  return url.startsWith("tel:") ? url : defaultUrlTransform(url);
}

const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => <p style={{ marginBottom: "10px" }} className="last:mb-0">{children}</p>,
  strong: ({ children }: { children?: React.ReactNode }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
  em: ({ children }: { children?: React.ReactNode }) => <em>{children}</em>,
  hr: () => <hr style={{ height: "1px", background: "var(--header-border)", border: 0, margin: "12px 0" }} />,
  // Phone/WhatsApp links from linkifyPhones plus any regular links.
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel="noopener noreferrer"
      style={{ color: "var(--accent-strong)", textDecoration: "underline", textUnderlineOffset: "2px" }}
    >
      {children}
    </a>
  ),
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
    threads, setThreads, threadStates, setThreadStates, reconnectNonce, tokens, refreshTokens,
    titles, resolveRequest, resolvedRequests, threadBumps,
  } = useThreads();

  const st = threadStates[threadId] ?? DEFAULT_THREAD_STATE;
  const { messages, options, choices, loading, error, streaming, progress, hasMoreOlder, result } = st;
  const send = SEND[getLocale()];
  const wallet = WALLET[getLocale()];

  const [input, setInput] = useState("");
  const [loadPhase, setLoadPhase] = useState<LoadPhase>(st.loaded ? "done" : "loading");
  const [fetchNonce, setFetchNonce] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const rateLimited = rateLimitedUntil > Date.now();
  const [limitHit, setLimitHit] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  // Ticket 6 #7: design-system modals instead of window.prompt/confirm.
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const packagesFetchedRef = useRef(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const inputBeforeRecordingRef = useRef("");
  const confirmedTranscriptRef = useRef("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceRef = useRef<number | null>(null);
  const anchorRef = useRef<number | null>(null);
  const loadingOlderRef = useRef(false);
  const lastIdRef = useRef<string | null>(null);
  const firstPaintRef = useRef(true);
  const msgCountRef = useRef(0);
  msgCountRef.current = messages.length;

  const thread = threads.find((th) => String(th.id) === threadId);
  const { initial: userInitial } = useUserName();
  const isRequest = thread?.type === "incoming_request";
  const taskStatus: TaskStatus | null = thread ? taskStatusOf(thread, st) : null;

  const tokensEnabled = tokens?.enabled === true;
  const isTrialWallet = tokensEnabled && tokens.grantedThisPeriod === 120;
  const granted = tokensEnabled ? tokens.grantedThisPeriod : 0;
  // Ticket 7 #5: two distinct wallet states. The grant being spent is NOT the
  // same as the wallet running dry — balance also holds top-ups and credits.
  const grantExhausted = tokensEnabled && granted > 0 && tokens.spentThisPeriod >= granted;
  const balanceLow = tokensEnabled && granted > 0 && Math.max(0, tokens.balance) <= granted * 0.05;
  const remainingPct =
    tokensEnabled && granted > 0
      ? Math.max(0, 1 - tokens.spentThisPeriod / granted)
      : null;

  const streamingActive = loading && !!streaming && streaming.text.length > 0;

  useEffect(() => {
    lastIdRef.current = null;
    firstPaintRef.current = true;
    anchorRef.current = null;
  }, [threadId]);

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

  // Ticket 6 #10: one share mechanism everywhere — the native share sheet,
  // clipboard as fallback.
  async function handleShare() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ url });
        return;
      }
    } catch {
      return; // user closed the sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast(t("linkCopied"), true);
    } catch {}
  }

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

  // E1: rename — PATCH /threads/:id { title } via the design-system modal.
  async function saveRename() {
    if (renameBusy) return;
    const current = thread?.title ?? "";
    const trimmed = renameValue.trim().slice(0, 80);
    if (!trimmed || trimmed === current) {
      setRenameOpen(false);
      return;
    }
    setRenameBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/threads/${threadId}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ title: trimmed }),
      });
      if (res.status === 401) { forceLogin(); return; }
      if (!res.ok) { showToast(t("renameFailed"), false); return; }
      setThreads((prev) =>
        prev.map((th) => (String(th.id) === threadId ? { ...th, title: trimmed } : th))
      );
      setRenameOpen(false);
    } catch {
      showToast(t("renameFailed"), false);
    } finally {
      setRenameBusy(false);
    }
  }

  // C1: delete — the server closes any open task itself.
  async function confirmDelete() {
    if (deleteBusy) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`${BASE_URL}/threads/${threadId}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (res.status === 401) { forceLogin(); return; }
      if (!res.ok) { showToast(t("deleteFailed"), false); return; }
      setThreads((prev) => prev.filter((th) => String(th.id) !== threadId));
      router.push("/chat");
    } catch {
      showToast(t("deleteFailed"), false);
    } finally {
      setDeleteBusy(false);
      setDeleteOpen(false);
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
    const hasCache = msgCountRef.current > 0;
    setLoadPhase(hasCache ? "done" : "loading");

    const slowTimer = hasCache
      ? null
      : setTimeout(() => {
          if (!cancelled) setLoadPhase((p) => (p === "loading" ? "slow" : p));
        }, 8000);

    fetchMessagePage(threadId)
      .then((page) => {
        if (cancelled || !page) return;
        setThreadStates((prev) =>
          updateThreadState(prev, threadId, (ts) => ({
            ...ts,
            messages: mergeMessages(page.messages, ts.messages),
            loaded: true,
            hasMoreOlder: page.paged && page.messages.length >= PAGE_SIZE,
            // Task 22 k: persisted choices survive reloads — restore them from
            // the newest message unless a live run is mid-flight.
            choices:
              !ts.loading && Array.isArray(page.choices) && page.choices.length > 0
                ? page.choices
                : ts.choices,
          }))
        );
        setLoadPhase("done");
      })
      .catch(() => {
        if (!cancelled) setLoadPhase(msgCountRef.current > 0 ? "done" : "failed");
      })
      .finally(() => {
        if (slowTimer) clearTimeout(slowTimer);
      });

    return () => {
      cancelled = true;
      if (slowTimer) clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, reconnectNonce, fetchNonce]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMoreOlder) return;
    const oldest = messages.find((m) => m.serverId != null && m.createdAt);
    if (!oldest) return;

    loadingOlderRef.current = true;
    setLoadingOlder(true);
    anchorRef.current = scrollRef.current?.scrollHeight ?? null;

    try {
      const page = await fetchMessagePage(threadId, {
        before: String(oldest.createdAt),
        beforeId: String(oldest.serverId),
      });
      if (!page) return;
      setThreadStates((prev) =>
        updateThreadState(prev, threadId, (ts) => ({
          ...ts,
          messages: prependOlder(page.messages, ts.messages),
          hasMoreOlder: page.paged && page.messages.length >= PAGE_SIZE,
        }))
      );
      if (page.messages.length === 0) anchorRef.current = null;
    } catch {
      anchorRef.current = null;
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMoreOlder, messages, threadId, setThreadStates]);

  function onMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < OLDER_TRIGGER_PX) loadOlder();
  }

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const before = anchorRef.current;
    if (el && before != null) {
      el.scrollTop = el.scrollTop + (el.scrollHeight - before);
      anchorRef.current = null;
    }
  }, [messages]);

  useEffect(() => {
    const lastId = messages.length ? messages[messages.length - 1].id : null;
    if (lastId === lastIdRef.current) return;
    lastIdRef.current = lastId;
    if (!lastId) return;
    messagesEndRef.current?.scrollIntoView({
      behavior: firstPaintRef.current ? "auto" : "smooth",
    });
    firstPaintRef.current = false;
  }, [messages]);

  useEffect(() => {
    if (!streaming && !loading) return;
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streaming, loading]);

  const sendMessage = useCallback(
    async (text: string, echo: boolean = true) => {
      if (voiceState === "recording") {
        stopRecognition();
      }
      const trimmed = text.trim();
      if (!trimmed || rateLimitedUntil > Date.now() || limitHit) return;

      const localId = crypto.randomUUID();
      const sentinel = `pending-${crypto.randomUUID()}`;
      setThreadStates((prev) =>
        updateThreadState(prev, threadId, (ts) => ({
          ...ts,
          messages: echo
            ? [
                ...ts.messages,
                {
                  id: localId,
                  role: "user",
                  content: trimmed,
                  kind: "message",
                  runId: null,
                  pending: true,
                  createdAt: new Date().toISOString(),
                },
              ]
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
      setInput("");

      const markFailed = () =>
        setThreadStates((prev) =>
          updateThreadState(prev, threadId, (ts) => ({
            ...ts,
            loading: false,
            runId: null,
            progress: null,
            messages: ts.messages.map((m) =>
              m.id === localId ? { ...m, failed: true, pending: true } : m
            ),
          }))
        );

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
              updateThreadState(prev, threadId, (ts) => ({ ...ts, loading: false, runId: null, progress: null }))
            );
            return;
          }
        }

        if (res.status === 429) {
          const body = await res.json().catch(() => ({}));
          const secs = parseRetryAfter(res);
          showToast(body.error ?? t("rateLimitedToast"), false);
          setRateLimitedUntil(Date.now() + secs * 1000);
          markFailed();
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
      } catch {
        markFailed();
      } finally {
        inputRef.current?.focus();
      }
    },
    [threadId, voiceState, setThreadStates, rateLimitedUntil, limitHit, refreshTokens]
  );

  const resend = useCallback(
    (msg: ChatMessage) => {
      setThreadStates((prev) =>
        updateThreadState(prev, threadId, (ts) => ({
          ...ts,
          messages: ts.messages.filter((m) => m.id !== msg.id),
        }))
      );
      sendMessage(msg.content, true);
    },
    [threadId, setThreadStates, sendMessage]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  const blocks = toBlocks(messages);
  const lastBlock = blocks[blocks.length - 1];
  const trailingSteps =
    lastBlock && lastBlock.type === "steps" && lastBlock.trailing ? lastBlock.steps : [];
  const renderBlocks = loading && trailingSteps.length > 0 ? blocks.slice(0, -1) : blocks;

  const lastMsg = messages[messages.length - 1];
  const lastIsAssistantMessage = lastMsg?.kind === "message" && lastMsg.role === "assistant";
  const showOptions = !loading && lastIsAssistantMessage && options.length > 0;
  const showChoices = !loading && lastIsAssistantMessage && choices.length > 0;
  const composerBlocked = rateLimited || limitHit;
  const lastUserText = [...messages].reverse().find((m) => m.kind === "message" && m.role === "user")?.content;

  const showInitialLoad = loadPhase !== "done" && messages.length === 0;

  const firstAssistant = isRequest ? messages.find((m) => m.kind === "message" && m.role === "assistant") : undefined;
  const reqQuote = firstAssistant ? extractQuote(firstAssistant.content) : null;
  const reqNames = isRequest && thread?.title?.includes("→")
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
          {toast.ok && <span style={{ marginRight: 4 }}>✓</span>}
          {toast.msg}
        </div>
      )}

      {renameOpen && (
        <Modal onClose={() => setRenameOpen(false)}>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>{t("modalRenameTitle")}</p>
          <input
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
            <button type="button" disabled={renameBusy} onClick={() => setRenameOpen(false)} className="btn-secondary disabled:opacity-50">
              {t("cancel")}
            </button>
            <button type="button" disabled={renameBusy || !renameValue.trim()} onClick={saveRename} className="btn-primary disabled:opacity-60">
              {t("save")}
            </button>
          </div>
        </Modal>
      )}

      {deleteOpen && (
        <Modal onClose={() => setDeleteOpen(false)}>
          <p style={{ fontSize: "15px", fontWeight: 600, color: "var(--ink)" }}>{t("modalDeleteTitle")}</p>
          <p style={{ font: "400 14px/22px var(--font-system)", color: "var(--ink-2)" }}>{t("deleteConfirm")}</p>
          <div className="flex justify-end gap-3">
            <button type="button" disabled={deleteBusy} onClick={() => setDeleteOpen(false)} className="btn-secondary disabled:opacity-50">
              {t("cancel")}
            </button>
            <button type="button" disabled={deleteBusy} onClick={confirmDelete} className="btn-destructive disabled:opacity-60">
              {deleteBusy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                t("deleteGoal")
              )}
            </button>
          </div>
        </Modal>
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
          aria-label={t("backLabel")}
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
          {/* Ticket 7 #2: on phones the composer lives on the list page — give
              the open thread a one-tap way to start a new goal. */}
          <button
            onClick={() => router.push("/chat")}
            aria-label={t("newTask")}
            title={t("newTask")}
            className="md:hidden flex items-center justify-center rounded-full"
            style={{ width: 30, height: 30, background: "var(--accent)", color: "#FBFAF4", fontSize: "17px", lineHeight: 1 }}
          >
            +
          </button>
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
          {!isRequest && thread && (
            <button
              onClick={() => { setRenameValue(thread?.title ?? ""); setRenameOpen(true); }}
              aria-label={t("renameGoal")}
              title={t("renameGoal")}
              className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M13.5 3.5l3 3L7 16H4v-3l9.5-9.5z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {thread && (
            <button
              onClick={() => setDeleteOpen(true)}
              aria-label={t("deleteGoal")}
              title={t("deleteGoal")}
              className="rounded-lg p-1.5 transition-colors hover:bg-black/5"
              style={{ color: "var(--ink-soft)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--danger)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--ink-soft)"; }}
            >
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <path d="M3.5 5.5h13M8 5V3.5h4V5M6 5.5l.7 10.3a1 1 0 001 .95h4.6a1 1 0 001-.95L14 5.5M8.3 8.5v5M11.7 8.5v5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {tokensEnabled && (
            <span className={`token-badge${balanceLow ? " low" : ""}`}>
              <i className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: balanceLow ? "var(--request-accent)" : "var(--accent)", display: "inline-block" }} />
              <span className="count">
                {fmtTokens(Math.max(0, tokens.balance))}{balanceLow ? ` · ${t("lowSuffix")}` : ""}
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

      <div className="flex-1 overflow-y-auto" ref={scrollRef} onScroll={onMessagesScroll}>
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
          )
        ) : (
          <div
            className="messages mx-auto flex flex-col"
            style={{ maxWidth: "720px", padding: "26px 24px", gap: "18px" }}
          >
            {loadingOlder && (
              <div className="flex flex-col gap-2">
                <span className="sk-bar" style={{ width: "58%" }} />
                <span className="sk-bar" style={{ width: "72%", alignSelf: "flex-end" }} />
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

            {renderBlocks.map((block, bi) => {
              if (block.type === "steps") {
                return <StepGroup key={`steps-${bi}`} steps={block.steps} />;
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
              const stamp = fmtMsgClock(msg.createdAt);
              if (msg.role === "user") {
                return (
                  <div key={msg.id} className="flex flex-col items-end gap-1">
                    <div
                      className="msg-user whitespace-pre-wrap"
                      style={{
                        maxWidth: "74%",
                        background: "var(--user-bubble-bg)",
                        color: "var(--ink)",
                        padding: "12px 16px",
                        borderRadius: "16px 16px 4px 16px",
                        font: "400 15px/22px var(--font-system)",
                        opacity: msg.failed ? 0.7 : 1,
                      }}
                    >
                      {msg.content}
                    </div>
                    {msg.failed ? (
                      <div className="flex items-center gap-2">
                        <span style={{ font: "400 11.5px/16px var(--font-system)", color: "var(--request-accent)" }}>
                          {send.failed}
                        </span>
                        <button
                          type="button"
                          onClick={() => resend(msg)}
                          style={{ font: "600 11.5px/16px var(--font-system)", color: "var(--accent-strong)", textDecoration: "underline" }}
                        >
                          {send.resend}
                        </button>
                      </div>
                    ) : stamp ? (
                      <span style={{ font: "400 10.5px/14px var(--font-system)", color: "var(--meta)" }}>{stamp}</span>
                    ) : null}
                  </div>
                );
              }
              const isFirstAssistant = firstAssistant && msg.id === firstAssistant.id;
              return (
                <div key={msg.id} className="flex flex-col gap-3">
                  <div className="flex items-start" style={{ gap: "10px" }}>
                    <AllyAvatar />
                    <div className="flex flex-col" style={{ flex: 1, minWidth: 0, gap: "4px" }}>
                      <div className="msg-ally" style={{ font: "400 17px/27px var(--font-bricolage)", color: "var(--ink)" }}>
                        <ReactMarkdown components={markdownComponents} urlTransform={mdUrlTransform}>
                          {mdSource(msg.content)}
                        </ReactMarkdown>
                      </div>
                      {stamp && (
                        <span style={{ font: "400 10.5px/14px var(--font-system)", color: "var(--meta)" }}>{stamp}</span>
                      )}
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
                  <ReactMarkdown components={markdownComponents} urlTransform={mdUrlTransform}>
                    {mdSource(streaming!.text)}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex items-start" style={{ gap: "10px" }}>
                <AllyAvatar />
                <div className="flex flex-col gap-2" style={{ flex: 1, minWidth: 0 }}>
                  <div className="steps" style={{ marginLeft: 0 }}>
                    <div className="steps-list" style={{ marginTop: 0 }}>
                      {trailingSteps.map((s) => (
                        <div key={s.id} className="step">
                          <span>✓</span>
                          <p>{renderStepText(s.content)}</p>
                        </div>
                      ))}
                      {!streamingActive && (
                        <div className="step">
                          <span className="sk-dot" style={{ width: 8, height: 8, marginTop: 6 }} />
                          <p>{progress ? stripEmoji(progress) : t("workingOnIt")}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  {!streamingActive && (
                    <AllyAnim clip={workingClip(trailingSteps.length)} size="inline" />
                  )}
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

      {!limitHit && (balanceLow || grantExhausted) && (
        <div className="px-4 pt-2">
          <div
            className="mx-auto px-4 py-2.5"
            style={{
              maxWidth: "720px",
              background: balanceLow ? "var(--terra-tint)" : "var(--accent-tint)",
              color: balanceLow ? "var(--request-accent)" : "var(--accent-strong)",
              borderRadius: "var(--radius-tile)",
              fontSize: "13.5px",
              fontWeight: 500,
            }}
          >
            {balanceLow
              ? tf("tokensAlmostGone", { n: fmtTokens(Math.max(0, tokens!.balance)) })
              : wallet.spentAllowance}
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

            {/* D20 (22 Aug): mic AND send are BOTH available while typing —
                mic on the left, send rightmost. Send hides only while the mic
                is actively recording. */}
            {speechSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={voiceState === "processing" || composerBlocked}
                aria-label={voiceState === "recording" ? t("voiceStop") : t("voiceStart")}
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
                aria-label={t("send")}
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
