"use client";

import { useState, useEffect } from "react";
import { authHeaders } from "./deviceId";
import { t } from "./i18n";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const NAME_KEY = "netai_profile_name";

let cached: string | null = null;
let inflight: Promise<string | null> | null = null;

async function fetchName(): Promise<string | null> {
  try {
    const res = await fetch(`${BASE_URL}/profile`, { headers: authHeaders() });
    if (!res.ok) return null;
    const json = await res.json().catch(() => ({}));
    const name = String(json?.data?.name ?? json?.name ?? "").trim();
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

// The ONE source for the signed-in user's display name (ticket 6 #2): the
// profile's `name` field, cached in memory + localStorage. Never derived from
// the JWT and never the phone number.
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
    if (cached) {
      setName(cached);
      return;
    }
    if (!inflight) inflight = fetchName();
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
