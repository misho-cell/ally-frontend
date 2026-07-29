"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";

type Platform = "android" | "ios" | null;

const L = {
  en: {
    title: "Install the app",
    androidBody: "Add Netai to your home screen",
    iosBody: "Safari → Share (△) → “Add to Home Screen”",
    install: "Install",
    iosHint: "Tap the share button below and choose “Add to Home Screen”",
  },
  ka: {
    title: "დააინსტალირე აპლიკაცია",
    androidBody: "დაამატე Netai მთავარ ეკრანზე",
    iosBody: "Safari → Share (△) → „Add to Home Screen“",
    install: "ინსტალაცია",
    iosHint: "დააჭირე გაზიარების ღილაკს ქვემოთ და აირჩიე „Add to Home Screen“",
  },
};

export default function InstallPrompt() {
  const s = L[getLocale()];
  const [platform, setPlatform] = useState<Platform>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("install_dismissed")) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (navigator as any).standalone === true;

    if (isStandalone) return;

    const ua = navigator.userAgent;
    const isIos = /iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isIos) {
      setPlatform("ios");
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setPlatform("android");
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  function dismiss() {
    localStorage.setItem("install_dismissed", "1");
    setDismissed(true);
  }

  async function installAndroid() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem("install_dismissed", "1");
    }
    setDeferredPrompt(null);
    setDismissed(true);
  }

  if (!platform || dismissed) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
      <div
        className="mx-auto max-w-sm p-4 flex flex-col gap-3"
        style={{
          background: "#FFFFFF",
          border: "1px solid var(--sidebar-border)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-pop)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold" style={{ color: "var(--ink)" }}>{s.title}</p>
            {platform === "android" && (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{s.androidBody}</p>
            )}
            {platform === "ios" && (
              <p className="text-xs" style={{ color: "var(--ink-soft)" }}>{s.iosBody}</p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-lg leading-none"
            style={{ color: "var(--meta)" }}
            aria-label="close"
          >
            ×
          </button>
        </div>

        {platform === "android" && (
          <button onClick={installAndroid} className="btn-primary w-full">
            {s.install}
          </button>
        )}

        {platform === "ios" && (
          <div
            className="flex items-center justify-center gap-2 px-4 py-2"
            style={{ background: "var(--accent-tint)", borderRadius: "var(--radius-tile)" }}
          >
            <span className="text-xl">&#9650;</span>
            <p className="text-xs" style={{ color: "var(--ink)" }}>{s.iosHint}</p>
          </div>
        )}
      </div>
    </div>
  );
}
