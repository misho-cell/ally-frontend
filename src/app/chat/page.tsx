"use client";

import { useState, useEffect, useRef } from "react";
import { useThreads, taskStatusOf } from "@/contexts/ThreadsContext";
import { t } from "@/lib/i18n";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getSpeechRecognition(): any {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Desktop right pane, no goal selected: dogs clip + one line + the goal
// composer (ticket 6 #1 — moved here from the sidebar, so nobody types into
// the list column by accident). On mobile the home composer stays in the
// full-width list view.
export default function ChatIndexPage() {
  const { threads, threadsLoaded, threadStates, createTask } = useThreads();
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  const hasGoals = threads.some((th) =>
    taskStatusOf(th, threadStates[String(th.id)]) !== null
  );

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("netai:focus-composer", focus);
    return () => window.removeEventListener("netai:focus-composer", focus);
  }, []);

  function startMic() {
    const SR = getSpeechRecognition();
    if (!SR) {
      inputRef.current?.focus();
      return;
    }
    if (recording) {
      recognitionRef.current?.stop();
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    setRecording(true);
    let finalText = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const tr = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? " " : "") + tr.trim();
        else interim += tr;
      }
      setInput([finalText, interim.trim()].filter(Boolean).join(" "));
    };
    rec.onend = () => { recognitionRef.current = null; setRecording(false); };
    rec.onerror = () => { recognitionRef.current = null; setRecording(false); };
    rec.start();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = input.trim();
    if (!v) return;
    setInput("");
    createTask(v);
  }

  return (
    <div className="hidden md:flex flex-1 h-full flex-col" style={{ background: "var(--bg)" }}>
      {threadsLoaded && (
        <div className="empty flex-1">
          <video
            className="ally-anim"
            style={{ width: "auto", height: 160 }}
            autoPlay muted loop playsInline
            src="/assets/ally/anim/ally-dogs.mp4"
            poster="/assets/ally/anim/ally-dogs-poster.jpg"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h2>{hasGoals ? t("selectThread") : t("emptyHome")}</h2>
        </div>
      )}

      <div
        className="px-6 py-4"
        style={{ borderTop: "1px solid var(--header-border)", background: "var(--bg)" }}
      >
        <form onSubmit={submit} className="mx-auto flex items-center gap-2" style={{ maxWidth: "720px" }}>
          <div
            className="composer-pill flex flex-1 items-center gap-2 min-w-0"
            style={{ padding: "6px 6px 6px 16px", borderColor: recording ? "var(--danger)" : undefined }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? t("listening") : t("homePlaceholder")}
              className="flex-1 min-w-0 bg-transparent outline-none"
              style={{ color: "var(--ink)", fontSize: "15px", padding: "7px 0" }}
            />
            {input.trim() && (
              <button
                type="submit"
                aria-label={t("send")}
                className="flex shrink-0 items-center justify-center rounded-full"
                style={{ width: 36, height: 36, background: "var(--accent)", color: "#FBFAF4" }}
              >
                <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={startMic}
            aria-label={recording ? t("voiceStop") : t("voiceStart")}
            className="flex shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
              width: 46, height: 46,
              background: recording ? "var(--danger)" : "var(--accent)",
              color: "#FBFAF4",
            }}
          >
            <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
              <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M4 10a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="7" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
