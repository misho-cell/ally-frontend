"use client";

import { useState, useEffect } from "react";
import { authHeaders } from "./deviceId";
import { t } from "./i18n";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const NAME_KEY = "netai_profile_name";
const LOCALE_KEY = "netai_locale";
// FT-6 (31 Aug): marks that this account has been through (or explicitly
// skipped) the post-registration contacts onboarding — set once, checked on
// every app entry so an interrupted onboarding (payment popup, refresh,
// closed tab) isn't silently lost.
const ONBOARDING_DONE_KEY = "netai_onboarding_done";

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_DONE_KEY) === "1";
  } catch {
    return true; // fail open — never trap a user in a redirect loop
  }
}

export function markOnboardingDone() {
  try {
    localStorage.setItem(ONBOARDING_DONE_KEY, "1");
  } catch {}
}

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchProfileBits(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/profile`, { headers: authHeaders() });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const data = json?.data ?? json ?? {};
    // 23 Aug #2: the product language follows the ACCOUNT, not the browser —
    // a Georgian number pins the UI to ka even on an English browser. Other
    // numbers keep the browser default (no override written).
    const phone = String(data.phone ?? "");
    try {
      if (phone.startsWith("+995")) localStorage.setItem(LOCALE_KEY, "ka");
    } catch {}
    const name = String(data.name ?? "").trim();
    return name || null;
  } catch {
    return null;
  }
}

// Sign-out must drop the cached name so the next account never sees it.
export function clearUserName() {
  cached = null;
  try { localStorage.removeItem(NAME_KEY); } catch {}
}

// Everything in localStorage that belongs to ONE account. Purged on every
// fresh login so a user switch on the same device never shows the previous
// account's leftovers (stale-content bug, 18 Aug). Device-scoped keys
// (device_id, sidebar collapse, A2HS dismissal) survive on purpose.
export function clearUserScopedStorage() {
  clearUserName();
  try {
    localStorage.removeItem("netai_last_read");
    localStorage.removeItem("netai_req_resolved");
    localStorage.removeItem("push_endpoint");
    localStorage.removeItem(LOCALE_KEY);
    localStorage.removeItem(ONBOARDING_DONE_KEY);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("token_warn")) localStorage.removeItem(key);
    }
  } catch {}
}

// The ONE source for the signed-in user's display name (ticket 6 #2): the
// profile's `name` field. The cache is only the first paint — the hook ALWAYS
// revalidates against /profile, so a stale name from a previous session can
// never stick.
export function useUserName(): { name: string; initial: string } {
  const [name, setName] = useState<string>(() => {
    if (cached) return cached;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem(NAME_KEY);
      if (stored) {
        cached = stored;
        return stored;
      }
    }
    return "";
  });

  useEffect(() => {
    if (!inflight) inflight = fetchProfileBits();
    let alive = true;
    inflight.then((n) => {
      inflight = null;
      if (n) {
        cached = n;
        try { localStorage.setItem(NAME_KEY, n); } catch {}
        if (alive) setName(n);
      }
    });
    return () => { alive = false; };
  }, []);

  const display = name || t("meFallback");
  return { name: display, initial: display.charAt(0).toUpperCase() };
}
