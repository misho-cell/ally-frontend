"use client";

import { useEffect } from "react";

// 5 Oct. Ninia and Lika reported #503 and #506 missing on phones a day after
// both were live. The worker updates itself (skipWaiting + clientsClaim), but
// the page already open keeps running the JavaScript it loaded with, and an
// app on the home screen is resumed rather than reopened — so it can stay on
// an old build for days without anybody touching it.
//
// So: ask for an update whenever the app comes back to the front, and once a
// new worker has taken over, reload the next time the app goes to the back.
// Never while it is on screen, and never over unsent text, because no draft
// survives a reload and losing one is worse than one more old session.
function hasUnsentText(): boolean {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    "textarea, input[type='text'], input:not([type])",
  );
  for (const f of fields) {
    if (f.value.trim()) return true;
  }
  return false;
}

export default function SwUpdater() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    // The first worker taking control of a page is an install, not an
    // update; there is nothing newer to reload into.
    let hadController = sw.controller !== null;
    let stale = false;

    const reloadIfHidden = () => {
      if (stale && document.visibilityState === "hidden" && !hasUnsentText()) {
        window.location.reload();
      }
    };
    const onControllerChange = () => {
      if (!hadController) {
        hadController = true;
        return;
      }
      stale = true;
      reloadIfHidden();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        sw.getRegistration()
          .then((reg) => reg?.update())
          .catch(() => {});
      } else {
        reloadIfHidden();
      }
    };

    sw.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      sw.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
