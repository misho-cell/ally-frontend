"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import NotificationButton from "@/components/NotificationButton";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type Option = {
  phone: string;
  name: string;
};

type ChatResponse = {
  success: boolean;
  reply: string;
  options?: Option[];
};

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) router.replace("/login");
  }, [router]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text: string) => {
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
      const data = await apiFetch<ChatResponse>("/chat/message", {
        method: "POST",
        body: { message: trimmed },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: data.reply ?? "შეცდომა მოხდა. სცადეთ თავიდან.",
        },
      ]);

      if (data.options && data.options.length > 0) {
        setOptions(data.options);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: "შეცდომა მოხდა. სცადეთ თავიდან." },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  async function handleSignOut() {
    const token = localStorage.getItem("token");
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
      } catch {
        // best-effort
      }
      localStorage.removeItem("push_endpoint");
    }
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-bold text-[#1a1a2e]">Ally</h1>
        <div className="flex items-center gap-1">
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
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-2xl font-semibold text-[#1a1a2e]">Hi, I&apos;m Ally</p>
            <p className="text-sm text-gray-400">Ask me anything to get started.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const showOptions = isLast && msg.role === "assistant" && options.length > 0 && !loading;
            return (
              <div key={msg.id} className="flex flex-col gap-2">
                <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "rounded-br-sm bg-[#1a1a2e] text-white"
                        : "rounded-bl-sm bg-white text-gray-800 shadow-sm"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>

                {showOptions && (
                  <div className="flex flex-wrap gap-2 pl-1">
                    {options.map((opt) => (
                      <button
                        key={opt.phone}
                        type="button"
                        onClick={() => sendMessage(`${opt.name} (${opt.phone})`)}
                        className="rounded-full border border-[#1a1a2e] px-4 py-1.5 text-sm font-medium text-[#1a1a2e] transition-colors hover:bg-[#1a1a2e] hover:text-white active:scale-95"
                      >
                        {opt.name}
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
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="white" className="h-4 w-4">
              <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
