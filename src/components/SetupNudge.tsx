"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, isIos, isStandalone, pushState } from "@/lib/push";
import { promptInstall, setHomeCardShowing, useInstallEvent } from "@/lib/installEvent";
import PushPrompt, { PUSH_WORDS } from "@/components/PushPrompt";

// M7 (#7757 / #7828, Misho's yes on 27 Oct). Each missing setup step is
// nudged by whoever can act on it. Contacts are the server's: one line from
// Netai in the main chat. Notifications and the app on the home screen are
// this card's, because only the device can ask for either.
//
// The server says what is missing (GET /setup/missing, most important first)
// and this card shows ONE: the first of those two in the server's order. The
// device then decides only HOW it can be done here. A dismiss hides that step
// for 7 days on this device. After the step is done the list is read again,
// so the card leaves because the server agrees, not because we guessed.
//
// If the list cannot be read, the old push ask stands in. "Could not load"
// must not look like "nothing is missing".

type Nudge = "notifications" | "install";
type Shape = "hidden" | "push" | "install-button" | "install-ios";

const WORDS = {
  en: {
    pushTitle: "Turn on notifications",
    installTitle: "Add Netai to your home screen",
    install: "Install",
    iosHint: "Tap the share button below and choose “Add to Home Screen”",
  },
  ka: {
    pushTitle: "ჩართე შეტყობინებები",
    installTitle: "დაამატე Netai მთავარ ეკრანზე",
    install: "ინსტალაცია",
    iosHint: "დააჭირე გაზიარების ღილაკს ქვემოთ და აირჩიე „Add to Home Screen“",
  },
};

const DISMISS_DAYS = 7;
const dismissKey = (step: Nudge) => `setup_nudge_dismissed_${step}`;

function dismissedRecently(step: Nudge): boolean {
  try {
    const at = Number(localStorage.getItem(dismissKey(step)));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

function readMissing(raw: unknown): string[] | null {
  const box = raw as { data?: { missing?: unknown }; missing?: unknown } | null;
  const list = box?.data?.missing ?? box?.missing;
  return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : null;
}

export default function SetupNudge() {
  const s = { ...PUSH_WORDS[getLocale()], ...WORDS[getLocale()] };
  const [missing, setMissing] = useState<string[] | null | "failed">(null);
  const [hidden, setHidden] = useState<Nudge | null>(null);
  const [failed, setFailed] = useState(false);
  const installEvent = useInstallEvent();

  const load = useCallback(() => {
    apiFetch<unknown>("/setup/missing")
      .then((raw) => {
        const list = readMissing(raw);
        setMissing(list ?? "failed");
      })
      .catch(() => setMissing("failed"));
  }, []);

  // Fetch on mount; the state is set when the answer arrives, not here.
  useEffect(() => { load(); }, [load]);

  // What the card is about, and how this device can do it. Both read browser
  // facts, so nothing is decided until the list has arrived on the client.
  let step: Nudge | null = null;
  let shape: Shape = "hidden";
  if (Array.isArray(missing)) {
    const first = missing.find((m): m is Nudge => m === "notifications" || m === "install") ?? null;
    if (first && first !== hidden && !dismissedRecently(first)) {
      const push = pushState();
      // An iPhone in a Safari tab: the permission cannot be asked there at
      // all (Safari may not even define Notification in a tab), so for
      // either step the real thing to do is the home screen.
      const iosTab = isIos() && !isStandalone();
      if (iosTab) shape = "install-ios";
      else if (first === "notifications") {
        if (push === "unasked" || push === "granted") shape = "push";
        // denied or unsupported: nothing this card can do about it.
      } else if (!isStandalone() && installEvent) shape = "install-button";
      if (shape !== "hidden") step = first;
    }
  }
  // While this card asks for the install, the global banner stands down.
  const asksInstall = shape === "install-button" || shape === "install-ios";
  useEffect(() => {
    setHomeCardShowing(asksInstall);
    return () => setHomeCardShowing(false);
  }, [asksInstall]);

  if (missing === "failed") return <PushPrompt />;
  if (shape === "hidden" || !step) return null;

  const dismiss = () => {
    try { localStorage.setItem(dismissKey(step), String(Date.now())); } catch {}
    setHidden(step);
  };

  const enablePush = async () => {
    setFailed(false);
    const out = await ensurePushSubscription(true);
    if (out.state === "subscribed") { load(); return; }
    if (out.state === "denied") { dismiss(); return; }
    if (out.state === "failed") setFailed(true);
  };

  const install = async () => {
    if (await promptInstall()) load();
  };

  const ios = shape === "install-ios";
  const title = shape === "push" ? s.pushTitle : s.installTitle;
  const body = shape === "push" ? s.body : ios ? s.iosHint : null;

  return (
    <div className="card flex flex-col gap-2" style={{ margin: "8px 0" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{title}</h2>
      {body && <p style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{body}</p>}
      {failed && <p style={{ fontSize: "12px", color: "var(--danger)" }}>{s.failed}</p>}
      <div className="flex items-center gap-2" style={{ marginTop: "2px" }}>
        {(shape === "push" || shape === "install-button") && (
          <button
            type="button"
            onClick={shape === "push" ? enablePush : install}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ background: "var(--accent-strong)", color: "#fff" }}
          >
            {shape === "push" ? s.enable : s.install}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
          style={{ color: "var(--meta)" }}
        >
          {s.later}
        </button>
      </div>
    </div>
  );
}
