"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  // incoming_ask (v68): another user's assistant asking THIS user a question.
  // Plain chat — no accept/decline UI; the backend picks up the first reply.
  type: "regular" | "incoming_request" | "outgoing_request" | "incoming_ask";
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

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: "message" | "step" | "error";
  runId: string | null;
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
  if (thread.type !== "regular") return null;
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
