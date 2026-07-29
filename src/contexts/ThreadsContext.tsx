"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
  // Phase 2 backend fields (messenger handover §9.1) — optional until the
  // backend ships them; the frontend falls back to session-derived state.
  status?: TaskStatus;
  status_line?: string | null;
  is_task?: boolean;
};

// §4 status words — the only state language.
export type TaskStatus = "working" | "waiting" | "needs_you" | "done" | "failed";

// Frontend-tracked task metadata (stub for messenger §9.1 until the backend
// persists status/status_line/title). Kept in localStorage so goals survive
// reloads; backend fields win when present.
export type TaskMeta = {
  isTask: boolean;
  status: TaskStatus;
  statusLine?: string;
  title?: string;
  updatedAt: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: "message" | "step";
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
  // Phase 2: create a named goal from any composer input (home or +).
  createTask: (text: string) => Promise<void>;
  // Per-thread task metadata (status pills, presence count).
  tasks: Record<string, TaskMeta>;
  // Resolve an incoming request with one tap (optimistic).
  resolveRequest: (threadId: string, action: "accept" | "deny" | "later") => void;
  resolvedRequests: Record<string, { action: string; at: number }>;
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
  tasks: {},
  resolveRequest: () => {},
  resolvedRequests: {},
});

export const useThreads = () => useContext(ThreadsContext);

// Effective status for a thread: backend field wins, then live run state,
// then stored meta. Returns null for threads that are not goals (legacy).
export function taskStatusOf(
  thread: Thread,
  ts: ThreadState | undefined,
  meta: TaskMeta | undefined
): TaskStatus | null {
  if (thread.type !== "regular") return null;
  const isTask = thread.is_task === true || meta?.isTask === true;
  if (!isTask && !thread.status) return null;
  if (ts?.loading) return "working";
  return thread.status ?? meta?.status ?? "waiting";
}
