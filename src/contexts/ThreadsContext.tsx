"use client";
import { createContext, useContext } from "react";

export type Thread = {
  id: number;
  type: "regular" | "incoming_request" | "outgoing_request";
  title: string;
  last_message?: string;
  updated_at: string;
};

type Ctx = {
  threads: Thread[];
  setThreads: React.Dispatch<React.SetStateAction<Thread[]>>;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
});

export const useThreads = () => useContext(ThreadsContext);
