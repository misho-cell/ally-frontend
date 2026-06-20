"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import NotificationButton from "@/components/NotificationButton";
import { useThreads } from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Option = { phone: string; name: string };

type ChatResponse = {
  success: boolean;
  reply: string;
  options?: Option[];
};

function getToken() {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function getUserInitial(): string {
  try {
    const token = getToken();
    if (!token) return "M";
    const payload = JSON.parse(atob(token.split(".")[1]));
    const name: string = payload.name || payload.phone || "M";
    return name.charAt(0).toUpperCase();
  } catch {
    return "M";
  }
}

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.id as string;
  const router = useRouter();
  const { threads } = useThreads();

  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const thread = threads.find((t) => String(t.id) === threadId);
  const userInitial = getUserInitial();

  useEffect(() => {
    if (!threadId) return;
    setInitialLoading(true);
    setMessages([]);
    setOptions([]);

    fetch(`${BASE_URL}/threads/${threadId}/messages`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((json) => {
        const raw: Array<{ role: string; content: string }> = json.data ?? json;
        setMessages(
          raw.map((m) => ({
            id: crypto.randomUUID(),
            role: m.role as "user" | "assistant",
            content: m.content,
          }))
        );
      })
      .catch(() => {})
      .finally(() => setInitialLoading(false));
  }, [threadId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setOptions([]);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: trimmed },
      ]);
      setInput("");
      setLoading(true);

      try {
        const res = await fetch(`${BASE_URL}/threads/${threadId}/message`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getToken()}`,
          },
          body: JSON.stringify({ message: trimmed }),
        });
        const data: ChatResponse = await res.json();
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: data.reply ?? "Error.",
          },
        ]);
        if (data.options?.length) setOptions(data.options);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Something went wrong. Please try again.",
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, threadId]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 px-5"
        style={{
          height: "62px",
          borderBottom: "1px solid var(--header-border)",
          background: "var(--bg)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => router.push("/chat")}
          className="md:hidden mr-1 rounded-lg p-1.5 transition-colors hover:bg-black/5"
          aria-label="back"
          style={{ color: "var(--ink-muted)" }}
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M12 4l-6 6 6 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <span
          className="flex-1 truncate"
          style={{ fontSize: "15.5px", fontWeight: 600, color: "var(--ink-2)" }}
        >
          {thread?.title ?? "Chat"}
        </span>

        <div className="flex items-center gap-3">
          <NotificationButton />
          <button
            style={{
              fontFamily: "var(--font-ibm-mono), monospace",
              fontSize: "12px",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: "var(--meta)",
            }}
            className="hidden sm:block transition-opacity hover:opacity-60"
          >
            Share
          </button>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold shrink-0"
            style={{ background: "var(--thread-active-bg)", color: "var(--ink-2)" }}
          >
            {userInitial}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {initialLoading ? (
          <div className="flex h-full items-center justify-center">
            <span
              className="h-5 w-5 animate-spin rounded-full border-2"
              style={{ borderColor: "var(--sidebar-border)", borderTopColor: "var(--accent)" }}
            />
          </div>
        ) : (
          <div
            className="mx-auto flex flex-col py-8 px-5"
            style={{ maxWidth: "760px", gap: "26px" }}
          >
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/ally-logo.svg"
                  alt="Ally"
                  style={{ width: 44, height: 44, borderRadius: "26%", marginBottom: "4px" }}
                />
                <p style={{ fontSize: "22px", fontWeight: 600, color: "var(--ink-strong)" }}>Hi, I&apos;m Ally</p>
                <p style={{ fontSize: "14px", color: "var(--placeholder)" }}>Ask me anything to get started.</p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isLast = i === messages.length - 1;
              const showOptions = isLast && msg.role === "assistant" && options.length > 0 && !loading;

              return (
                <div key={msg.id} className="flex flex-col gap-3">
                  {msg.role === "user" ? (
                    <div className="flex justify-end">
                      <div
                        className="max-w-[72%] px-4 py-3 whitespace-pre-wrap"
                        style={{
                          background: "var(--user-bubble-bg)",
                          color: "var(--ink)",
                          borderRadius: "18px 18px 6px 18px",
                          fontSize: "15.5px",
                          lineHeight: "1.6",
                        }}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/ally-logo.svg"
                        alt=""
                        style={{ width: 22, height: 22, borderRadius: "26%", marginTop: "2px", flexShrink: 0 }}
                      />
                      <div style={{ color: "var(--ink)", fontSize: "15.5px", lineHeight: "1.65", flex: 1 }}>
                        <ReactMarkdown
                          components={{
                            p: ({ children }) => <p style={{ marginBottom: "10px" }} className="last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong style={{ fontWeight: 600 }}>{children}</strong>,
                            em: ({ children }) => <em style={{ fontStyle: "italic" }}>{children}</em>,
                            ol: ({ children }) => <ol style={{ paddingLeft: "20px", marginBottom: "10px", listStyleType: "decimal" }} className="space-y-1 last:mb-0">{children}</ol>,
                            ul: ({ children }) => <ul style={{ paddingLeft: "20px", marginBottom: "10px", listStyleType: "disc" }} className="space-y-1 last:mb-0">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {showOptions && (
                    <div className="flex flex-col gap-2 pl-9">
                      {options.map((opt) => (
                        <button
                          key={opt.phone}
                          type="button"
                          onClick={() => sendMessage(`${opt.name} (${opt.phone})`)}
                          className="flex items-center gap-3 rounded-2xl border bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
                          style={{ borderColor: "var(--header-border)", boxShadow: "0 1px 3px rgba(0,0,0,0.05)" }}
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                            style={{ background: "var(--thread-active-bg)", color: "var(--ink-2)" }}
                          >
                            {opt.name.charAt(0).toUpperCase()}
                          </span>
                          <span className="flex flex-col">
                            <span style={{ fontWeight: 500, color: "var(--ink)", fontSize: "14px" }}>{opt.name}</span>
                            <span style={{ color: "var(--placeholder)", fontSize: "12.5px" }}>{opt.phone}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {loading && (
              <div className="flex items-start gap-3">
                <img
                  src="/ally-logo.svg"
                  alt=""
                  style={{ width: 22, height: 22, borderRadius: "26%", marginTop: "2px", flexShrink: 0 }}
                />
                <div className="flex gap-1 items-center" style={{ paddingTop: "4px" }}>
                  <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "var(--placeholder)" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "var(--placeholder)" }} />
                  <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "var(--placeholder)" }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Composer */}
      <div
        className="px-4 py-3"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          background: "var(--bg)",
          borderTop: "1px solid var(--header-border)",
        }}
      >
        <div className="mx-auto flex items-end gap-2" style={{ maxWidth: "760px" }}>
          <div
            className="flex flex-1 items-end gap-2 px-4 py-3"
            style={{
              background: "white",
              border: "1px solid var(--header-border)",
              borderRadius: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Ally…"
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none"
              style={{
                color: "var(--ink)",
                fontSize: "15.5px",
                lineHeight: "1.5",
                maxHeight: "120px",
              }}
            />
            <button
              type="button"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex shrink-0 h-8 w-8 items-center justify-center rounded-full transition-opacity disabled:opacity-30"
              style={{ background: "var(--accent)" }}
              aria-label="Send"
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
