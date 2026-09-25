import { authHeaders } from "@/lib/deviceId";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Row 226, the iPhone half (25 Sept). Two faults with one cause and one cure.
//
// iOS has no Georgian recogniser. Safari's SpeechRecognition is Apple's own
// dictation, `lang = "ka-GE"` is ignored there, and a Georgian sentence comes
// back as English nonsense — "Dermatology Archive archive". We never had
// Georgian on an iPhone, in any build. And in the home-screen app the engine
// refuses outright with `service-not-allowed`, while the microphone
// permission never leaves "prompt" because SpeechRecognition on iOS never
// asks for the microphone at all.
//
// Recording the audio ourselves and sending it settles both: getUserMedia
// raises the real system prompt and works in the standalone app, and the
// server's recogniser knows Georgian.
//
// This runs on iOS only for now. Android and the desktop passed on the Web
// Speech path today and moving them onto an unproven one mid testing-week
// would be a risk for nothing. Two paths are two places to be wrong, so this
// is temporary on purpose: once the server path is confirmed on an iPhone,
// everything moves here and the Web Speech code goes.

export type DictationOutcome =
  | { state: "text"; text: string; language?: string }
  // Every refusal the server can name, kept apart. An empty string with a 200
  // would be the same trap `catch {}` was: "I heard nothing" and "I could not
  // try" send a person to two different places.
  | { state: "failed"; reason: string };

export type Limits = {
  enabled: boolean;
  maxBytes: number;
  maxDurationMs: number;
  timeoutMs: number;
  types: string[];
};

// Conservative until the server says otherwise. These are a fallback for a
// deployment that has no /speech/limits, not a second source of truth.
const FALLBACK: Limits = {
  enabled: false,
  maxBytes: 5 * 1024 * 1024,
  maxDurationMs: 60_000,
  timeoutMs: 45_000,
  types: ["audio/mp4", "audio/webm", "audio/ogg"],
};

let cached: Limits | null = null;

function readLimits(raw: unknown): Limits {
  const d = (raw as { data?: Record<string, unknown> })?.data ?? (raw as Record<string, unknown>);
  const n = (v: unknown, fallback: number) => (typeof v === "number" && v > 0 ? v : fallback);
  return {
    // Absent is not "on". A deployment that does not answer this question has
    // not said yes to spending money on somebody's voice.
    enabled: d?.enabled === true,
    maxBytes: n(d?.max_bytes, FALLBACK.maxBytes),
    maxDurationMs: n(d?.max_duration_ms, FALLBACK.maxDurationMs),
    timeoutMs: n(d?.timeout_ms, FALLBACK.timeoutMs),
    types: Array.isArray(d?.accepted_types)
      ? (d.accepted_types as unknown[]).filter((t): t is string => typeof t === "string")
      : FALLBACK.types,
  };
}

export async function speechLimits(): Promise<Limits> {
  if (cached) return cached;
  try {
    const res = await fetch(`${BASE_URL}/speech/limits`, { headers: authHeaders() });
    if (!res.ok) return FALLBACK;
    cached = readLimits(await res.json());
    return cached;
  } catch {
    return FALLBACK;
  }
}

export function recorderSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    typeof MediaRecorder !== "undefined" &&
    typeof navigator?.mediaDevices?.getUserMedia === "function"
  );
}

// The container the browser will actually produce. iOS Safari gives
// audio/mp4, Android Chrome audio/webm;codecs=opus. Asking for one it cannot
// make is how a recording ends up empty, so the browser is asked first and an
// empty string means "your default, whatever it is".
function pickMime(accepted: string[]): string {
  const candidates = [
    "audio/mp4",
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  const base = (t: string) => t.split(";")[0].trim();
  for (const c of candidates) {
    if (!MediaRecorder.isTypeSupported?.(c)) continue;
    if (accepted.length > 0 && !accepted.some((a) => base(a) === base(c))) continue;
    return c;
  }
  return "";
}

export type Recording = {
  /** Stop, and hand back what was captured. Safe to call twice. */
  stop: () => Promise<{ blob: Blob; mime: string; durationMs: number } | null>;
  /** Throw it away: the person changed their mind, or the screen went away. */
  cancel: () => void;
};

/**
 * Ask for the microphone and start recording. The permission prompt is raised
 * here, by getUserMedia, which is the part iOS never did on its own.
 * Rejects with a named reason rather than a browser exception.
 */
export async function startRecording(maxDurationMs: number, onAutoStop: () => void): Promise<Recording> {
  const limits = await speechLimits();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    // "You said no" and "this browser will not let me ask" are different
    // things to tell a person.
    throw new Error(name === "NotAllowedError" || name === "SecurityError" ? "mic-denied" : "mic-unavailable");
  }

  const mime = pickMime(limits.types);
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("recorder-unavailable");
  }

  const chunks: Blob[] = [];
  const startedAt = Date.now();
  let settled = false;
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start();

  // The server can only enforce the length bound when we measure it, so the
  // recording stops itself rather than sending five megabytes to be refused.
  const cap = setTimeout(() => {
    if (recorder.state === "recording") {
      onAutoStop();
      try { recorder.stop(); } catch { /* already stopping */ }
    }
  }, Math.max(1000, maxDurationMs));

  const release = () => {
    clearTimeout(cap);
    stream.getTracks().forEach((t) => t.stop());
  };

  return {
    stop: () =>
      new Promise((resolve) => {
        if (settled) { resolve(null); return; }
        settled = true;
        const finish = () => {
          release();
          const type = recorder.mimeType || mime || "audio/webm";
          resolve({ blob: new Blob(chunks, { type }), mime: type, durationMs: Date.now() - startedAt });
        };
        if (recorder.state === "inactive") { finish(); return; }
        recorder.onstop = finish;
        try { recorder.stop(); } catch { finish(); }
      }),
    cancel: () => {
      settled = true;
      release();
      try { if (recorder.state !== "inactive") recorder.stop(); } catch { /* gone */ }
    },
  };
}

export async function transcribe(
  blob: Blob,
  mime: string,
  durationMs: number,
  language: string | null,
  threadId?: string
): Promise<DictationOutcome> {
  const limits = await speechLimits();
  if (blob.size === 0) return { state: "failed", reason: "no_audio" };
  if (blob.size > limits.maxBytes) return { state: "failed", reason: "too_large" };

  const form = new FormData();
  form.append("audio", blob, "speech");
  // The exact mimeType the recorder reported, trusted over any extension —
  // the server asked for it that way and it is the only reliable answer.
  form.append("mime", mime);
  // Sent so the duration bound actually exists: the server does not decode
  // the audio, so without this the only limit is the byte size.
  form.append("duration_ms", String(Math.round(durationMs)));
  // A hint, never an instruction. A wrong hint is the bug being fixed here,
  // so nothing is sent when nothing is known.
  if (language) form.append("language", language);
  if (threadId) form.append("thread_id", threadId);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), limits.timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/speech/transcribe`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
      signal: controller.signal,
    });
    const json: unknown = await res.json().catch(() => ({}));
    const body = json as { data?: { text?: unknown; language?: unknown }; error?: unknown };
    if (!res.ok) {
      const named = typeof body.error === "string" && body.error ? body.error : `http_${res.status}`;
      return { state: "failed", reason: named };
    }
    const text = typeof body.data?.text === "string" ? body.data.text.trim() : "";
    if (!text) return { state: "failed", reason: "no_speech" };
    return {
      state: "text",
      text,
      language: typeof body.data?.language === "string" ? body.data.language : undefined,
    };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return { state: "failed", reason: aborted ? "timeout" : "network" };
  } finally {
    clearTimeout(timer);
  }
}
