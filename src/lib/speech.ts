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
