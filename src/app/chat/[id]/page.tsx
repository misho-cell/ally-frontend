"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import NotificationButton from "@/components/NotificationButton";
import { useThreads } from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SUPPORTED_LANGS = [
  "en-US", "en-GB", "es-ES", "fr-FR", "de-DE",
  "it-IT", "pt-BR", "ja-JP", "ko-KR", "zh-CN",
  "ru-RU", "ar-SA",
];

function detectLang(): string {
  if (typeof navigator === "undefined") return "en-US";
  const nav = navigator.language;
  if (SUPPORTED_LANGS.includes(nav)) return nav;
  const base = nav.split("-")[0];
  return SUPPORTED_LANGS.find((l) => l.startsWith(base)) ?? "en-US";
}

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

type VoiceState = "idle" | "recording" | "processing";

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
  const { threads, toolProgress, setToolProgress } = useThreads();

  const [messages, setMessages] = useState<Message[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const inputBeforeRecordingRef = useRef("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const thread = threads.find((t) => String(t.id) === threadId);
  const userInitial = getUserInitial();

  useEffect(() => {
    const SR = (window as Window & typeof globalThis & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    setSpeechSupported(!!SR);
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    function onVisibilityChange() {
      if (document.hidden && recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
        setVoiceState("idle");
        setInput(inputBeforeRecordingRef.current);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  function stopRecognition() {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }

  function startRecognition() {
    const SR = (window as Window & typeof globalThis & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition ||
      (window as Window & typeof globalThis & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = detectLang();
    recognition.continuous = false;
    recognition.interimResults = true;

    inputBeforeRecordingRef.current = input;
    recognitionRef.current = recognition;
    setVoiceState("recording");

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interim += t;
      }
      const base = inputBeforeRecordingRef.current;
      const appended = (final || interim).trim();
      const joined = base ? base + " " + appended : appended;
      setInput(joined);
    };

    recognition.onspeechend = () => {
      setVoiceState("processing");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setVoiceState("idle");
      setTimeout(() => inputRef.current?.focus(), 50);
    };

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      recognitionRef.current = null;
      setVoiceState("idle");
      if (e.error === "not-allowed") {
        showToast("მიკროფონის წვდომა არ არის დაშვებული");
        setInput(inputBeforeRecordingRef.current);
      } else if (e.error === "network") {
        showToast("ინტერნეტ კავშირი საჭიროა");
        setInput(inputBeforeRecordingRef.current);
      }
      // no-speech: leave input as-is, just go idle
    };

    recognition.start();
  }

  function handleMicClick() {
    if (voiceState === "recording") {
      stopRecognition();
    } else if (voiceState === "idle") {
      startRecognition();
    }
    // processing: ignore double-click
  }

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
  }, [messages, loading, toolProgress]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (voiceState === "recording") {
        stopRecognition();
      }
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
        setToolProgress(null);
        inputRef.current?.focus();
      }
    },
    [loading, threadId, setToolProgress, voiceState]
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.82)",
            color: "white",
            borderRadius: "12px",
            padding: "10px 18px",
            fontSize: "13.5px",
            zIndex: 9999,
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}

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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/ally-logo.svg"
                  alt=""
                  style={{ width: 22, height: 22, borderRadius: "26%", marginTop: "2px", flexShrink: 0 }}
                />
                {toolProgress ? (
                  <ToolProgressText key={toolProgress} text={toolProgress} />
                ) : (
                  <div className="flex gap-1 items-center" style={{ paddingTop: "4px" }}>
                    <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.3s]" style={{ background: "var(--placeholder)" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full [animation-delay:-0.15s]" style={{ background: "var(--placeholder)" }} />
                    <span className="h-2 w-2 animate-bounce rounded-full" style={{ background: "var(--placeholder)" }} />
                  </div>
                )}
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
        <style>{`
          @keyframes micPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
            50% { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
          }
        `}</style>
        <div className="mx-auto flex items-end gap-2" style={{ maxWidth: "760px" }}>
          <div
            className="flex flex-1 items-end gap-2 px-4 py-3"
            style={{
              background: "white",
              border: voiceState === "recording" ? "1px solid rgba(239,68,68,0.4)" : "1px solid var(--header-border)",
              borderRadius: "24px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              transition: "border-color 0.2s",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={voiceState === "recording" ? "ვუსმენ..." : "Message Ally…"}
              rows={1}
              className="flex-1 resize-none bg-transparent outline-none"
              style={{
                color: voiceState === "recording" ? "var(--placeholder)" : "var(--ink)",
                fontStyle: voiceState === "recording" ? "italic" : "normal",
                fontSize: "15.5px",
                lineHeight: "1.5",
                maxHeight: "120px",
              }}
            />

            {/* Mic button */}
            {speechSupported && (
              <button
                type="button"
                onClick={handleMicClick}
                disabled={voiceState === "processing"}
                aria-label={voiceState === "recording" ? "Stop recording" : "Start voice input"}
                className="flex shrink-0 h-8 w-8 items-center justify-center rounded-full transition-all"
                style={{
                  background: voiceState === "recording" ? "#ef4444" : "transparent",
                  color: voiceState === "recording" ? "white" : "var(--placeholder)",
                  opacity: voiceState === "processing" ? 0.4 : 1,
                  animation: voiceState === "recording" ? "micPulse 1.2s ease-in-out infinite" : "none",
                }}
              >
                {voiceState === "processing" ? (
                  <span
                    className="h-4 w-4 rounded-full border-2 animate-spin"
                    style={{ borderColor: "var(--placeholder)", borderTopColor: "transparent" }}
                  />
                ) : voiceState === "recording" ? (
                  // Stop icon
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <rect x="5" y="5" width="10" height="10" rx="1.5" />
                  </svg>
                ) : (
                  // Mic icon
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                    <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M4 10a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <line x1="7" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            )}

            {/* Send button — hidden while recording, shown otherwise */}
            {voiceState !== "recording" && (
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolProgressText({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: "14px",
        color: "var(--placeholder)",
        paddingTop: "3px",
        animation: "fadeInUp 0.2s ease-out",
      }}
    >
      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      {text}
    </span>
  );
}
