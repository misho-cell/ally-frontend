"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
};

type Ctx = {
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
});

export const useThreads = () => useContext(ThreadsContext);
