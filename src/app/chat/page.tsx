"use client";

import { useState, useEffect, useRef } from "react";
import { useThreads, taskStatusOf } from "@/contexts/ThreadsContext";
import { t } from "@/lib/i18n";
import { getSpeechRecognition, speechLang, transcriptOf, startRecognition, type SpeechRecognitionLike } from "@/lib/speech";
import { beginDictation, shouldRecord, type DictationHandle } from "@/lib/dictation";
import { FILE_ACCEPT, FILE_MAX_BYTES } from "@/lib/threadFiles";
import AttachIcon from "@/components/AttachIcon";
import StagedFile from "@/components/StagedFile";
import NewsCard from "@/components/NewsCard";
import { useUserName } from "@/lib/user";

// Desktop right pane, no goal selected: dogs clip + one line + the goal
// composer (ticket 6 #1). D20 (22 Aug): mic AND send are both available while
// text exists.
export default function ChatIndexPage() {
  const { threads, threadsLoaded, threadStates, createTask, createWithFile } = useThreads();
  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = useState(false);
  // #2346: the chosen file waits here for Send.
  const [staged, setStaged] = useState<File | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationRef = useRef<DictationHandle | null>(null);

  const hasGoals = threads.some((th) =>
    taskStatusOf(th, threadStates[String(th.id)]) !== null
  );
  const { name } = useUserName();
  const firstName = name.trim().split(/\s+/)[0] ?? "";

  function suggest(text: string) {
    setInput(`${text}: `);
    inputRef.current?.focus();
  }

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener("netai:focus-composer", focus);
    return () => window.removeEventListener("netai:focus-composer", focus);
  }, []);

  // 27 Sept: on an iPhone the browser's recogniser is refused in the
  // home-screen app, so this screen's microphone could not start at all —
  // which is exactly what the tester reported. It records and uploads here
  // too now, the same as the conversation composer.
  async function startMicRecorded() {
    if (dictationRef.current) {
      const h = dictationRef.current;
      dictationRef.current = null;
      await h.finish();
      setRecording(false);
      return;
    }
    const handle = await beginDictation({
      language: speechLang().split("-")[0] || null,
      onText: (t) => setInput((prev) => (prev.trim() ? prev + " " + t : t)),
      onNotice: () => { /* the screen has no toast; the field simply stays as it was */ },
    });
    if (!handle) return;
    dictationRef.current = handle;
    setRecording(true);
  }

  function startMic() {
    if (shouldRecord()) { void startMicRecorded(); return; }
    const SR = getSpeechRecognition();
    if (!SR) {
      inputRef.current?.focus();
      return;
    }
    if (recording) {
      // Row 226 (25 Sept): see the note in chat/[id]/page.tsx. Leaving the
      // recording state is not the engine's decision to make — on iOS the
      // `onend` that used to release it can simply never arrive, and the
      // control then looks dead while being perfectly alive.
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      setRecording(false);
      if (rec) {
        try { rec.stop(); } catch { /* already stopped */ }
        try { rec.abort(); } catch { /* already gone */ }
      }
      return;
    }
    const rec = new SR();
    rec.lang = speechLang();
    rec.continuous = true;
    rec.interimResults = true;
    recognitionRef.current = rec;
    setRecording(true);
    rec.onresult = (e) => {
      const { final, interim } = transcriptOf(e);
      setInput([final, interim].filter(Boolean).join(" "));
    };
    rec.onend = () => { recognitionRef.current = null; setRecording(false); };
    rec.onerror = () => { recognitionRef.current = null; setRecording(false); };
    if (startRecognition(rec) !== null) {
      recognitionRef.current = null;
      setRecording(false);
    }
  }

  // #1222: a list can open a conversation, the same as a line. #2346: on
  // Send, not on choosing it, and with the line typed beside it.
  async function attach(file: File, text: string) {
    setAttaching(true);
    try {
      await createWithFile(file, text);
    } finally {
      setAttaching(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (attaching) return;
    const v = input.trim();
    if (staged) {
      const f = staged;
      setStaged(null);
      setInput("");
      void attach(f, v);
      return;
    }
    if (!v) return;
    setInput("");
    createTask(v);
  }

  return (
    <div className="hidden md:flex flex-1 h-full flex-col justify-center overflow-y-auto py-8" style={{ background: "var(--bg)" }}>
      <div className="flex flex-col items-center px-6 pb-6">
        {threadsLoaded && (
          <div className="flex w-full flex-col items-center gap-5" style={{ maxWidth: 720 }}>
            <p style={{ font: "500 17px/24px var(--font-system)", color: "var(--ink)" }}>
              {firstName ? `${t("homeHello")}, ${firstName}` : t("homeHello")}
            </p>
            <div className="flex w-full items-center justify-center gap-5">
              <video
                className="ally-anim shrink-0"
                style={{ width: "auto", height: 96 }}
                autoPlay muted loop playsInline
                src="/assets/ally/anim/ally-dogs.mp4"
                poster="/assets/ally/anim/ally-dogs-poster.jpg"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <NewsCard className="flex-1" style={{ maxWidth: 510 }} />
            </div>
            <div className="flex flex-col items-center gap-1 text-center">
              <h2 style={{ font: "600 30px/38px var(--font-bricolage)", color: "var(--ink)" }}>
                {t("homeAsk")}
              </h2>
              <p style={{ font: "400 13.5px/20px var(--font-system)", color: "var(--ink-soft)" }}>
                {hasGoals ? t("homeAskSub") : t("emptyHome")}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* The design puts the composer under the question, not pinned to the
          bottom edge: on this screen it is the whole point of the page. */}
      <div className="px-6">
        {(staged || tooBig) && (
          <div className="mx-auto mb-2 flex flex-col gap-1" style={{ maxWidth: "720px" }}>
            {staged && <StagedFile name={staged.name} onRemove={() => setStaged(null)} disabled={attaching} />}
            {/* This box has no toast of its own, so the refusal is said here. */}
            {tooBig && (
              <p role="status" style={{ font: "500 13px/19px var(--font-system)", color: "var(--danger)" }}>
                {t("attachTooBig")}
              </p>
            )}
          </div>
        )}
        <form onSubmit={submit} className="mx-auto flex items-center gap-2" style={{ maxWidth: "720px" }}>
          <div
            className="composer-pill flex flex-1 items-center gap-2 min-w-0"
            style={{ padding: "6px 16px", borderColor: recording ? "var(--danger)" : undefined }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={recording ? t("listening") : t("homePlaceholder")}
              className="flex-1 min-w-0 bg-transparent outline-none"
              style={{ color: "var(--ink)", padding: "7px 0" }}
            />
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={FILE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setTooBig(f.size > FILE_MAX_BYTES);
              if (f.size <= FILE_MAX_BYTES) setStaged(f);
            }}
          />
          <button
            type="button"
            onClick={() => { setTooBig(false); fileRef.current?.click(); }}
            disabled={attaching}
            aria-label={t("attachFile")}
            title={t("attachFile")}
            className="flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={{ width: 40, height: 46, background: "transparent", color: "var(--meta)" }}
          >
            {attaching ? (
              <span
                className="h-4 w-4 rounded-full border-2 animate-spin"
                style={{ borderColor: "var(--placeholder)", borderTopColor: "transparent" }}
              />
            ) : (
              <AttachIcon />
            )}
          </button>
          <button
            type="button"
            onClick={startMic}
            aria-label={recording ? t("voiceStop") : t("voiceStart")}
            className="flex shrink-0 items-center justify-center rounded-full transition-colors"
            style={{
              width: 46, height: 46,
              background: recording ? "var(--danger)" : "var(--accent)",
              color: "#FFFFFF",
            }}
          >
            {recording ? (
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <rect x="5" y="5" width="10" height="10" rx="1.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 20 20" fill="none" style={{ width: 18, height: 18 }}>
                <rect x="7" y="2" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.6" />
                <path d="M4 10a6 6 0 0012 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="10" y1="16" x2="10" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="7" y1="19" x2="13" y2="19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            )}
          </button>
          {(input.trim() || staged) && !recording && (
            <button
              type="submit"
              disabled={attaching}
              aria-label={t("send")}
              className="flex shrink-0 items-center justify-center rounded-full"
              style={{ width: 46, height: 46, background: "var(--accent)", color: "#FFFFFF" }}
            >
              <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                <path d="M10 15V5M10 5L5 10M10 5L15 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
        </form>
        <div className="mx-auto mt-3 flex flex-wrap justify-center gap-2" style={{ maxWidth: "720px" }}>
          {(["homeChipSpecialist", "homeChipRecommend", "homeChipIntro"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => suggest(t(k))}
              className="transition-colors"
              style={{
                padding: "7px 14px", borderRadius: 9, border: "1px solid var(--header-border)",
                background: "#FFFFFF", font: "500 12.5px/17px var(--font-system)", color: "var(--ink-soft)",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cta-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--header-border)"; }}
            >
              {t(k)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
