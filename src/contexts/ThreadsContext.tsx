"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

// Page size for both lists. The backend caps limit at 200.
export const PAGE_SIZE = 30;

export type Thread = {
  id: number;
  // incoming_ask (v68): another user's assistant asking THIS user a question.
  // Plain chat — no accept/decline UI; the backend picks up the first reply.
  // campaign_invite (T8, 26 Aug): same shape as incoming_ask (is_task/status/
  // status_line) — no dedicated branch needed, it just isn't incoming_request/
  // incoming_ask so it renders through the regular goal/legacy thread list.
  type: "regular" | "incoming_request" | "outgoing_request" | "incoming_ask" | "campaign_invite";
  title: string;
  last_message?: string;
  updated_at: string;
  status?: TaskStatus;
  status_line?: string | null;
  is_task?: boolean;
  request_ref?: string | null;
  // 20 Sept: the owner stopped this goal; it did not finish. Both land on
  // status "done", so without this field the app tells someone their goal
  // completed when they are the one who halted it. May be absent on older
  // deployments, which is why only an explicit true is treated as stopped.
  goal_stopped?: boolean;
  // Time of the last MESSAGE, as distinct from updated_at, which also moves
  // when only the status changed.
  last_message_at?: string | null;
};

export type TaskStatus = "working" | "waiting" | "needs_you" | "done" | "failed";

const KNOWN_STATUSES: readonly string[] = ["working", "waiting", "needs_you", "done", "failed"];

export type ResultData = { who?: string; when?: string; where?: string; topic?: string };

// One row as the server sends it (GET /threads/:id/messages).
export type ServerMessage = {
  id?: string | number;
  created_at?: string;
  role: string;
  content: string;
  kind?: string;
  run_id?: string | null;
  // Task 98: "pending" rows carry their own buttons.
  choices?: string[] | null;
  // Task 39: filled only on the row that requested an invite link.
  share_text?: string | null;
};

export type ChatMessage = {
  // Local React key. Stable for the lifetime of the item, including optimistic
  // messages that have no server row yet.
  id: string;
  // Server row id + timestamp — the (created_at, id) pair is the paging cursor.
  serverId?: string | number;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  kind: "message" | "step" | "error";
  runId: string | null;
  // Written locally (or over SSE), not yet seen in a server fetch. Pending items
  // survive a refetch so nothing the user just saw disappears.
  pending?: boolean;
  // The POST failed — the bubble stays with a "not sent / resend" marker.
  failed?: boolean;
  // Task 98 (11 Sept): per-message buttons. A pending item (an intro that was
  // accepted, a goal question, a debrief) arrives as its OWN assistant
  // message via message_appended, never glued to the reply — and each names
  // its action. Rendered under this bubble, not under the thread's last one.
  choices?: string[];
  // Task 39 (12 Sept): the ready-to-send invite text, link already inside,
  // straight from run_complete.share_text. Shared verbatim — never rebuilt
  // from the reply, never paired with a separate url.
  shareText?: string;
};

export type Option = { phone: string; name: string };

export type ThreadState = {
  messages: ChatMessage[];
  options: Option[];
  choices: string[];
  loading: boolean;
  runId: string | null;
  error: string | null;
  loaded: boolean;
  streaming: { runId: string | null; text: string } | null;
  // Latest tool_progress line — the "what she is doing right now" line.
  progress: string | null;
  // False once a page of older history came back short — stop the spinner.
  hasMoreOlder: boolean;
  result: ResultData | null;
};

export const DEFAULT_THREAD_STATE: ThreadState = {
  messages: [],
  options: [],
  choices: [],
  loading: false,
  runId: null,
  error: null,
  loaded: false,
  streaming: null,
  progress: null,
  hasMoreOlder: true,
  result: null,
};

export function updateThreadState(
  map: Record<string, ThreadState>,
  threadId: string | number,
  fn: (ts: ThreadState) => ThreadState
): Record<string, ThreadState> {
  const key = String(threadId);
  const cur = map[key] ?? DEFAULT_THREAD_STATE;
  return { ...map, [key]: fn(cur) };
}

export function toChatMessages(raw: unknown): ChatMessage[] {
  const rows: ServerMessage[] = Array.isArray(raw) ? raw : [];
  // "event" rows are bookkeeping, never a bubble (Task 98 note from the backend).
  return rows.filter((m) => m.kind !== "event").map((m) => ({
    id: crypto.randomUUID(),
    serverId: m.id ?? undefined,
    createdAt: m.created_at ?? undefined,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    // "pending" is a message with its own buttons — same bubble, plus choices.
    kind: m.kind === "step" ? "step" : m.kind === "error" ? "error" : "message",
    runId: m.run_id ?? null,
    // Row 160 (21 Sept): buttons on a plan stopped working as soon as any
    // other message arrived, and the plan could no longer be answered at all.
    // The choices were still being sent — they ride on the assistant's own
    // row — but only "pending" rows were allowed to keep them here, so a plan
    // (a plain message with choices on the same row: 171 such rows in a
    // fortnight, against 23 pending ones) had to fall back to the
    // thread-level gate, which hides the buttons the moment the last message
    // is not the assistant's.
    //
    // Any row that carries its own choices now keeps them, whatever its kind.
    // Buttons belong to the message that offered them, not to the end of the
    // conversation.
    ...(Array.isArray(m.choices) && m.choices.length > 0 ? { choices: m.choices } : {}),
    ...(typeof m.share_text === "string" && m.share_text ? { shareText: m.share_text } : {}),
  }));
}

const contentKey = (m: ChatMessage) => `${m.role} ${m.kind} ${m.content}`;

// Fold a freshly fetched newest page into what is already on screen.
//
// Two things must survive the fetch:
//   1. older history the user scrolled up to load (it sits ABOVE the page), and
//   2. local/SSE writes the server has not caught up on yet (they sit BELOW).
// Without (2) a fetch landing right after send wipes the user's own bubble;
// without (1) any refetch throws away the history they just pulled in.
export function mergeMessages(fresh: ChatMessage[], existing: ChatMessage[]): ChatMessage[] {
  if (existing.length === 0) return fresh;

  const freshKeys = new Set(fresh.map(contentKey));
  const freshIds = new Set(fresh.filter((m) => m.serverId != null).map((m) => String(m.serverId)));
  const oldestFresh = fresh.find((m) => m.createdAt)?.createdAt;

  const older = oldestFresh
    ? existing.filter(
        (m) =>
          !m.pending &&
          !m.failed &&
          m.serverId != null &&
          !freshIds.has(String(m.serverId)) &&
          m.createdAt != null &&
          m.createdAt < oldestFresh
      )
    : [];

  const pending = existing.filter((m) => (m.pending || m.failed) && !freshKeys.has(contentKey(m)));

  // SSE-only extras (share text, per-bubble buttons) live on the local copy.
  // When the server row replaces it, carry them across — otherwise the refetch
  // that follows thread_updated drops them a second after they appear.
  //
  // Row 3c (24 Sept): only from a row the server has not spoken about yet.
  // This used to carry from EVERY local row, which meant a server row that
  // deliberately arrived with its choices cleared had them grafted straight
  // back on. That is what left three buttons on a stopped goal in thread
  // 17564, one of them offering to send an invitation on a goal that was over:
  // the stop had cleared every choices row on the server, and the client put
  // them back. `pending` marks a bubble this client invented from the stream
  // and the server has not confirmed; once a fetch has replaced it, the
  // server's word is the only word. An absent choices field and a cleared one
  // are the same sentence from the server, and both of them outrank ours.
  const extras = new Map<string, { shareText?: string; choices?: string[] }>();
  for (const m of existing) {
    if (!m.pending) continue;
    if (m.shareText || m.choices) extras.set(contentKey(m), { shareText: m.shareText, choices: m.choices });
  }
  const kept = fresh.map((m) => {
    const extra = extras.get(contentKey(m));
    if (!extra) return m;
    return {
      ...m,
      ...(!m.shareText && extra.shareText ? { shareText: extra.shareText } : {}),
      ...(!m.choices && extra.choices ? { choices: extra.choices } : {}),
    };
  });

  return [...older, ...kept, ...pending];
}

// Older page arrived — put it in front, skipping rows we already hold.
export function prependOlder(older: ChatMessage[], existing: ChatMessage[]): ChatMessage[] {
  const have = new Set(existing.filter((m) => m.serverId != null).map((m) => String(m.serverId)));
  const add = older.filter((m) => m.serverId == null || !have.has(String(m.serverId)));
  return add.length > 0 ? [...add, ...existing] : existing;
}

export type TokenBalance = {
  enabled: boolean;
  balance: number;
  grantedThisPeriod: number;
  spentThisPeriod: number;
};

type Ctx = {
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoaded: boolean;
  threadStates: Record<string, ThreadState>;
  setThreadStates: Dispatch<SetStateAction<Record<string, ThreadState>>>;
  reconnectNonce: number;
  tokens: TokenBalance | null;
  refreshTokens: () => void;
  createThread: () => void;
  createTask: (text: string) => Promise<void>;
  titles: Record<string, string>;
  // Item 5 (20 Sept): an accept must say HOW — "direct" gives the requester
  // the target's number, "via_mediator" gives out nothing. There is no bare
  // accept in this union on purpose: the server reads a missing channel as
  // direct, so a button that could not say which one was a button that gave
  // away somebody's number in silence.
  resolveRequest: (threadId: string, action: "accept_direct" | "accept_mediator" | "deny" | "later") => void;
  resolvedRequests: Record<string, { action: string; at: number }>;
  // Bumped per-thread on thread_updated — an open thread refetches its
  // messages so task-engine messages appear without any user action (v68 #5).
  threadBumps: Record<string, number>;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
  threadsLoaded: false,
  threadStates: {},
  setThreadStates: () => {},
  reconnectNonce: 0,
  tokens: null,
  refreshTokens: () => {},
  createThread: () => {},
  createTask: async () => {},
  titles: {},
  resolveRequest: () => {},
  resolvedRequests: {},
  threadBumps: {},
});

export const useThreads = () => useContext(ThreadsContext);

// Effective status: the SERVER decides. Unknown future statuses degrade to
// "working" instead of breaking the UI. Live in-flight run overrides until
// thread_updated lands. Returns null for non-goal threads (legacy, asks).
export function taskStatusOf(
  thread: Thread,
  ts: ThreadState | undefined
): TaskStatus | null {
  // FE-2 (4 Sept): campaign_invite carries the same is_task/status/
  // status_line shape as a regular goal (see the Thread type comment above)
  // and was meant to fall through to this same goal/legacy split — but this
  // gate only allowed "regular", so every campaign_invite thread (including
  // ones needing the user's reply) landed in the collapsed legacy bucket
  // instead of the main list.
  if (thread.type !== "regular" && thread.type !== "campaign_invite") return null;
  if (!thread.is_task && !thread.status) return null;
  if (ts?.loading) return "working";
  const s = thread.status;
  if (s && KNOWN_STATUSES.includes(s)) return s;
  return "working";
}

export function forceLogin() {
  try {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  } catch {}
  window.location.href = "/login";
}
