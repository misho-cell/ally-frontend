"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
};

// A single rendered item in a thread. Both final replies and intermediate
// agent steps share this shape — `kind` distinguishes them, `runId` groups a
// run's steps with its answer. Live (SSE) and stored (GET /messages) items are
// identical, so they render through the same component.
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  kind: "message" | "step";
  runId: string | null;
};

export type Option = { phone: string; name: string };

// Per-thread state. `messages` is the chronological list (messages + steps).
// The live-run fields (loading/runId/error) are driven by SSE this session.
export type ThreadState = {
  messages: ChatMessage[];
  options: Option[];
  choices: string[];
  loading: boolean;
  runId: string | null;
  error: string | null;
  loaded: boolean;
};

export const DEFAULT_THREAD_STATE: ThreadState = {
  messages: [],
  options: [],
  choices: [],
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
  // Bumped when the SSE stream (re)connects, so open threads re-fetch history
  // for catch-up. Not bumped on the very first connect.
  reconnectNonce: number;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
  threadStates: {},
  setThreadStates: () => {},
  reconnectNonce: 0,
});

export const useThreads = () => useContext(ThreadsContext);
