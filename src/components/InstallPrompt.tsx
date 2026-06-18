"use client";

import { useEffect, useState } from "react";

type Platform = "android" | "ios" | null;

export default function InstallPrompt() {
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
      <div className="mx-auto max-w-sm rounded-2xl bg-[#1a1a2e] p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-white">აპლიკაციის დაყენება</p>
            {platform === "android" && (
              <p className="text-xs text-white/60">
                დაამატე Ally მთავარ ეკრანზე
              </p>
            )}
            {platform === "ios" && (
              <p className="text-xs text-white/60">
                Safari → გაზიარების ღილაკი (△) → „Add to Home Screen“
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-white/40 hover:text-white/70 text-lg leading-none"
            aria-label="close"
          >
            ×
          </button>
        </div>

        {platform === "android" && (
          <button
            onClick={installAndroid}
            className="w-full flex h-10 items-center justify-center rounded-xl bg-white text-sm font-semibold text-[#1a1a2e] hover:bg-white/90"
          >
            დაყენა
          </button>
        )}

        {platform === "ios" && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-2">
            <span className="text-xl">&#9650;</span>
            <p className="text-xs text-white/80">
              ქვემოთ დააჭირეთ გაზიარების ღილაკსა და აირჩიეთ „Add to Home Screen“
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
