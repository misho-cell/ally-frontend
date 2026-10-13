// The user's sign-in token, kept in two stores on purpose: localStorage is what
// the client sends as Bearer, the `token` cookie is what middleware.ts can see
// before any client code runs. Board 4656 (12 Oct): the two drifted apart. A 401
// cleared one and left the other, Safari keeps a script-written cookie for 7
// days at most while localStorage outlives it, and the login page never looked
// at either. Whichever store survived, the person was shown the phone login
// again although a valid 30-day token was still on the device.
//
// So the two are one fact: every write and every clear goes through here, and
// a read that finds the token in only one store copies it to the other.

const KEY = "token";
const MAX_AGE = 60 * 60 * 24 * 30;

function readCookie(): string {
  const m = document.cookie.match(/(?:^|;\s*)token=([^;]*)/);
  return m ? decodeURIComponent(m[1]) : "";
}

function writeCookie(token: string, maxAge: number) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${KEY}=${token}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}

// Seconds until the JWT's own `exp`, or null when it carries none or cannot be
// read. The server owns the lifetime; this only avoids a cookie that outlives
// the token it holds.
function secondsLeft(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? Math.floor(exp - Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

export function persistSessionToken(token: string) {
  localStorage.setItem(KEY, token);
  const left = secondsLeft(token);
  writeCookie(token, left == null ? MAX_AGE : Math.max(0, Math.min(MAX_AGE, left)));
}

export function clearSessionToken() {
  localStorage.removeItem(KEY);
  document.cookie = `${KEY}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

// The token if this device holds one that has not expired, with both stores
// brought back in line. "" when there is none. An expired token is cleared
// from both, so middleware and the client agree that the person is signed out.
export function readSessionToken(): string {
  if (typeof window === "undefined") return "";
  let stored = "";
  let cookie = "";
  try { stored = localStorage.getItem(KEY) ?? ""; } catch {}
  try { cookie = readCookie(); } catch {}
  const token = stored || cookie;
  if (!token) return "";
  const left = secondsLeft(token);
  if (left != null && left <= 0) {
    try { clearSessionToken(); } catch {}
    return "";
  }
  if (stored !== token || cookie !== token) {
    try { persistSessionToken(token); } catch {}
  }
  return token;
}
