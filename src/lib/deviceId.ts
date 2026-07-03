const DEVICE_ID_KEY = "device_id";

function getToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
}

function getAdminToken(): string {
  return typeof window !== "undefined" ? localStorage.getItem("adminToken") ?? "" : "";
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

// USER requests: Bearer from `token` + X-Device-Id. The single source for app
// endpoints (chat, threads, contacts, profile, billing, notifications).
// Do NOT use on /auth/* (no user yet), the SSE stream, or /admin/*.
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  return headers;
}

// ADMIN requests: Bearer from `adminToken`. Admin and user sessions are fully
// separate stores — admin login never touches `token` and vice versa, so
// working in the configurator can no longer hijack the user's chat session.
export function adminAuthHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra ?? {}) };
  const token = getAdminToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

// Parse a Retry-After header (seconds). Falls back to a sane default when the
// header is absent/unreadable (e.g. not CORS-exposed by the backend).
export function parseRetryAfter(res: Response, fallbackSecs = 30): number {
  const raw = res.headers.get("Retry-After");
  const secs = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(secs) && secs > 0 ? secs : fallbackSecs;
}

// Transitional guard: a leftover admin JWT stored as the user token now gets
// 403 { reason: "admin_token_on_user_endpoint" } from user endpoints. Clear
// the bogus user token and send the person to phone login. Returns true if
// the response was consumed.
export function handleAdminTokenMisuse(
  status: number,
  body: { reason?: string } | null | undefined
): boolean {
  if (status !== 403 || body?.reason !== "admin_token_on_user_endpoint") return false;
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    window.location.href = "/login";
  }
  return true;
}
