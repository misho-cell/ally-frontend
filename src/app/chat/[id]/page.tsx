"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import NotificationButton from "@/components/NotificationButton";
import Modal from "@/components/Modal";
import { authHeaders, parseRetryAfter } from "@/lib/deviceId";
import { getSpeechRecognition, speechLang, transcriptOf, startRecognition as beginRecognition, type SpeechRecognitionLike } from "@/lib/speech";
import { recorderSupported, speechLimits, startRecording, transcribe, type Recording } from "@/lib/dictation";
import { recordSpeechStage } from "@/lib/speech";
import { onCheckoutCompleted } from "@/lib/paddle";
import { startStripeTopup } from "@/lib/stripe";
import { fetchMessagePage } from "@/lib/messages";
import { shareInvite } from "@/lib/invite";
import { isWriteMyOwn } from "@/lib/choices";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";
import { saveTextFile } from "@/lib/download";
import { FILE_ACCEPT, FILE_MAX_BYTES, uploadThreadFile } from "@/lib/threadFiles";
import RequestActions from "@/components/RequestActions";
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

// 23 Aug #5: the two client-side strings inside the conversation follow the
// THREAD's language (last message), like the backend's step lines do.
type ThreadLang = "ka" | "en" | "ru" | "es";
const CHROME: Record<ThreadLang, { steps: string; spent: string; share: string }> = {
  ka: { steps: "ნაბიჯები ({n})", spent: "თვის პაკეტი ამოიწურა, ახლა ბალანსიდან იხარჯება", share: "გაზიარება" },
  en: { steps: "Steps ({n})", spent: "Monthly allowance used up. Now spending from your balance.", share: "Share" },
  ru: { steps: "Шаги ({n})", spent: "Месячный пакет израсходован. Теперь списывается с баланса.", share: "Поделиться" },
  es: { steps: "Pasos ({n})", spent: "El paquete mensual se ha agotado. Ahora se descuenta de tu saldo.", share: "Compartir" },
};

// T3 (26 Aug): get_invite_link drops a plain /join?ref=CODE URL into the
// assistant's reply text. Detect it so we can offer a native share-sheet
// button instead of leaving the user to copy the raw link by hand.
// F3 (27 Aug): bare URLs are not auto-linked, because there is no remark-gfm.
// That was first noticed on the invite link and fixed for the invite link
// alone, which answered the smaller question: EVERY bare URL in a reply was
// plain text, and the one we happened to be looking at was the only one
// anybody could tap.
//
// 1 Oct, the backend's Question A: a person found on the web now arrives with
// a link to the page they were found on, in the reply text. A source nobody
// can open is a source nobody can check, which is most of what it was for.
//
// Markdown links already in the text are left alone — linkifyPhones has
// usually just written some — so a URL is never wrapped twice.
const MD_LINK_RE = /\[[^\]]*\]\([^)]*\)/g;
const BARE_URL_RE = /https?:\/\/[^\s<>()[\]]+[^\s<>()[\].,;:!?'"]/g;

function wrapBareUrls(chunk: string): string {
  return chunk.replace(BARE_URL_RE, (url) => `[${url}](${url})`);
}

function linkifyUrls(text: string): string {
  const out: string[] = [];
  let last = 0;
  for (const m of text.matchAll(MD_LINK_RE)) {
    const at = m.index ?? 0;
    out.push(wrapBareUrls(text.slice(last, at)), m[0]);
    last = at + m[0].length;
  }
  out.push(wrapBareUrls(text.slice(last)));
  return out.join("");
}

// F2 (27 Aug): issued (assistant handed out the link) vs sent (the user
// actually shared it) are now separate funnel events — record `sent` only on
// a real share action, once per click. 30 Sept: the share and the recording
// both live in lib/invite now, so this button and the one-tap button on the
// profile cannot drift into counting differently.

// Task 39 (D54, 12 Sept): run_complete now carries share_text — the exact
// message get_invite_link composed, link already inside. Share it verbatim;
// never rebuild it from the reply (a paraphrase would go out in the user's
// own name) and never add the url as a second field (it would appear twice).
// It survives a reload too: the row carries share_text, exactly like a pending
// row carries its choices. No share_text means nothing to share — the button
// simply isn't there.
function ShareInviteButton({ text, label }: { text: string; label: string }) {
  async function share() {
    await shareInvite(text);
  }
  return (
    <button
      type="button"
      onClick={share}
      className="btn-secondary self-start"
      style={{ padding: "8px 16px", fontSize: "12.5px", marginLeft: "36px" }}
    >
      {label}
    </button>
  );
}

function detectThreadLang(messages: ChatMessage[], serverLang: string | null): ThreadLang {
  // The server's answer first. It is computed from what the OWNER writes, so
  // it does not change when the assistant happens to reply in another script,
  // and it does not change between two renders of the same page.
  if (serverLang === "ka" || serverLang === "en" || serverLang === "ru" || serverLang === "es") {
    return serverLang;
  }
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind !== "message" || !m.content) continue;
    const text = m.content;
    if (/[ა-ჰ]/.test(text)) return "ka";
    if (/[а-яё]/i.test(text)) return "ru";
    if (/[¿¡ñáéíóú]/i.test(text)) return "es";
    return "en";
  }
  return getLocale();
}

// Row 145: the list that used to live here held twelve languages and Georgian
// was not one of them, so ka-GE was unreachable even from a phone set to
// Georgian — every Georgian sentence was transcribed as something else.
// speechLang() in lib/speech.ts replaces it and asks the server, which knows
// the language from what the owner actually writes.

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
  return preserveLineBreaks(linkifyUrls(linkifyPhones(text)));
}

function renderStepText(text: string): React.ReactNode {
  const parts = stripEmoji(text).split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// #794: a steps block is identified by the run it narrates. A run that has
// not told us its id falls back to its first step's id, which is stable for
// as long as that row exists — the point is only that it does not change
// when something is drawn above it.
function stepsGroupId(steps: ChatMessage[]): string {
  const run = steps.find((s) => s.runId != null)?.runId;
  return run != null ? `run-${run}` : `step-${steps[0]?.id ?? "none"}`;
}

type RenderBlock =
  // `steps` are the steps of THIS reply's own run, rendered with it.
  | { type: "message"; msg: ChatMessage; steps: ChatMessage[] }
  // Steps that belong to no reply: the run still going, or rows that arrived
  // without a run_id. They keep the old adjacency grouping, because for these
  // there is nothing better to group them by — and dropping them would turn
  // "we have no reply for these yet" into "there were no steps".
  | { type: "steps"; steps: ChatMessage[]; trailing: boolean };

// Row 312 (30 Sept). Steps used to be grouped by adjacency: every run of
// consecutive kind='step' rows became one list. A goal that ran several times
// with nothing in between therefore merged every run's steps into one block —
// the tester saw 33 lines under a reply that did two things, with a real
// reply among them, because the server persists a scrubbed copy of the answer
// as a step row AFTER the answer.
//
// run_id is what actually says which reply a step belongs to. Adjacency never
// answered that question; it only looked like it did while goals ran once.
function toBlocks(messages: ChatMessage[]): RenderBlock[] {
  const stepsByRun = new Map<string, ChatMessage[]>();
  for (const m of messages) {
    if (m.kind !== "step" || !m.runId) continue;
    const list = stepsByRun.get(m.runId);
    if (list) list.push(m);
    else stepsByRun.set(m.runId, [m]);
  }

  // Which runs have a reply to hang their steps on. This has to be known
  // BEFORE the walk: the steps of a run come before its reply, so deciding as
  // we meet them would emit them loose and then attach them again below.
  //
  // Row 322a: only a real reply may claim a run's steps. The server also
  // appends bubbles of its own — the answers to a goal's asks, the opening
  // line of a request (row 305b) — carrying a runId that belongs to no run
  // this client started. Treated as a reply, one of those would take the
  // steps of whatever run shared that id and the real reply would show none,
  // silently, since missing steps look exactly like a run that had none to
  // report. They all arrive as kind "appended" for this reason.
  const answered = new Set<string>();
  for (const m of messages) {
    if (m.kind !== "message" || m.role !== "assistant" || !m.runId) continue;
    if (stepsByRun.has(m.runId)) answered.add(m.runId);
  }

  const taken = new Set<string>();
  const blocks: RenderBlock[] = [];
  let i = 0;
  while (i < messages.length) {
    const m = messages[i];
    if (m.kind === "step") {
      const loose: ChatMessage[] = [];
      while (i < messages.length && messages[i].kind === "step") {
        const s = messages[i];
        // A step whose reply exists is rendered with that reply, never here.
        if (!(s.runId != null && answered.has(s.runId))) loose.push(s);
        i++;
      }
      if (loose.length > 0) blocks.push({ type: "steps", steps: loose, trailing: i === messages.length });
      continue;
    }

    let own: ChatMessage[] = [];
    // A run answered twice would otherwise print its steps under both replies.
    if (m.kind === "message" && m.role === "assistant" && m.runId && answered.has(m.runId) && !taken.has(m.runId)) {
      taken.add(m.runId);
      // The scrubbed copy of the answer is a step row carrying the answer. It
      // is a reply, and a reply is not a step, so it does not belong in this
      // list however it was stored.
      const reply = m.content.trim();
      own = (stepsByRun.get(m.runId) ?? []).filter((s) => s.content.trim() !== reply);
    }
    // #375 (2 Oct): after a reload there are no step ROWS — the messages
    // endpoint has never returned them — so a finished conversation showed
    // none at all. The reply now carries its run's steps itself, and they are
    // used when no live rows exist for it. Live rows win while they do: they
    // are the same steps, and swapping source mid-run would reorder the list
    // under somebody reading it.
    if (own.length === 0 && m.kind === "message" && m.role === "assistant" && m.steps && m.steps.length > 0) {
      const reply = m.content.trim();
      own = m.steps
        .filter((text) => text.trim() !== reply)
        .map((text, i) => ({
          id: `${m.id}-step-${i}`,
          role: "assistant" as const,
          content: text,
          kind: "step" as const,
          runId: m.runId,
        }));
    }
    blocks.push({ type: "message", msg: m, steps: own });
    i++;
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
  const { messages, options, choices, choiceNotes, otherChoiceIndex, loading, error, streaming, progress, hasMoreOlder, result } = st;
  const send = SEND[getLocale()];

  const [input, setInput] = useState("");
  const [loadPhase, setLoadPhase] = useState<LoadPhase>(st.loaded ? "done" : "loading");
  const [fetchNonce, setFetchNonce] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(false);
  // Row 226 (25 Sept): the iPhone records and sends the audio instead of
  // asking the browser to recognise it, because Safari's recogniser has no
  // Georgian and the home-screen app is refused outright. Decided once, after
  // mount, so the server render and the phone agree on what to draw.
  const [useRecorder, setUseRecorder] = useState(false);
  const recordingRef = useRef<Recording | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [rateLimitedUntil, setRateLimitedUntil] = useState(0);
  const rateLimited = rateLimitedUntil > Date.now();
  const [limitHit, setLimitHit] = useState(false);
  // Task 12 (8 Sept): the exact 402 error text from the server (it changes
  // wording per window — calendar_month vs calendar_week). Shown verbatim.
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  // Stays until dismissed. A stop that failed must not fade away.
  const [stopFailed, setStopFailed] = useState(false);
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
  const renameInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
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
  // Row 305b (1 Oct, D530). A request for an introduction now continues the
  // conversation the owner already had with that person instead of opening a
  // thread of its own, so Accept / Decline can no longer be gated on the
  // thread's TYPE: an `incoming_ask` thread can carry a pending request too.
  // What decides is `request_ref`, which is what the buttons post to anyway.
  //
  // It is a separate flag rather than a widened `isRequest` because the two
  // need different places on the screen. In a dedicated request thread the
  // request IS the conversation, so the buttons sit under its first message
  // beside the card. In an ask thread the request arrived at the END of an
  // existing exchange, and buttons under the first message would answer a
  // question the person asked days ago.
  const carriesRequest = thread?.request_ref != null && !isRequest;
  const taskStatus: TaskStatus | null = thread ? taskStatusOf(thread, st) : null;

  const tokensEnabled = tokens?.enabled === true;
  const isTrialWallet = tokensEnabled && tokens.grantedThisPeriod === 120;
  const granted = tokensEnabled ? tokens.grantedThisPeriod ?? 0 : 0;
  // Row 282: the balance the server actually stated, or null when it stated
  // none. Everything below that could tell somebody they are out of tokens
  // now goes through this, and null means we say nothing rather than say 0.
  const balance = tokensEnabled ? tokens.balance : null;
  // FT-11 (2 Sept): grantedThisPeriod/spentThisPeriod are calendar-month
  // stats for display only — NOT the run gate. The backend confirmed the
  // only real limit is `balance > 0`; both stats sit at 0 at the start of
  // every calendar month (and for any subscriber whose grant hasn't landed
  // yet), which made `spent >= granted` fire as "exhausted" for people who
  // still had thousands of tokens. Read the actual limit from `balance`.
  //
  // Row 282 (30 Sept): and a balance that never arrived is not a balance of
  // zero. The banner that says the allowance is gone is a claim about the
  // person's money, so it is made only when the server actually said the
  // number, never on the silence of a field this client failed to read.
  const grantExhausted = balance != null && balance <= 0;
  const balanceLow = balance != null && granted > 0 && Math.max(0, balance) <= granted * 0.05;
  const spent = tokensEnabled ? tokens.spentThisPeriod : null;
  // Row 282: zero is its own state, not the bottom of "almost gone". At a
  // balance of 0 the banner said "almost gone, 0 left" — almost gone when it
  // is gone — and said nothing about the grant landing on Monday, which for
  // nine of the twelve accounts sitting at zero is the only fact that matters.
  const tokensGone = balance != null && balance <= 0;
  const resetsAt = tokensEnabled ? tokens.resetsAt ?? null : null;
  const remainingPct =
    spent != null && granted > 0
      ? Math.max(0, 1 - spent / granted)
      : null;

  // [97] D201 (12 Sept): while the assistant works the screen shows ONLY the
  // step line; the answer appears once, at the end. The intermediate
  // answer_delta text rewrote itself up to five times in 30 seconds, which
  // reads as a machine changing its mind. The events still arrive — they are
  // simply not drawn. Flip this one flag back to true to restore.
  const SHOW_STREAMING_TEXT = false;
  const streamingActive = SHOW_STREAMING_TEXT && loading && !!streaming && streaming.text.length > 0;
  // 23 Aug #5: in-thread chrome follows the conversation's language.
  const chrome = CHROME[detectThreadLang(messages, st.language)];

  // FT-10 (2 Sept): the server pushes answer_delta in uneven, sentence-sized
  // bursts, so rendering streaming.text as-is makes the reply "jump" in
  // blocks. Smooth it on the client: reveal characters at a steady drip
  // instead of snapping straight to whatever just arrived. Resets whenever a
  // new run starts streaming.
  const [revealedLen, setRevealedLen] = useState(0);
  const streamRunIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!streaming) {
      streamRunIdRef.current = null;
      setRevealedLen(0);
      return;
    }
    if (streamRunIdRef.current !== streaming.runId) {
      streamRunIdRef.current = streaming.runId;
      setRevealedLen(0);
    }
  }, [streaming]);

  useEffect(() => {
    if (!SHOW_STREAMING_TEXT || !streaming) return;
    const total = streaming.text.length;
    if (revealedLen >= total) return;
    // Catch up faster the further behind we are, so a long burst doesn't
    // leave the reveal trailing the actual stream for seconds.
    const behind = total - revealedLen;
    const step = behind > 120 ? 6 : behind > 40 ? 3 : 1;
    const id = setTimeout(() => setRevealedLen((n) => Math.min(total, n + step)), 12);
    return () => clearTimeout(id);
  }, [streaming, revealedLen]);

  const revealedStreamText = streaming ? streaming.text.slice(0, revealedLen) : "";

  useEffect(() => {
    lastIdRef.current = null;
    firstPaintRef.current = true;
    anchorRef.current = null;
  }, [threadId]);

  // 23 Aug #1: select-all must survive touch/long-press opening — onFocus
  // alone was collapsed by the events that follow the press.
  useEffect(() => {
    if (!renameOpen) return;
    const tm = setTimeout(() => {
      const el = renameInputRef.current;
      if (el) {
        el.focus();
        el.select();
        el.setSelectionRange(0, el.value.length);
      }
    }, 60);
    return () => clearTimeout(tm);
  }, [renameOpen]);

  const bump = threadBumps[threadId] ?? 0;
  const prevBumpRef = useRef(bump);
  useEffect(() => {
    if (bump !== prevBumpRef.current) {
      prevBumpRef.current = bump;
      if (!loading) setFetchNonce((n) => n + 1);
    }
  }, [bump, loading]);

  useEffect(() => {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const recorder = ios && recorderSupported();
    setUseRecorder(recorder);
    // The button is offered when either road exists. On an iPhone the browser
    // recogniser may be present and still useless, so the recorder decides.
    setSpeechSupported(recorder || !!getSpeechRecognition());
  }, []);

  useEffect(() => {
    if (balance != null) balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (limitHit && balance != null && balance > 0) {
      setLimitHit(false);
    }
  }, [limitHit, balance]);

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

  // Row 292 (2 Oct): packs go through Stripe. "Gone" is kept apart from
  // "failed" because they are different facts for the person in front of it:
  // one means this pack no longer exists and the screen is stale, the other
  // means the payment page would not open. Telling somebody their payment
  // failed when nothing was attempted is the worse of the two.
  async function buyPackage(pkg: TopupPackage) {
    const out = await startStripeTopup(pkg.id);
    if (out.kind === "redirected" || out.kind === "cancelled") return;
    showToast(out.kind === "gone" ? t("packGone") : out.message, false);
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

  // #71 (3 Oct). The export is composed by the server — the title, the times,
  // who said what, the buttons a message offered — in the conversation's own
  // language. The client's whole job is to turn it into a file and hand it
  // over, under the name the server chose, because the name carries the
  // title and the date and is itself part of being able to find it later.
  const [exporting, setExporting] = useState(false);
  // #892: attaching a list. The hidden input is the only way to open a file
  // picker from a button that looks like the rest of the composer.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // #794: which steps blocks are open, by run. Held here rather than inside
  // the block, because the block is rebuilt by every event the run emits and
  // again when the run ends.
  const [openSteps, setOpenSteps] = useState<Set<string>>(() => new Set());
  const toggleSteps = useCallback((id: string) => {
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await apiFetch<unknown>(`/threads/${encodeURIComponent(threadId)}/export`);
      const body = unwrapData(res);
      const filename = isRecord(body) && typeof body.filename === "string" ? body.filename : "";
      const text = isRecord(body) && typeof body.text === "string" ? body.text : "";
      // An empty body is not an empty conversation, it is a reply we did not
      // understand. Saving a blank file under a real name would be worse
      // than saying nothing worked.
      if (!filename || !text) {
        showToast(t("exportFailed"), false);
        return;
      }
      await saveTextFile(filename, text);
    } catch {
      showToast(t("exportFailed"), false);
    } finally {
      setExporting(false);
    }
  }

  // #892. The server reads the file and writes two rows into the
  // conversation: the owner's „📎 filename" line and Netai's summary of what
  // it understood. There is no SSE event for either yet, so they are
  // appended from this response — the summary with the server's own id and
  // time, so that when history next loads it recognises the same row rather
  // than drawing it twice (#793 is what that looks like when it goes wrong).
  async function handleFile(file: File) {
    if (uploading) return;
    // Refused here only to save somebody a two-megabyte upload that ends in
    // being told it was two megabytes. The server decides either way.
    if (file.size > FILE_MAX_BYTES) {
      showToast(t("attachTooBig"), false);
      return;
    }
    setUploading(true);
    try {
      const out = await uploadThreadFile(threadId, file, t("attachFailed"));
      if (!out.ok) {
        showToast(out.error, false);
        return;
      }
      setThreadStates((prev) =>
        updateThreadState(prev, threadId, (ts) => ({
          ...ts,
          messages: [
            ...ts.messages,
            {
              id: crypto.randomUUID(),
              role: "user",
              content: `📎 ${out.filename}`,
              kind: "message",
              runId: null,
              pending: true,
              createdAt: out.createdAt ?? new Date().toISOString(),
            },
            {
              id: crypto.randomUUID(),
              serverId: out.messageId ?? undefined,
              role: "assistant",
              content: out.summary,
              kind: "message",
              runId: null,
              pending: true,
              createdAt: out.createdAt ?? new Date().toISOString(),
            },
          ],
        }))
      );
    } catch {
      showToast(t("attachFailed"), false);
    } finally {
      setUploading(false);
    }
  }

  // Ticket 20 row 113 (16 Sept). Two separate faults, and the second is the
  // worse one.
  //
  // The call sent the THREAD id where /tasks/:id/stop wants the GOAL id. The
  // chat view is handed a thread and never learns the goal's id, and guessing
  // one would be worse than failing: within a single account the two counters
  // can collide, and a wrong guess stops somebody's OTHER goal.
  //
  // 2 Oct: that is not hypothetical. The backend confirms /tasks/:id/stop
  // reads the number as a goal id FIRST and only falls back to treating it as
  // a thread id, so a thread whose number happens to match one of the same
  // person's goal ids stops that other goal silently. POST /threads/:id/stop
  // now exists, reads a thread id only, and cannot do that. It is what this
  // calls. Both routes end in the same function, so the stopped:false
  // handling below is unchanged.
  //
  // This mattered more from today: Stop used to appear only on threads that
  // read as unfinished, and now appears on every goal thread, so the number
  // of presses that could land on the wrong goal went up with it.
  //
  // Meanwhile the failure vanished into a toast that clears itself after two
  // and a half seconds. The tester pressed Stop three times and saw nothing
  // at all. Someone who believes a goal stopped, while it keeps running and
  // keeps waking them, is worse off than someone who is told it failed: the
  // false calm is the actual harm, not the 404. So a failed stop now leaves
  // a banner that stays until it is dismissed, and says plainly that the
  // goal is still running.
  async function stopTask() {
    if (stopping) return;
    setStopping(true);
    setStopFailed(false);
    try {
      const res = await fetch(`${BASE_URL}/threads/${threadId}/stop`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
      });
      if (res.status === 401) { forceLogin(); return; }
      if (!res.ok) { setStopFailed(true); return; }
      // 2 Oct. Since Stop is now offered on any goal thread, it can be pressed
      // when there is nothing running. The server says so plainly
      // (stopped: false, reason "no_open_goal") and the screen has to pass
      // that on: "stopped" after a press that stopped nothing is the same
      // class of fault as the delete dialog that said the work would stop.
      const body = await res.json().catch(() => ({})) as { stopped?: boolean; data?: { stopped?: boolean } };
      const stoppedFlag = body?.stopped ?? body?.data?.stopped;
      showToast(stoppedFlag === false ? t("nothingToStop") : t("stopped"), true);
    } catch {
      setStopFailed(true);
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
      if (document.hidden && recordingRef.current) {
        // A recording the person walked away from is not theirs to pay for.
        recordingRef.current.cancel();
        recordingRef.current = null;
        setVoiceState("idle");
        setInput(inputBeforeRecordingRef.current);
      }
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

  // Row 226, iPhone, third reading (25 Sept). Stopping asked the engine to
  // stop and then WAITED FOR ITS PERMISSION to leave the recording state: the
  // screen only went back to idle when `onend` arrived. On iOS that event can
  // never come. The screen then keeps the red stop button forever, and every
  // further tap calls stop() on a recogniser that is already gone — which is
  // exactly what "the microphone button cannot be pressed at all" looks like
  // from the outside. The control was alive the whole time and had nothing
  // left to do.
  //
  // So leaving is ours to decide, not the engine's. The state goes back
  // immediately, abort follows stop because one of them may be ignored, and
  // an `onend` that turns up afterwards finds nothing to do. A person can
  // always get out of a screen that says it is listening.
  function stopRecognition() {
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    setVoiceState("idle");
    if (!rec) return;
    try { rec.stop(); } catch { /* already stopped */ }
    try { rec.abort(); } catch { /* already gone */ }
  }

  function startRecognition() {
    const SR = getSpeechRecognition();
    // Row 226 (25 Sept): this returned in silence. On an iPhone that had just
    // been restarted the button then did nothing at all, twice over — no
    // recording, no message, nothing to report — which is the same silence
    // the error handling below was written to end. Saying it costs one line.
    if (!SR) {
      showToast(t("micFailed"), false);
      return;
    }

    const recognition = new SR();
    recognition.lang = speechLang();
    recognition.continuous = true;
    recognition.interimResults = true;

    inputBeforeRecordingRef.current = input;
    confirmedTranscriptRef.current = "";
    recognitionRef.current = recognition;
    setVoiceState("recording");

    // Row 226, the iPhone half. The box showed "გისმენ…" with the stop button
    // and nothing was ever written: no result, no end, no error. An engine
    // that goes quiet leaves the screen claiming to listen forever, and the
    // person has no way back — after a restart the button looked dead because
    // the screen had never left the recording state.
    //
    // So silence has a deadline. Any real event clears it; nothing arriving
    // within it puts the screen back and says so, which is a worse outcome
    // than working and a much better one than lying.
    let heard = false;
    const clearStall = () => { heard = true; };
    recognition.addEventListener("start", clearStall);
    recognition.addEventListener("result", clearStall);
    const stall = setTimeout(() => {
      if (heard || recognitionRef.current !== recognition) return;
      try { recognition.abort(); } catch { /* already gone */ }
      recognitionRef.current = null;
      setVoiceState("idle");
      setInput(inputBeforeRecordingRef.current);
      showToast(t("micFailed"), false);
    }, 6000);

    recognition.onresult = (e) => {
      // Row 226: rebuilt from the whole result list every time rather than
      // accumulated, so an engine that re-delivers a final result cannot add
      // the same words twice. See transcriptOf.
      const { final, interim } = transcriptOf(e);
      confirmedTranscriptRef.current = final;
      const base = inputBeforeRecordingRef.current;
      const combined = [final, interim].filter(Boolean).join(" ");
      setInput(base ? base + " " + combined : combined);
    };

    recognition.onend = () => {
      clearTimeout(stall);
      recognitionRef.current = null;
      setVoiceState("idle");
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    recognition.onerror = (e) => {
      clearTimeout(stall);
      recognitionRef.current = null;
      setVoiceState("idle");
      setInput(inputBeforeRecordingRef.current);
      // Row 226: two error names were handled and every other one was
      // swallowed, so on the iPhone — where the failure has neither of those
      // names — the button produced no recording, no prompt and no message.
      // Every failure now says something.
      if (e.error === "not-allowed") {
        showToast(t("micNotAllowed"), false);
      } else if (e.error === "network") {
        showToast(t("netRequired"), false);
      } else if (e.error !== "aborted" && e.error !== "no-speech") {
        // aborted is the person stopping it and no-speech is silence; neither
        // is a fault worth interrupting them over.
        showToast(t("micFailed"), false);
      }
    };

    // start() can throw synchronously — on iOS it is one of the ways the
    // button did nothing at all.
    if (beginRecognition(recognition) !== null) {
      clearTimeout(stall);
      recognitionRef.current = null;
      setVoiceState("idle");
      showToast(t("micFailed"), false);
    }
  }

  // Row 226: the recorded path. getUserMedia raises the real permission
  // prompt — the one iOS never showed, which is why the permission state sat
  // at "prompt" forever — and the audio goes to a recogniser that knows
  // Georgian. Every refusal says which refusal it was.
  async function startDictation() {
    const limits = await speechLimits();
    if (!limits.enabled) {
      // Not a failure and not a silence: the feature is off, and a person who
      // presses a button deserves to know that rather than watch nothing.
      // Written down too, because "the switch was off" and "the recorder
      // never ran" look the same to everybody who was not holding the phone.
      recordSpeechStage("recorder", "start-failed", "not-enabled");
      showToast(t("micOff"), false);
      return;
    }
    inputBeforeRecordingRef.current = input;
    let rec: Recording;
    try {
      rec = await startRecording(limits.maxDurationMs, () => showToast(t("micTooLong"), false));
    } catch (err) {
      const reason = err instanceof Error ? err.message : "";
      recordSpeechStage("recorder", "start-failed", reason || "unnamed");
      showToast(reason === "mic-denied" ? t("micNotAllowed") : t("micFailed"), false);
      return;
    }
    recordingRef.current = rec;
    recordSpeechStage("recorder", "start");
    setVoiceState("recording");
  }

  async function stopDictation() {
    const rec = recordingRef.current;
    recordingRef.current = null;
    if (!rec) { setVoiceState("idle"); return; }
    setVoiceState("processing");
    const captured = await rec.stop();
    if (!captured) {
      recordSpeechStage("recorder", "end", "nothing-captured");
      setVoiceState("idle");
      return;
    }
    // The size and the container, before the upload: an empty blob and a
    // refused upload are different failures and used to read the same.
    recordSpeechStage("recorder", "end", `${captured.blob.size}b ${captured.mime}`);
    const result = await transcribe(
      captured.blob,
      captured.mime,
      captured.durationMs,
      speechLang().split("-")[0] || null,
      threadId
    );
    setVoiceState("idle");
    recordSpeechStage(
      "recorder",
      result.state === "text" ? "result" : "error",
      result.state === "text" ? `${result.text.length} chars` : result.reason
    );
    if (result.state === "text") {
      const base = inputBeforeRecordingRef.current;
      setInput(base ? base + " " + result.text : result.text);
      setTimeout(() => inputRef.current?.focus(), 50);
      return;
    }
    // Named, so the next report says which wall it hit rather than "the
    // microphone does not work".
    const said =
      result.reason === "no_speech" ? t("micHeardNothing")
      : result.reason === "too_long" || result.reason === "too_large" ? t("micTooLong")
      : result.reason === "not_enabled" ? t("micOff")
      : result.reason === "network" || result.reason === "timeout" ? t("netRequired")
      // 27 Sept: the recogniser refusing is NOT the microphone failing. If the
      // server has no key for it, every press would have reported "the
      // microphone did not start" — sending the next bug report to the wrong
      // half of the product, with a person's honest testimony behind it. The
      // recording worked; the writing-down did not, and the screen says which.
      : result.reason === "recognizer_failed" || result.reason === "unsupported_format"
        ? t("micWriteFailed")
      : t("micFailed");
    showToast(said, false);
  }

  function handleMicClick() {
    if (useRecorder) {
      if (voiceState === "recording") void stopDictation();
      else if (voiceState === "idle") void startDictation();
      return;
    }
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
            // #68: the index belongs to the set it came with. It moves only
            // when the set does, so a restored set keeps its own button and
            // a kept set keeps the index it already had.
            otherChoiceIndex:
              !ts.loading && Array.isArray(page.choices) && page.choices.length > 0
                ? page.otherChoiceIndex ?? null
                : ts.otherChoiceIndex,
            // Row 3 note from the backend (24 Sept): the server sends the
            // conversation's language on the envelope. Kept only when it
            // arrives — an older deployment that sends nothing must not
            // overwrite what a previous load learned.
            language: page.language ?? ts.language,
          }))
        );
        setLoadPhase("done");
      })
      .catch((err) => {
        if (cancelled) return;
        // Deep link into an incoming_ask on an expired account (8 Sept): the
        // thread itself is reachable, only GET /threads is gated. So we only
        // send the user to /pricing when THIS thread returns 403 — not just
        // because the sidebar list did.
        if (err instanceof Error && err.message === "subscription_required") {
          router.replace("/pricing");
          return;
        }
        setLoadPhase(msgCountRef.current > 0 ? "done" : "failed");
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

  // FE-1 (30 Aug): sticky-bottom — only auto-scroll while the user is already
  // near the bottom. Scrolling up to reread mid-stream must not get yanked
  // back down on every token.
  // Ticket 19 [19] (15 Sept): raised from 80. On a phone the container height
  // is fractional and iOS rubber-banding leaves a few pixels of slack, so a
  // reader sitting at the very bottom could measure as "not at the bottom"
  // and lose the follow.
  const NEAR_BOTTOM_PX = 120;
  const nearBottomRef = useRef(true);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  // Ticket 19 [19]: scrollIntoView({behavior:"smooth"}) is the wrong tool here.
  // It animates towards a target measured when it starts, so an answer that is
  // still growing lands short, and in iOS Home-Screen mode — a different
  // viewport from a Safari tab, which is why Ticket 9 [27] read as fixed —
  // it is unreliable inside a nested scroller. Setting scrollTop on the
  // container itself is synchronous and cannot be outrun by the content.
  const stickToBottom = useCallback((smooth: boolean) => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollHeight - el.clientHeight;
    if (smooth && typeof el.scrollTo === "function") {
      el.scrollTo({ top, behavior: "smooth" });
    } else {
      el.scrollTop = top;
    }
  }, []);

  function updateNearBottom() {
    const el = scrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJumpToBottom(!near);
  }

  function onMessagesScroll(e: React.UIEvent<HTMLDivElement>) {
    if (e.currentTarget.scrollTop < OLDER_TRIGGER_PX) loadOlder();
    updateNearBottom();
  }

  function jumpToBottom() {
    nearBottomRef.current = true;
    setShowJumpToBottom(false);
    stickToBottom(true);
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
    if (nearBottomRef.current || firstPaintRef.current) {
      stickToBottom(!firstPaintRef.current);
    }
    firstPaintRef.current = false;
  }, [messages, stickToBottom]);

  useEffect(() => {
    if (!streaming && !loading) return;
    if (!nearBottomRef.current) return;
    stickToBottom(true);
  }, [streaming, loading, stickToBottom]);

  // Ticket 19 [19]: the effects above fire when the LAST MESSAGE ID changes or
  // a run starts and stops. Neither fires while an answer is growing — a step
  // row appearing, a bubble reflowing, a long reply landing in one piece — so
  // the last line walked off the bottom and the reader had to chase it by
  // hand. Watching the content box means every height change is followed,
  // whatever caused it.
  //
  // It follows ONLY when the reader is already at the bottom: someone who has
  // scrolled up to reread is left alone, which is the half of this that a
  // plain "scroll to the end" would get wrong.
  const isEmptyThread = messages.length === 0;
  useEffect(() => {
    const el = scrollRef.current;
    const content = el?.firstElementChild;
    if (!el || !content || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (nearBottomRef.current) stickToBottom(false);
    });
    ro.observe(content);
    return () => ro.disconnect();
    // The container swaps its child when the first messages land, so the
    // observer re-attaches then; otherwise it would keep watching the
    // detached loading state and follow nothing.
  }, [stickToBottom, isEmptyThread]);

  // inReplyTo (Task 98): the pending bubble's server message id, so the
  // backend gets an unambiguous link to the item even when two bubbles are
  // on screen. Text is still what is sent — one consent gate on the server.
  const sendMessage = useCallback(
    async (text: string, echo: boolean = true, inReplyTo?: string | number) => {
      if (voiceState === "recording") {
        stopRecognition();
      }
      const trimmed = text.trim();
      if (!trimmed || rateLimitedUntil > Date.now() || limitHit) return;

      // Sending implies wanting to see the reply — resume auto-scroll even
      // if the user had scrolled up to reread something.
      nearBottomRef.current = true;
      setShowJumpToBottom(false);

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
          otherChoiceIndex: null,
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
          body: JSON.stringify(inReplyTo != null ? { message: trimmed, in_reply_to_message_id: String(inReplyTo) } : { message: trimmed }),
        });

        if (res.status === 401) { forceLogin(); return; }

        if (res.status === 402) {
          const body = await res.json().catch(() => ({}));
          if (body.reason === "insufficient_tokens") {
            setLimitHit(true);
            setLimitMsg(typeof body.error === "string" ? body.error : null);
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

  // #68. Every button set now ends with „სხვა, მე დავწერ". That button is not
  // an answer and must not be sent as one: it names an intention to type, and
  // the only thing it should do is hand over the composer. Sent, it costs a
  // turn — the assistant reads it as „let me type" and asks again, so the
  // person answers the same question twice.
  const pickChoice = useCallback(
    (
      choice: string,
      index: number,
      all: readonly string[],
      otherIndex: number | null | undefined,
      send: () => void,
    ) => {
      if (isWriteMyOwn(choice, index, all, otherIndex)) {
        inputRef.current?.focus();
        return;
      }
      send();
    },
    []
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

  // Row 294: the single line shown while the run is going. The newest step is
  // the freshest thing we have — both tool_progress and step_summary append a
  // step row, while `progress` only ever holds the last tool_progress — so the
  // step wins, and `progress` is the fallback for the gap before the first one
  // arrives. The key is what makes React remount the line so the change is
  // visible; without it the text would swap in place and read as frozen.
  //
  // #397 / D581 (2 Oct). The server now writes the stage of a search into the
  // thread's own status_line — searching your contacts, then their contacts,
  // then the web, then writing the answer — and that sentence already shows in
  // the header and the list.
  //
  // It wins here too, and the reason is the decision itself: ONE sentence that
  // changes. Left alone, the header would show the server's stage while this
  // line showed the model's narration, and the person would be watching two
  // different moving sentences about one run. Two lines that are each correct
  // still answer different questions, and the row that started this was
  // somebody overwhelmed by how much the screen was saying.
  //
  // Only while the thread is actually working, because status_line also
  // carries finished and snoozed sentences, and one of those under a spinner
  // would be worse than the generic word. Everything else is unchanged, so a
  // deployment that sends no status_line, and any run that is not a search,
  // still read the newest step exactly as before.
  const newestStep = trailingSteps[trailingSteps.length - 1];
  const searchStage = thread?.status === "working" ? thread.status_line?.trim() : null;
  const liveStep = searchStage
    ? { key: searchStage, text: searchStage }
    : newestStep
    ? { key: newestStep.id, text: renderStepText(newestStep.content) }
    : progress
      ? { key: progress, text: stripEmoji(progress) }
      : { key: "working", text: t("workingOnIt") };

  // Task 25 (11 Sept): buttons vanished ~1.7s after appearing. The refetch
  // that follows thread_updated merges the server's rows, and the server can
  // persist a "step" row (or a scrubbed copy of the reply) AFTER the answer —
  // so the raw last item stopped being the assistant's message and the gate
  // below hid the choices. Judge by the last non-step message instead; the
  // choices themselves are still cleared only when the user sends.
  let lastMsg = messages[messages.length - 1];
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].kind !== "step") { lastMsg = messages[i]; break; }
  }
  const lastIsAssistantMessage = lastMsg?.kind === "message" && lastMsg.role === "assistant";
  const showOptions = !loading && lastIsAssistantMessage && options.length > 0;
  // The thread-level copy is now only for choices that arrived over SSE before
  // any row carried them. Once the row has its own, the bubble renders them and
  // this would draw the same buttons a second time.
  const lastHasOwnChoices = (lastMsg?.choices?.length ?? 0) > 0;
  const showChoices = !loading && lastIsAssistantMessage && choices.length > 0 && !lastHasOwnChoices;
  const composerBlocked = rateLimited || limitHit;
  const lastUserText = [...messages].reverse().find((m) => m.kind === "message" && m.role === "user")?.content;

  const showInitialLoad = loadPhase !== "done" && messages.length === 0;

  const firstAssistant = isRequest ? messages.find((m) => m.kind === "message" && m.role === "assistant") : undefined;
  const reqQuote = firstAssistant ? extractQuote(firstAssistant.content) : null;
  const reqNames = isRequest && thread?.title?.includes("→")
    ? thread.title.split("→").map((s) => s.trim())
    : null;
  const reqResolved = resolvedRequests[threadId]?.action;

  // 20 Sept: the server's own sentence wins over the generic word, exactly as
  // on the list row. Fixing only the row was half a fix — this is the screen
  // the row opens, so the wrong label came back one tap later. A goal halted
  // because WE ran out of tokens read as "needs your answer" here too.
  const statusLabel = thread?.status_line
    ? thread.status_line
    : taskStatus
    ? taskStatus === "working" ? t("stWorking")
      : taskStatus === "waiting" ? t("stWaiting")
      : taskStatus === "needs_you" ? t("stNeedsYou")
      : taskStatus === "failed" ? t("stFailed")
      // Stopped and finished both arrive as "done"; only goal_stopped tells
      // them apart, and the difference is whether the person did it.
      : thread?.goal_stopped === true ? t("stStopped")
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
      {/* Ticket 20: a failed stop stays on screen. The goal is still running,
          so the person needs to know now, not for two seconds. */}
      {stopFailed && (
        <div
          role="alert"
          className="flex items-start gap-3 px-4 py-3"
          style={{ background: "var(--danger-bg, #FDECEC)", color: "var(--danger)", fontSize: "13px" }}
        >
          <span style={{ flex: 1 }}>{t("stopFailed")}</span>
          <button
            type="button"
            onClick={() => setStopFailed(false)}
            style={{ fontWeight: 600, textDecoration: "underline", flexShrink: 0 }}
          >
            {t("stopFailedDismiss")}
          </button>
        </div>
      )}

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
            <span style={{ font: "600 11px/15px var(--font-system)", color: !thread?.status_line && (taskStatus === "needs_you" || taskStatus === "failed") ? "var(--request-accent)" : "var(--ink-soft)" }}>
              {statusLabel}
            </span>
          )}
        </div>

        {/* #507. The title is the only part allowed to give way: it already
            truncates. Without shrink-0 here, flexbox squeezes the buttons and
            the badge below their own text, which is what printing one word
            over another looks like. */}
        <div className="flex shrink-0 items-center gap-3">
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
          {/* 2 Oct. This used to hide Stop unless the THREAD read as unfinished.
              A goal can be open while its thread reads "done" — a run ended and
              nobody owes an answer yet — and in that state the only button on
              screen that sounded like stopping was Delete. Ninia pressed it and
              lost the whole conversation, which Delete does not undo.
              Offering Stop when there is nothing to stop costs a sentence
              saying so. Hiding it cost somebody their conversation. */}
          {thread?.is_task === true && (
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
          {/* Row 282: the badge is the balance, so with no balance there is
              no badge. It showed 0 to people who had tokens, and a wrong
              number about someone's money is worse than no number. */}
          {balance != null && (
            <span className={`token-badge${balanceLow ? " low" : ""}`}>
              <i className="dot" style={{ width: 8, height: 8, borderRadius: "50%", background: balanceLow ? "var(--request-accent)" : "var(--accent)", display: "inline-block" }} />
              <span className="count">
                {fmtTokens(Math.max(0, balance))}{balanceLow ? ` · ${t("lowSuffix")}` : ""}
              </span>
            </span>
          )}
          <NotificationButton />
          {/* #71: the conversation as a file. An icon, not a word, because
              the top bar on a phone has no room for a sixth label — see
              #507, which was that bar running out of width. */}
          <button
            onClick={handleExport}
            disabled={exporting}
            aria-label={t("exportChat")}
            title={t("exportChat")}
            className="rounded-lg p-1.5 transition-colors hover:bg-black/5 disabled:opacity-50"
            style={{ color: "var(--ink-soft)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
              <path d="M10 3v9M10 12l-3.2-3.2M10 12l3.2-3.2M4 15.5h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
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

      <div className="relative flex-1 min-h-0">
      <div className="h-full overflow-y-auto" ref={scrollRef} onScroll={onMessagesScroll}>
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

            {renderBlocks.map((block) => {
              if (block.type === "steps") {
                const gid = stepsGroupId(block.steps);
                return (
                  <StepGroup
                    key={gid}
                    steps={block.steps}
                    label={chrome.steps.replace("{n}", String(block.steps.length))}
                    open={openSteps.has(gid)}
                    onToggle={() => toggleSteps(gid)}
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
                  {/* Row 312: this reply's own steps, and no others. */}
                  {block.steps.length > 0 && (() => {
                    const gid = stepsGroupId(block.steps);
                    return (
                      <StepGroup
                        key={gid}
                        steps={block.steps}
                        label={chrome.steps.replace("{n}", String(block.steps.length))}
                        open={openSteps.has(gid)}
                        onToggle={() => toggleSteps(gid)}
                      />
                    );
                  })()}
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
                  {/* Task 98: this bubble's own buttons — shown until the user
                      answers THIS question.
                      Row 3a (24 Sept): "answered" used to mean any later user
                      message at all. Thread 17528: a plan with two buttons, the
                      owner typed one more line, and the only way to approve the
                      plan was gone — permanently, because the test is re-run on
                      every load and the server keeps returning those two labels.
                      Approving is what sends messages in the owner's name, so
                      the cost of that shortcut was an owner who could not act
                      and was told nothing. Answering means picking one of the
                      offered labels, which is exactly what pressing a button
                      sends, so the buttons still vanish the instant one is
                      pressed. */}
                  {msg.choices && msg.choices.length > 0 && !loading && (() => {
                    const idx = messages.indexOf(msg);
                    const offered = msg.choices!;
                    const answered = messages
                      .slice(idx + 1)
                      .some((m) => m.role === "user" && offered.includes(m.content.trim()));
                    return !answered;
                  })() && (
                    <div className="decision-card" style={{ marginLeft: "36px" }}>
                      <ChoiceButtons
                        choices={msg.choices}
                        notes={msg.choiceNotes}
                        keyPrefix={msg.id}
                        onPick={(choice, ci) => pickChoice(choice, ci, msg.choices ?? [], msg.otherChoiceIndex, () => sendMessage(choice, true, msg.serverId))}
                      />
                    </div>
                  )}
                  {msg.shareText && (
                    <ShareInviteButton text={msg.shareText} label={chrome.share} />
                  )}
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
                        /* Item 5: the same two ways to say yes as the list
                           row, and now literally the same component, so a
                           number cannot move on one screen for a reason that
                           was never written on the other. */
                        <RequestActions onResolve={(a) => resolveRequest(threadId, a)} />
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
                    {mdSource(revealedStreamText)}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* FE-3 (30 Aug): the streamed text can look finished while the run
                is still open (choices/options only land on run_complete) —
                show a quiet thinking indicator exactly where those buttons
                will appear, so it doesn't read as "done". Swapped out the
                instant run_complete delivers them. */}
            {loading && streamingActive && (
              <div className="flex items-center gap-1.5" style={{ marginLeft: "36px" }}>
                <span className="sk-dot" style={{ width: 6, height: 6 }} />
                <span className="sk-dot" style={{ width: 6, height: 6, animationDelay: "0.15s" }} />
                <span className="sk-dot" style={{ width: 6, height: 6, animationDelay: "0.3s" }} />
              </div>
            )}

            {/* Row 294 (30 Sept). This used to stack a line per step: six
                lines for one question, and the screen kept growing while the
                person waited. It is one line now, replaced as the run moves,
                beside the figure that is already moving.

                Nothing is dropped by not stacking. Every one of those steps is
                rendered in full under the reply the moment the run finishes
                (row 312), so this is a change of when they are read, not
                whether. What matters while waiting is the step happening NOW. */}
            {loading && (
              <div className="flex items-start" style={{ gap: "10px" }}>
                <AllyAvatar />
                <div className="flex items-center gap-2" style={{ flex: 1, minWidth: 0 }}>
                  {!streamingActive && (
                    <AllyAnim clip={workingClip(trailingSteps.length)} size="inline" />
                  )}
                  <p key={liveStep.key} className="working-line">{liveStep.text}</p>
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
                <ChoiceButtons
                  choices={choices}
                  notes={choiceNotes}
                  keyPrefix="thread"
                  onPick={(choice, ci) => pickChoice(choice, ci, choices, otherChoiceIndex, () => sendMessage(choice))}
                />
              </div>
            )}

            {/* Row 305b: a request that arrived inside an existing ask thread.
                It belongs at the bottom, where the request actually is, and it
                is labelled because the sentences above it are a different
                conversation: without the label this reads as four odd answers
                to the question the owner asked earlier. The ask's own yes / no
                / later buttons are untouched and keep their place. */}
            {carriesRequest && !reqResolved && (
              <div style={{ marginLeft: "36px" }} className="flex flex-col gap-2">
                <div className="rc-label">{t("introRequestLabel")}</div>
                <RequestActions onResolve={(a) => resolveRequest(threadId, a)} />
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

      {/* FE-1 (30 Aug): reappears once the user scrolls away from the
          bottom during an active stream — tap to resume auto-scroll. */}
      {showJumpToBottom && (
        <button
          type="button"
          onClick={jumpToBottom}
          className="absolute left-1/2 flex items-center gap-1.5 rounded-full transition-colors"
          style={{
            bottom: "16px",
            transform: "translateX(-50%)",
            padding: "7px 14px",
            background: "var(--ink-strong)",
            color: "var(--bg)",
            fontSize: "12.5px",
            fontWeight: 600,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5">
            <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("jumpToBottom")}
        </button>
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
            {tokensGone
              ? granted > 0 && resetsAt
                ? tf("tokensGone", { n: fmtTokens(granted), date: fmtDateLoc(resetsAt) })
                : granted > 0 || resetsAt
                  ? t("tokensGoneNoDate")
                  : /* Neither an amount nor a date: say the one thing that is
                       true and stop. Inventing a return here is how a screen
                       ends up promising something nobody owes. */
                    t("tokensGoneBare")
              : balanceLow
                ? tf("tokensAlmostGone", { n: fmtTokens(Math.max(0, balance ?? 0)) })
                : chrome.spent}
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
              {/* Task 12: prefer the server's own 402 text (it names the right
                  window); fall back to the derived wording when absent. */}
              {limitMsg
                ? limitMsg
                : isTrialWallet
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
                lineHeight: "1.5",
                maxHeight: "120px",
                paddingTop: "7px",
                paddingBottom: "7px",
              }}
            />

            {/* #892: attach a list. Left of the mic, because it belongs with
                what the owner is composing rather than with sending it. */}
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                // Cleared immediately so that choosing the SAME file twice
                // in a row still fires a change event the second time.
                e.target.value = "";
                if (f) void handleFile(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || composerBlocked}
              aria-label={t("attachFile")}
              title={t("attachFile")}
              className="flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
              style={{ width: 38, height: 38, background: "transparent", color: "var(--meta)" }}
            >
              {uploading ? (
                <span
                  className="h-4 w-4 rounded-full border-2 animate-spin"
                  style={{ borderColor: "var(--placeholder)", borderTopColor: "transparent" }}
                />
              ) : (
                <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
                  <path
                    d="M13.5 6.5l-5.2 5.2a1.9 1.9 0 002.7 2.7l5.2-5.2a3.3 3.3 0 00-4.7-4.7l-5.2 5.2a4.7 4.7 0 006.6 6.6l4.4-4.4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>

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

// Row 306 (30 Sept). The buttons under a reply, with the server's note beneath
// any button that has one. `choice_notes` is optional and absent on nearly
// every message: today only plan approval carries one, because approving is
// what writes to real people in the owner's name and the label does not say
// so. That scarcity is the design — a line under every button teaches people
// to stop reading them — so this renders nothing at all when there is nothing
// to say.
//
// With notes the buttons stack, without them they wrap as before. A note
// sitting beside the wrong button is worse than no note when the sentence is
// about who gets written to in your name.
function ChoiceButtons({
  choices,
  notes,
  onPick,
  keyPrefix,
}: {
  choices: string[];
  notes?: Record<string, string>;
  onPick: (choice: string, index: number) => void;
  keyPrefix: string;
}) {
  const hasNotes = choices.some((c) => notes?.[c]);
  return (
    <div className={hasNotes ? "flex flex-col gap-2.5" : "flex flex-wrap gap-2"}>
      {choices.map((choice, ci) => {
        const note = notes?.[choice];
        return (
          <div key={`${keyPrefix}-${ci}`} className="flex flex-col items-start gap-1">
            <button
              type="button"
              onClick={() => onPick(choice, ci)}
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
            {note && <span className="req-note">{note}</span>}
          </div>
        );
      })}
    </div>
  );
}

// #794 (4 Oct, Giorgi's phone). The block showed a count that climbed from 8
// to 13 and listed nothing. The text was never missing — the server stores it
// and sends it, and the client had it — the list would not stay open.
//
// Whether it is open was this component's own state, and this component does
// not survive the run it is narrating. Its key was the block's INDEX, so any
// bubble appearing above it remounted the group and shut it; and when the run
// finished, the loose block became the reply's own block, which is a
// different instance again. Opening it during a run therefore lasted until
// the next event, which is to say not at all.
//
// So the open ones are held by the page, under an id that belongs to the RUN
// rather than to a position in a list. The same run keeps its id when a
// bubble lands above it and when its reply finally arrives, which is exactly
// when this used to close.
function StepGroup({
  steps,
  label,
  open,
  onToggle,
}: {
  steps: ChatMessage[];
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start" style={{ gap: "10px" }}>
      <AllyAvatar />
      <div className="steps" style={{ marginLeft: 0, flex: 1 }}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="steps-toggle"
        >
          <span style={{ fontSize: "10px" }}>{open ? "▾" : "▸"}</span>
          {label}
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
