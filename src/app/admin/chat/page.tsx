"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type AdminChatResponse = {
  success: boolean;
  reply: string;
};

type SystemPromptResponse = {
  success: boolean;
  system_prompt: string;
};

const INITIAL_MESSAGE: Message = {
  id: "init",
  role: "assistant",
  content:
    "გამარჯობა! მე ვარ Ally-ს ასისტენტის კონფიგურატორი.\n\nმითხარი როგორ გინდა რომ მომხმარებლის ასისტენტი მოიქცეს და მე განვაახლებ მის ინსტრუქციებს. მაგალითად:\n- \"ასისტენტმა კარიერულ წინსვლაშიც დაეხმაროს\"\n- \"კონტაქტის პოვნისას ყოველთვის ჰკითხოს სანდოობაზე\"\n- \"უფრო მეგობრული ტონით ელაპარაკოს\"",
};

export default function AdminChatPage() {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // System prompt state
  const [promptText, setPromptText] = useState("");
  const [promptLoading, setPromptLoading] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    async function loadPrompt() {
      try {
        const data = await apiFetch<SystemPromptResponse>("/admin/system-prompt");
        setPromptText(data.system_prompt ?? "");
      } catch {
        // ignore — prompt section just stays empty
      } finally {
        setPromptLoading(false);
      }
    }
    loadPrompt();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function handleSavePrompt() {
    setSavingPrompt(true);
    setPromptError(null);
    try {
      await apiFetch("/admin/system-prompt", {
        method: "PUT",
        body: { system_prompt: promptText },
      });
      setShowConfirm(false);
      showToast("შენახულია");
    } catch {
      setPromptError("შეცდომა მოხდა. სცადეთ თავიდან.");
    } finally {
      setSavingPrompt(false);
    }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setError(null);
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    setInput("");
    setLoading(true);

    try {
      const data = await apiFetch<AdminChatResponse>("/admin/chat", {
        method: "POST",
        body: { message: text },
      });

      if (data.success === false) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "შეცდომა მოხდა. სცადეთ თავიდან.",
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "assistant", content: data.reply },
        ]);
      }
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
  }, [input, loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  return (
    <div className="flex h-full flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm">
        <Link
          href="/admin"
          className="text-sm text-gray-500 transition-colors hover:text-gray-700"
        >
          ← ადმინ პანელი
        </Link>
        <h1 className="text-sm font-bold text-[#1a1a2e]">
          ასისტენტის კონფიგურატორი
        </h1>
        <span className="text-xs text-gray-400">admin</span>
      </header>

      {/* System Prompt Panel */}
      <div className="border-b border-gray-200 bg-white">
        <button
          type="button"
          onClick={() => setPromptOpen((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>System Prompt</span>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 text-gray-400 transition-transform ${promptOpen ? "rotate-180" : ""}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {promptOpen && (
          <div className="px-4 pb-4 flex flex-col gap-3">
            {promptLoading ? (
              <div className="flex justify-center py-4">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-200 border-t-[#1a1a2e]" />
              </div>
            ) : (
              <>
                <textarea
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  rows={8}
                  className="w-full resize-y rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-800 outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10 font-mono"
                  placeholder="System prompt..."
                />
                {promptError && (
                  <p className="text-sm text-red-600">{promptError}</p>
                )}
                <button
                  type="button"
                  onClick={() => { setPromptError(null); setShowConfirm(true); }}
                  className="self-end rounded-xl bg-[#1a1a2e] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                >
                  შეინახე prompt-ად
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
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
          ))}

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

      {/* Input bar */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 pb-[env(safe-area-inset-bottom,12px)]">
        <div className="flex items-end gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-2 focus-within:border-[#1a1a2e] focus-within:ring-2 focus-within:ring-[#1a1a2e]/10">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ინსტრუქცია ასისტენტისთვის…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-gray-800 outline-none placeholder:text-gray-400"
            style={{ maxHeight: "120px" }}
          />
          <button
            type="button"
            onClick={sendMessage}
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

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4">
            <p className="text-sm text-gray-800 leading-relaxed">
              დარწმუნებული ხარ? ეს მოქმედება მთლიანად შეცვლის არსებულ prompt-ს.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={savingPrompt}
                className="rounded-xl border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                გაუქმება
              </button>
              <button
                type="button"
                onClick={handleSavePrompt}
                disabled={savingPrompt}
                className="flex items-center justify-center rounded-xl bg-[#1a1a2e] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {savingPrompt ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "დადასტურება"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#1a1a2e] px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
