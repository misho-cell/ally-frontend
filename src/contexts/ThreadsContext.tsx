"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

export type Option = { phone: string; name: string };

// Per-thread live state. Message history is (re)hydrated from GET /messages;
// the live run fields (loading/runId/steps/toolProgress/error) are driven by SSE.
export type ThreadState = {
  messages: ChatMessage[];
  options: Option[];
  choices: string[];
  steps: string[];          // accumulated step_summary narrative
  toolProgress: string | null; // latest transient tool_progress line
  loading: boolean;
  runId: string | null;
  error: string | null;
  loaded: boolean;          // whether GET /messages has hydrated this thread
};

export const DEFAULT_THREAD_STATE: ThreadState = {
  messages: [],
  options: [],
  choices: [],
  steps: [],
  toolProgress: null,
  loading: false,
  runId: null,
  error: null,
  loaded: false,
};

// Immutable per-thread updater. Ensures an entry exists (default) before applying fn.
export function updateThreadState(
  map: Record<string, ThreadState>,
  threadId: string | number,
  fn: (ts: ThreadState) => ThreadState
): Record<string, ThreadState> {
  const key = String(threadId);
  const cur = map[key] ?? DEFAULT_THREAD_STATE;
  return { ...map, [key]: fn(cur) };
}

type Ctx = {
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadStates: Record<string, ThreadState>;
  setThreadStates: Dispatch<SetStateAction<Record<string, ThreadState>>>;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
  threadStates: {},
  setThreadStates: () => {},
});

export const useThreads = () => useContext(ThreadsContext);
