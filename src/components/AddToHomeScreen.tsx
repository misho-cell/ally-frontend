"use client";

import { useState, useEffect } from "react";
import { getLocale } from "@/lib/i18n";

const DISMISS_KEY = "netai_a2hs_dismissed";

// Add-to-home-screen explainer (P1). Mobile browsers only: hidden when the
// app already runs standalone (installed) or the user dismissed it once.
// Georgian: no em-dashes, never italic, no emoji.
const L = {
  en: {
    title: "Add Netai to your home screen",
    ios: "Tap the Share button and choose “Add to Home Screen”. You'll get one-tap access and notifications.",
    other: "Open your browser menu and choose “Install app” or “Add to Home screen”. You'll get one-tap access and notifications.",
    dismiss: "Not now",
  },
  ka: {
    title: "დაამატე Netai მთავარ ეკრანზე",
    ios: "დააჭირე Share ღილაკს და აირჩიე „Add to Home Screen“. აპი ერთი შეხებით გაიხსნება და შეტყობინებებსაც მიიღებ.",
    other: "გახსენი ბრაუზერის მენიუ და აირჩიე „Install app“ ან „Add to Home screen“. აპი ერთი შეხებით გაიხსნება და შეტყობინებებსაც მიიღებ.",
    dismiss: "ახლა არა",
  },
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    nav.standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export default function AddToHomeScreen() {
  const s = L[getLocale()];
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (isStandalone()) return;
      if (localStorage.getItem(DISMISS_KEY)) return;
      // Phones only — the desktop app has no home screen.
      if (!window.matchMedia?.("(max-width: 767px)").matches) return;
      const tm = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(tm);
    } catch {}
  }, []);

  function dismiss() {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-x-0 z-50 px-3 md:hidden"
      style={{ bottom: "max(12px, env(safe-area-inset-bottom))" }}
    >
      <div className="card flex flex-col gap-2" style={{ boxShadow: "var(--shadow-pop)" }}>
        <div className="flex items-start gap-2.5">
          <span className="ally-avatar shrink-0" style={{ width: 28, height: 28 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/ally/ally-avatar.jpg" alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</p>
            <p className="mt-1" style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--ink-2)" }}>
              {isIos() ? s.ios : s.other}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="self-end"
          style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink-soft)", padding: "4px 8px" }}
        >
          {s.dismiss}
        </button>
      </div>
    </div>
  );
}
