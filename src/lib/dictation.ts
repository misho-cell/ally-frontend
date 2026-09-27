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

// Only a YES is remembered. A "no" cached for the session would outlive the
// reason for it: the flag was switched on tonight while people had the app
// open, and a remembered refusal means their button keeps saying "not
// switched on" until they think to reload — which reads as the feature being
// broken rather than as this screen holding an old answer. The numbers are
// stable; the permission to spend money is not, and the two do not deserve
// the same memory.
let cached: Limits | null = null;

function acceptedList(d: Record<string, unknown> | undefined): string[] | null {
  for (const key of ["accepted", "accepted_types"]) {
    const v = d?.[key];
    if (Array.isArray(v)) {
      const list = v.filter((t): t is string => typeof t === "string");
      if (list.length > 0) return list;
    }
  }
  return null;
}

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
    // 27 Sept: this read only `accepted_types` and the server sends
    // `accepted`. The list therefore always fell back to the built-in one,
    // which happens to start with audio/mp4 and so kept working — a wrong
    // read hidden by a lucky default is the kind that surfaces months later,
    // on the day the server's list changes. Both spellings are read now.
    types: acceptedList(d) ?? FALLBACK.types,
  };
}

export async function speechLimits(): Promise<Limits> {
  if (cached) return cached;
  try {
    const res = await fetch(`${BASE_URL}/speech/limits`, { headers: authHeaders() });
    if (!res.ok) return FALLBACK;
    const limits = readLimits(await res.json());
    if (limits.enabled) cached = limits;
    return limits;
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
  //
  // ⚠️ DO NOT DROP `ka` HERE, however wasteful it looks. 27 Sept: the
  // recogniser refuses language=ka with a 400, and I offered to stop sending
  // it. The backend said no, and was right twice over.
  //
  // First, this field does two jobs on their side and only one of them is the
  // refused parameter: `ka` is also what selects the Georgian SCRIPT PRIMER, a
  // Georgian sentence sent as preceding context so that Georgian letters are
  // the obvious continuation. Sending nothing would have removed the only
  // lever anyone has on script — on the very row whose live complaint is
  // Georgian coming back in Latin letters.
  //
  // Second, the waste is not what it looks like: they remember the refusal in
  // module scope, so it costs one failed request per container, not one per
  // recording. Measured: one refusal that day, none since.
  //
  // An optimisation that removes a cost of one-per-deploy and takes a feature
  // with it. Asking first is the only reason it did not ship.
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

// 27 Sept. The recorded path shipped into the conversation composer and only
// that one. The app has three microphones — the goals screen, the thread list
// and the conversation — and the other two were left asking the browser to
// recognise speech, which on an iPhone home-screen app is refused outright.
//
// So "the microphone does not start on the goals screen" was not a lead to
// investigate. It was a certainty, visible in the code, and it would have
// gone on explaining reports from every person who never opened a
// conversation. This is the whole flow in one place so that a fourth
// microphone cannot be half-built the same way.
export type DictationHandle = {
  /** Stop, transcribe, hand back the text. Safe to call twice. */
  finish: () => Promise<void>;
  /** Throw it away. */
  cancel: () => void;
};

export async function beginDictation(opts: {
  language: string | null;
  threadId?: string;
  onText: (text: string) => void;
  /** A named reason, never a silence. The caller turns it into its own copy. */
  onNotice: (reason: string) => void;
}): Promise<DictationHandle | null> {
  const limits = await speechLimits();
  if (!limits.enabled) {
    opts.onNotice("not_enabled");
    return null;
  }
  let rec: Recording;
  try {
    rec = await startRecording(limits.maxDurationMs, () => opts.onNotice("too_long"));
  } catch (err) {
    opts.onNotice(err instanceof Error ? err.message : "mic-unavailable");
    return null;
  }
  let done = false;
  return {
    finish: async () => {
      if (done) return;
      done = true;
      const captured = await rec.stop();
      if (!captured) return;
      const result = await transcribe(
        captured.blob, captured.mime, captured.durationMs, opts.language, opts.threadId
      );
      if (result.state === "text") opts.onText(result.text);
      else opts.onNotice(result.reason);
    },
    cancel: () => { done = true; rec.cancel(); },
  };
}

/** iOS is the only place the browser's own recogniser cannot be trusted. */
export function shouldRecord(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && recorderSupported();
}
