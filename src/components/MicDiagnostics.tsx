"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { getSpeechRecognition, speechLang, lastSpeechOutcome, type SpeechOutcome } from "@/lib/speech";

// Row 226 (24 Sept). The same card that settled the push row, for the
// microphone. "It records nothing" is three faults in one sentence — never
// started, started and heard nothing, heard something the screen did not show
// — and nobody can tell them apart from outside the phone. The backend cannot
// help here at all: speech-to-text happens entirely in the browser and the
// server only ever receives finished text.
//
// So the phone says what happened, in a form a tester can photograph. An
// iPhone has no console, and "send us the console output" is not a request
// anybody can act on.

const L = {
  en: {
    title: "Microphone diagnostics",
    hint: "Press the microphone, speak one sentence, then screenshot this.",
    supported: "Recogniser",
    prefixed: "in this browser",
    missing: "not available in this browser",
    permission: "Permission",
    lang: "Listening for",
    installed: "Added to home screen",
    lastTry: "Last attempt",
    never: "nothing recorded yet",
    yes: "yes",
    no: "no",
    unknown: "the browser will not say",
    tabNote: "On iPhone this is worth trying both ways: from a Safari tab and from the home screen version. If one works and the other does not, that is the answer.",
    stage: {
      start: "started, then nothing further",
      error: "the engine reported a fault",
      result: "text arrived",
      end: "finished",
      "start-failed": "would not start",
    } as Record<string, string>,
  },
  ka: {
    title: "მიკროფონის დიაგნოსტიკა",
    hint: "დააჭირე მიკროფონს, თქვი ერთი წინადადება და გადაუღე ამას სქრინშოტი.",
    supported: "ამომცნობი",
    prefixed: "ამ ბრაუზერში არის",
    missing: "ამ ბრაუზერში მიუწვდომელია",
    permission: "ნებართვა",
    lang: "უსმენს ენას",
    installed: "მთავარ ეკრანზე დამატებული",
    lastTry: "ბოლო ცდა",
    never: "ჯერ არაფერი ჩაწერილა",
    yes: "კი",
    no: "არა",
    unknown: "ბრაუზერი არ პასუხობს",
    tabNote: "iPhone-ზე ღირს ორივენაირად ცდა: Safari-ს ტაბიდან და მთავარი ეკრანის ვერსიიდან. თუ ერთი მუშაობს და მეორე არა, ეს თვითონ არის პასუხი.",
    stage: {
      start: "დაიწყო და შემდეგ აღარაფერი",
      error: "ძრავმა შეცდომა დაასახელა",
      result: "ტექსტი მოვიდა",
      end: "დასრულდა",
      "start-failed": "ვერ დაიწყო",
    } as Record<string, string>,
  },
};

export default function MicDiagnostics() {
  const s = L[getLocale()];
  const [ready, setReady] = useState(false);
  // "the browser will not say" is its own answer: Safari has no microphone
  // entry in the Permissions API, and that is different from "denied".
  const [permission, setPermission] = useState<string | null>(null);
  const [last, setLast] = useState<SpeechOutcome | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      let perm: string | null = null;
      try {
        const q = await navigator.permissions?.query({ name: "microphone" as PermissionName });
        perm = q?.state ?? null;
      } catch {
        perm = null;
      }
      if (!alive) return;
      setPermission(perm);
      setLast(lastSpeechOutcome());
      setReady(true);
    })();
    return () => { alive = false; };
  }, []);

  if (!ready) return null;

  const hasRecogniser = getSpeechRecognition() !== null;
  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);

  const row = (k: string, v: string) => (
    <div className="flex items-baseline justify-between gap-4">
      <span style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{k}</span>
      <span className="text-right" style={{ fontSize: "13px", color: "var(--ink)", overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );

  // The stage, its detail and the time, together. The stage alone would lose
  // the difference between "heard nothing" and "heard something short".
  const lastLine = last
    ? `${s.stage[last.stage] ?? last.stage}${last.detail ? ` (${last.detail})` : ""} · ${new Date(last.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}${last.standalone ? "" : " · tab"}`
    : s.never;

  return (
    <div className="card flex flex-col gap-2">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
      <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.hint}</p>
      <div className="flex flex-col gap-1.5" style={{ marginTop: "4px" }}>
        {row(s.supported, hasRecogniser ? s.prefixed : s.missing)}
        {row(s.permission, permission ?? s.unknown)}
        {row(s.lang, speechLang())}
        {row(s.installed, standalone ? s.yes : s.no)}
        {row(s.lastTry, lastLine)}
      </div>
      {isIos && (
        <p style={{ fontSize: "12px", color: "var(--meta)", marginTop: "2px" }}>{s.tabNote}</p>
      )}
    </div>
  );
}
