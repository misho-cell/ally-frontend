// Row 111 (30 Sept). Push reaches 5 of 45 people, and the backend measured
// that device_id rotates WITH the push endpoint, so the server cannot tell a
// replacement apart from a new device.
//
// Nothing in this app rotates device_id. It is minted once and reused. Both
// findings are true at the same time, and the reason is that device_id and
// the last known push endpoint are kept in the SAME store. When that store is
// cleared, both are reborn together in the same instant:
//
//   * the endpoint is gone, so the browser is asked for a subscription and
//     mints a fresh one
//   * device_id is gone, so a fresh UUID is minted
//   * `previous_endpoint` is read from that same cleared store, so it is null
//     and is not sent
//
// The server then sees a new endpoint under a new device_id with nothing
// linking it to what it replaced: a new device, exactly as measured. The two
// remedies already implemented — carrying previous_endpoint, and a stable
// device_id — are both defeated by the one event they were never protected
// from, because they share the store that the event destroys.
//
// So the value is written to more than one store and read back from whichever
// survived. This does not make it permanent, and it is worth being plain
// about the limits rather than claiming a fix:
//
//   * a person clearing site data deliberately clears all of them, and should
//   * Safari caps script-written cookies at 7 days, so the cookie is not a
//     way around eviction, only a second thing that has to be evicted too
//   * an app deleted and reinstalled is genuinely a new install, and the old
//     row genuinely cannot be matched from here
//
// What it does change is the common case where one store is lost and another
// is not. It cannot make anything worse: every read still prefers a value
// that is already present, and only a value found in one store is copied into
// the others.

const MAX_AGE = 60 * 60 * 24 * 400; // as long as the browser will keep it

function fromLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function fromCookie(key: string): string | null {
  try {
    const prefix = `${encodeURIComponent(key)}=`;
    for (const part of document.cookie.split("; ")) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
  } catch {}
  return null;
}

/** The value from whichever store still has it, and null when none does. */
export function durableGet(key: string): string | null {
  const local = fromLocal(key);
  if (local) {
    // The cookie may be the one that was lost. Put it back.
    if (!fromCookie(key)) writeCookie(key, local);
    return local;
  }
  const cookie = fromCookie(key);
  if (cookie) {
    // localStorage was cleared and the cookie survived: this is the whole
    // point. Restore it so everything reading localStorage directly — and
    // there is plenty of that — sees the original value rather than minting
    // a replacement for something that was never really gone.
    try {
      localStorage.setItem(key, cookie);
    } catch {}
    return cookie;
  }
  return null;
}

function writeCookie(key: string, value: string): void {
  try {
    const secure = location.protocol === "https:" ? "; Secure" : "";
    document.cookie =
      `${encodeURIComponent(key)}=${encodeURIComponent(value)}` +
      `; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
  } catch {}
}

export function durableSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
  writeCookie(key, value);
}
