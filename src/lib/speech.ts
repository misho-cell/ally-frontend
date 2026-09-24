// Typed Web Speech API access. TypeScript's lib.dom ships the result types
// (SpeechRecognitionResultList, SpeechRecognitionAlternative) but not the
// recogniser itself or its events, and Safari/Chrome only expose the
// prefixed constructor. Every mic feature goes through here so the browser
// sniffing and the typings live in exactly one place.

export type SpeechRecognitionEventLike = Event & {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
};

export type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
  readonly message: string;
};

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
  onstart: ((event: Event) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtor;
  webkitSpeechRecognition?: SpeechRecognitionCtor;
};

// Row 145 (20 Sept): a Georgian sentence spoken once on an iPhone came back
// as "Mujhe Ba Aar Ki photography please" — not one Georgian letter — and the
// assistant then went to work on that nonsense. The recogniser was being told
// to listen in navigator.language, the PHONE's language, which on that phone
// is not Georgian. Asked to hear a language nobody was speaking, it returned
// the nearest thing it could find.
//
// The server already knows the answer, from the owner's own words rather than
// from their handset settings, and sends it on the messages envelope. That is
// the value the recogniser needed all along.
//
// The phone's setting stays as the fallback, and nothing here refuses speech
// in another language: people switch, and a product that throws away your
// sentence for being foreign is a worse fault than the one this fixes.
const SPEECH_LANG: Record<string, string> = {
  ka: "ka-GE",
  en: "en-US",
  ru: "ru-RU",
  es: "es-ES",
};

export function speechLang(): string {
  if (typeof navigator === "undefined") return "en-US";
  try {
    // Row 218: somebody who has said which language they speak has said it
    // about their voice too, so that choice comes before the server's reading
    // of their writing.
    const chosen = localStorage.getItem("netai_locale_chosen");
    if (chosen && SPEECH_LANG[chosen]) return SPEECH_LANG[chosen];
    const fromServer = localStorage.getItem("netai_server_lang");
    if (fromServer && SPEECH_LANG[fromServer]) return SPEECH_LANG[fromServer];
  } catch {
    /* private mode — fall through to the handset */
  }
  const nav = navigator.language;
  if (!nav) return "en-US";
  const base = nav.split("-")[0];
  return SPEECH_LANG[base] ?? nav;
}

export function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Row 226 (23 Sept). One spoken Georgian sentence arrived on Android as a
// 125-character ladder — „დღეს", „დღეს რა", „დღეს რა ახალი" — each partial
// appended to the last instead of replacing it. The cause was the same in all
// three places the microphone was wired: the final text was ACCUMULATED across
// events, from `resultIndex` forward, on the assumption that every event
// carries only what is new.
//
// `event.results` is cumulative: it holds the whole utterance so far, and an
// engine is free to re-deliver a result it has already sent — Android's does.
// Accumulating then adds the same words a second and third time.
//
// So nothing is accumulated here. The transcript is rebuilt from the whole
// list on every event, which is idempotent: re-delivering a result cannot
// change the answer.
export function transcriptOf(event: SpeechRecognitionEventLike): { final: string; interim: string } {
  let final = "";
  let interim = "";
  for (let i = 0; i < event.results.length; i++) {
    const text = event.results[i][0]?.transcript ?? "";
    if (event.results[i].isFinal) {
      const t = text.trim();
      if (t) final += (final ? " " : "") + t;
    } else {
      interim += text;
    }
  }
  return { final, interim: interim.trim() };
}

// The iPhone half of the same row: the button produced no recording, no error
// and no permission prompt. start() can throw synchronously, and an error
// whose name we did not recognise was swallowed — so the two cases that look
// identical to a person, "it is not supported here" and "it failed", both
// looked like nothing at all.
//
// This returns the reason it could not start, or null if it did. Silence is
// never one of the answers.
// Row 226 (24 Sept). "The microphone records nothing" is three different
// faults wearing one sentence: the recogniser never started, it started and
// heard nothing, or it heard something and the screen did not show it. From
// the outside they are identical, and the backend has nothing to look at —
// speech-to-text is entirely in the browser and the server only ever receives
// finished text, so there is no server-side reading that could tell them
// apart.
//
// This is the same move that turned the push row from a week of guessing into
// a named cause in minutes: write down what actually happened, in a place a
// person can screenshot. It records the LAST attempt only. A log would be
// better and a log nobody can reach is worse than a line on the screen.
const SPEECH_LOG_KEY = "netai_speech_last";

export type SpeechOutcome = {
  // "start" — the recogniser accepted the call and the engine began.
  // "error" — it named a fault; detail is the engine's own error string.
  // "result" — text arrived, with how many characters.
  // "end" — it finished. Reaching "end" having only ever seen "start" is
  //         precisely the iPhone symptom: it ran and heard nothing.
  // "start-failed" — start() threw; detail is the exception name.
  stage: "start" | "error" | "result" | "end" | "start-failed";
  detail?: string;
  at: string;
  lang: string;
  standalone: boolean;
};

function record(stage: SpeechOutcome["stage"], detail?: string): void {
  try {
    const entry: SpeechOutcome = {
      stage,
      detail,
      at: new Date().toISOString(),
      lang: speechLang(),
      standalone:
        window.matchMedia?.("(display-mode: standalone)").matches === true ||
        (navigator as unknown as { standalone?: boolean }).standalone === true,
    };
    localStorage.setItem(SPEECH_LOG_KEY, JSON.stringify(entry));
  } catch {
    /* private mode: the diagnostics card then says nothing was recorded,
       which is true, rather than showing a stale entry. */
  }
}

export function lastSpeechOutcome(): SpeechOutcome | null {
  try {
    const raw = localStorage.getItem(SPEECH_LOG_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    return typeof v === "object" && v !== null && "stage" in v ? (v as SpeechOutcome) : null;
  } catch {
    return null;
  }
}

export function startRecognition(rec: SpeechRecognitionLike): string | null {
  // addEventListener, not the on* properties: every call site assigns those
  // itself and assigning them here would silently replace the caller's
  // handlers — a diagnostic that breaks the thing it is diagnosing.
  try {
    rec.addEventListener("start", () => record("start"));
    rec.addEventListener("end", () => record("end"));
    rec.addEventListener("error", (e) => record("error", (e as SpeechRecognitionErrorEventLike).error || "unnamed"));
    rec.addEventListener("result", (e) => {
      const { final, interim } = transcriptOf(e as SpeechRecognitionEventLike);
      record("result", `${final.length}+${interim.length}`);
    });
  } catch {
    /* an engine that refuses listeners still gets to try starting */
  }
  try {
    rec.start();
    return null;
  } catch (err) {
    // InvalidStateError means one is already running: stopping is the honest
    // response, not a complaint the person cannot act on.
    const name = err instanceof Error ? err.name : "";
    if (name === "InvalidStateError") {
      try { rec.abort(); } catch { /* it is already gone */ }
      return null;
    }
    record("start-failed", name || "unnamed");
    return name || "start-failed";
  }
}
