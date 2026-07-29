"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
  // Phase 2 backend fields (messenger handover §9.1).
  status?: TaskStatus;
  status_line?: string | null;
  is_task?: boolean;
  // One-tap request endpoints key (incoming_request threads).
  request_ref?: string | null;
};

// §4 status words — the only state language.
export type TaskStatus = "working" | "waiting" | "needs_you" | "done" | "failed";

// Frontend fallback metadata — used only when the backend fields are absent
// (optimistic title at creation, live-run status before thread_updated lands).
export type TaskMeta = {
  isTask: boolean;
  status: TaskStatus;
  statusLine?: string;
  title?: string;
  updatedAt: number;
};

// StructuredResult payload from run_complete (§7) — all fields optional.
export type ResultData = { who?: string; when?: string; where?: string; topic?: string };

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
  tasks: Record<string, TaskMeta>;
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

// Effective status: backend `status` wins, then a live in-flight run, then
// stored fallback meta. Returns null for threads that are not goals (legacy).
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
