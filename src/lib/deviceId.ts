const DEVICE_ID_KEY = "device_id";

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

// Stable per-device identifier for abuse detection (S17). Not a secret — it
// needs stability, not confidentiality — so localStorage is the right store.
// Generated once on first launch and reused unchanged on every request after.
// A user clearing it just looks like a new device (one of several backend
// signals alongside UA + IP), so resets are acceptable.
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// The single source of truth for authenticated request headers: Bearer token +
// X-Device-Id. Use this everywhere a Bearer token is sent so no call site
// forgets the device id. Do NOT use on /auth/* (no user yet) or on the SSE
// stream (EventSource-style requests cannot carry custom headers anyway).
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

// Parse a Retry-After header (seconds). Falls back to a sane default when the
// header is absent/unreadable (e.g. not CORS-exposed by the backend).
export function parseRetryAfter(res: Response, fallbackSecs = 30): number {
  const raw = res.headers.get("Retry-After");
  const secs = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(secs) && secs > 0 ? secs : fallbackSecs;
}
