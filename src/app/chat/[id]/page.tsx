"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import NotificationButton from "@/components/NotificationButton";

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

export default function ThreadPage() {
  const params = useParams();
  const threadId = params.id as string;
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
            content: data.reply ?? "შეცდომა.",
          },
        ]);
        if (data.options?.length) setOptions(data.options);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "შეცდომა მოხდა. სცადეთ თავიდან.",
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

  async function handleSignOut() {
    const token = getToken();
    const endpoint = localStorage.getItem("push_endpoint");
    if (token && endpoint) {
      try {
        await fetch(`${BASE_URL}/notifications/subscribe`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      localStorage.removeItem("push_endpoint");
    }
    localStorage.removeItem("token");
    document.cookie =
      "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="flex items-center gap-2 border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <button
          onClick={() => router.push("/chat")}
          className="mr-1 rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 md:hidden"
          aria-label="back"
        >
          ←
        </button>
        <div className="flex flex-1 items-center justify-end gap-1">
          <NotificationButton />
          <button
            type="button"
            onClick={handleSignOut}
            className="rounded-lg px-3 py-1.5 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {initialLoading ? (
          <div className="flex h-full items-center justify-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#1a1a2e]" />
          </div>
        ) : (
          <>
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <p className="text-2xl font-semibold text-[#1a1a2e]">Hi, I&apos;m Ally</p>
                <p className="text-sm text-gray-400">Ask me anything to get started.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {messages.map((msg, i) => {
                const isLast = i === messages.length - 1;
                const showOptions =
                  isLast && msg.role === "assistant" && options.length > 0 && !loading;

                return (
                  <div key={msg.id} className="flex flex-col gap-2">
                    <div
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "rounded-br-sm bg-[#1a1a2e] text-white whitespace-pre-wrap"
                            : "rounded-bl-sm bg-white text-gray-800 shadow-sm"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => (
                                <p className="mb-2 last:mb-0">{children}</p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-semibold">{children}</strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic">{children}</em>
                              ),
                              ol: ({ children }) => (
                                <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">
                                  {children}
                                </ol>
                              ),
                              ul: ({ children }) => (
                                <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">
                                  {children}
                                </ul>
                              ),
                              li: ({ children }) => <li>{children}</li>,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>

                    {showOptions && (
                      <div className="flex flex-col gap-2 pl-1">
                        {options.map((opt) => (
                          <button
                            key={opt.phone}
                            type="button"
                            onClick={() => sendMessage(`${opt.name} (${opt.phone})`)}
                            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left text-sm shadow-sm transition-colors hover:border-[#1a1a2e] hover:bg-gray-50 active:scale-[0.98]"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e]/10 text-xs font-semibold text-[#1a1a2e]">
                              {opt.name.charAt(0).toUpperCase()}
                            </span>
                            <span className="flex flex-col">
                              <span className="font-medium text-[#1a1a2e]">{opt.name}</span>
                              <span className="text-xs text-gray-400">{opt.phone}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
                    <span className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </>
        )}
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 focus-within:border-[#1a1a2e] focus-within:ring-2 focus-within:ring-[#1a1a2e]/10">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Ally…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
            style={{ maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || loading}
            className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1a1a2e] transition-opacity disabled:opacity-30"
            aria-label="Send message"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="white"
              className="h-4 w-4"
            >
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
