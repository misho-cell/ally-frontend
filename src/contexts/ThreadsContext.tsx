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
  return rows.map((m) => ({
    id: crypto.randomUUID(),
    serverId: m.id ?? undefined,
    createdAt: m.created_at ?? undefined,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    kind: m.kind === "step" ? "step" : m.kind === "error" ? "error" : "message",
    runId: m.run_id ?? null,
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

  return [...older, ...fresh, ...pending];
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
  resolveRequest: (threadId: string, action: "accept" | "deny" | "later") => void;
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
