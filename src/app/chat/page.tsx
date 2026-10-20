"use client";

import { useState, useEffect, useRef } from "react";
import { useThreads, taskStatusOf } from "@/contexts/ThreadsContext";
import { t } from "@/lib/i18n";
import { getSpeechRecognition, speechLang, transcriptOf, startRecognition, type SpeechRecognitionLike } from "@/lib/speech";
import { beginDictation, shouldRecord, micNoticeKey, type DictationHandle } from "@/lib/dictation";
import { FILE_ACCEPT, FILE_MAX_BYTES } from "@/lib/threadFiles";
import DzIcon from "@/components/DzIcons";
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
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = useState(false);
  // #2346: the chosen file waits here for Send.
  const [staged, setStaged] = useState<File | null>(null);
  const [tooBig, setTooBig] = useState(false);
  // #6205: why the microphone did not start, said under the field, since
  // this screen has no toast. Cleared on the next press.
  const [micNotice, setMicNotice] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const dictationRef = useRef<DictationHandle | null>(null);
  // #6205: a tap while the microphone is still being asked for is ignored.
  const dictationStartingRef = useRef(false);

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
    if (dictationStartingRef.current) return;
    dictationStartingRef.current = true;
    const handle = await beginDictation({
      language: speechLang().split("-")[0] || null,
      onText: (t) => setInput((prev) => (prev.trim() ? prev + " " + t : t)),
      onNotice: (reason) => setMicNotice(t(micNoticeKey(reason))),
    });
    dictationStartingRef.current = false;
    if (!handle) return;
    dictationRef.current = handle;
    setRecording(true);
  }

  function startMic() {
    setMicNotice(null);
    if (shouldRecord()) { void startMicRecorded(); return; }
    const SR = getSpeechRecognition();
    if (!SR) {
      setMicNotice(t("micFailed"));
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
    rec.onerror = (e) => {
      recognitionRef.current = null;
      setRecording(false);
      if (e.error !== "aborted" && e.error !== "no-speech") setMicNotice(t(micNoticeKey(e.error)));
    };
    if (startRecognition(rec) !== null) {
      recognitionRef.current = null;
      setRecording(false);
      setMicNotice(t("micFailed"));
    }
  }

  // #1222: a list can open a conversation, the same as a line. #2346: on
  // Send, not on choosing it, and with the line typed beside it.
  async function attach(file: File, text: string) {
    setAttaching(true);
    try {
      // 5121: a file that did not arrive goes back into the composer with
      // its line, and nothing was sent.
      if (!(await createWithFile(file, text))) {
        setStaged(file);
        setInput((cur) => cur || text);
      }
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
    if (!v) { inputRef.current?.focus(); return; }
    setInput("");
    createTask(v);
  }

  return (
    <div className="hidden md:flex flex-1 h-full flex-col" style={{ background: "#FFFFFF" }}>
      {/* 11 Oct, the FIXED2 design: the workspace bar with the updates
          button, then the welcome column. */}
      <header className="dz-topbar">
        <div>
          <b>{t("workspace")}</b>
          <small>{t("workspaceSub")}</small>
        </div>
        {/* #5382 (Giorgi): no „updates" button here; the news card's
            heading still opens that screen. */}
      </header>
      <div className="flex flex-1 overflow-y-auto px-6">
        <div className="dz-welcome">
          {threadsLoaded && (
            <>
              <p className="greeting">{firstName ? `${t("homeHello")}, ${firstName}` : t("homeHello")}</p>
              <NewsCard variant="desktop" />
              <h1>{t("homeAsk")}</h1>
              <p className="dz-welcome-sub">{hasGoals ? t("homeAskSub") : t("emptyHome")}</p>
            </>
          )}
          <form onSubmit={submit} className={`dz-wcompose${recording ? " rec" : ""}`}>
            <textarea
              ref={inputRef}
              rows={2}
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={recording ? t("listening") : t("homePlaceholder")}
              aria-label={t("homePlaceholder")}
            />
            {(staged || tooBig || micNotice) && (
              <div className="mt-1 flex flex-col gap-1">
                {staged && <StagedFile name={staged.name} onRemove={() => setStaged(null)} disabled={attaching} />}
                {/* This box has no toast of its own, so the refusal is said here. */}
                {tooBig && (
                  <p role="status" style={{ font: "500 13px/19px var(--font-system)", color: "var(--danger)" }}>
                    {t("attachTooBig")}
                  </p>
                )}
                {micNotice && (
                  <p role="status" style={{ font: "500 13px/19px var(--font-system)", color: "var(--danger)" }}>
                    {micNotice}
                  </p>
                )}
              </div>
            )}
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
            <div className="dz-wfoot">
              <button
                type="button"
                onClick={() => { setTooBig(false); fileRef.current?.click(); }}
                disabled={attaching}
                title={t("uploadFile")}
                className="dz-file-upload disabled:opacity-40"
              >
                {attaching ? (
                  <span className="h-4 w-4 rounded-full border-2 animate-spin" style={{ borderColor: "var(--placeholder)", borderTopColor: "transparent" }} />
                ) : (
                  <DzIcon name="plus" size={16} />
                )}
                <span>{t("uploadFile")}</span>
              </button>
              <button
                type="button"
                onClick={startMic}
                aria-label={recording ? t("voiceStop") : t("voiceStart")}
                className={`dz-voice${recording ? " rec" : ""}`}
              >
                {recording ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><rect x="5" y="5" width="10" height="10" rx="1.5" /></svg>
                ) : (
                  <DzIcon name="mic" size={17} />
                )}
              </button>
              <button type="submit" disabled={attaching || recording} aria-label={t("send")} className="dz-sendbtn">
                <DzIcon name="up" size={18} />
              </button>
            </div>
          </form>
          <div className="dz-suggestions">
            {([
              ["homeChipSpecialist", "people"],
              ["homeChipRecommend", "spark"],
              ["homeChipIntro", "link"],
            ] as const).map(([k, icon]) => (
              <button key={k} type="button" onClick={() => suggest(t(k))} className="dz-suggestion">
                <DzIcon name={icon} size={14} />
                {t(k)}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
