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
      <div className="mx-auto max-w-sm rounded-2xl border border-[#E4E0D3] bg-white p-4 shadow-2xl flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-[#23261F]">Install the app</p>
            {platform === "android" && (
              <p className="text-xs text-[#8A8778]">
                Add Ally to your home screen
              </p>
            )}
            {platform === "ios" && (
              <p className="text-xs text-[#8A8778]">
                Safari → Share (△) → “Add to Home Screen”
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 text-[#B9B6AC] hover:text-[#8A8778] text-lg leading-none"
            aria-label="close"
          >
            ×
          </button>
        </div>

        {platform === "android" && (
          <button
            onClick={installAndroid}
            className="w-full flex h-10 items-center justify-center rounded-xl bg-[#3E7A56] text-sm font-semibold text-white hover:opacity-90"
          >
            Install
          </button>
        )}

        {platform === "ios" && (
          <div className="flex items-center justify-center gap-2 rounded-xl bg-[#DEE8E0] px-4 py-2">
            <span className="text-xl">&#9650;</span>
            <p className="text-xs text-[#23261F]">
              Tap the share button below and choose “Add to Home Screen”
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
