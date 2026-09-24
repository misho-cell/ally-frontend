"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, pushState } from "@/lib/push";

// Screen-local strings (phone locale: ka → Georgian, else English).
// No emoji in UI copy (brand rule).
const L = {
  en: {
    needsPwa: "Install the app for notifications",
    blocked: "Notifications blocked",
    enable: "Notifications",
    // Row 111 (24 Sept): a failure used to leave the button looking untouched,
    // so a person who pressed it and got nothing pressed it again forever and
    // the server never heard about any of it. It says so now.
    failed: "Could not turn them on",
  },
  ka: {
    needsPwa: "შეტყობინებებისთვის დააინსტალირე აპლიკაცია",
    blocked: "შეტყობინებები დაბლოკილია",
    enable: "შეტყობინებები",
    failed: "ჩართვა ვერ მოხერხდა",
  },
};

type Status = "idle" | "loading" | "granted" | "denied" | "needs-pwa" | "unsupported" | "failed";

export default function NotificationButton() {
  const s = L[getLocale()];
  const [status, setStatus] = useState<Status>("idle");
  // The step that broke, kept beside the message. Not translated: it is for a
  // screenshot that reaches us, not for the person to act on.
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const state = pushState();
      if (state === "granted") {
        // Granted is not registered. The registration can be missing here — a
        // rotated endpoint, a POST that failed last time — and this is the
        // pass that repairs it without prompting anyone.
        const r = await ensurePushSubscription(false);
        if (alive && r.state === "subscribed") setStatus("granted");
        return;
      }
      if (alive && state !== "unasked") setStatus(state);
    })();
    return () => { alive = false; };
  }, []);

  async function enable() {
    setStatus("loading");
    setReason(null);
    const result = await ensurePushSubscription(true);
    if (result.state === "subscribed") {
      setStatus("granted");
      return;
    }
    if (result.state === "failed") {
      setStatus("failed");
      setReason(result.reason);
      return;
    }
    setStatus(result.state === "unasked" ? "idle" : result.state);
  }

  if (status === "granted" || status === "unsupported") return null;

  if (status === "failed") {
    return (
      <span className="text-xs" style={{ color: "var(--danger)" }}>
        {s.failed}{reason ? ` (${reason})` : ""}
      </span>
    );
  }

  if (status === "needs-pwa") {
    return <span className="text-xs" style={{ color: "var(--meta)" }}>{s.needsPwa}</span>;
  }

  if (status === "denied") {
    return <span className="text-xs" style={{ color: "var(--meta)" }}>{s.blocked}</span>;
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={status === "loading"}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{ color: "var(--accent-strong)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-tint)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {status === "loading" ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--cta-border)", borderTopColor: "var(--accent-strong)" }}
        />
      ) : (
        <svg viewBox="0 0 20 20" fill="none" style={{ width: 14, height: 14 }}>
          <path
            d="M10 3a4 4 0 00-4 4v3l-1.5 2.5h11L14 10V7a4 4 0 00-4-4z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8 15a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
      {s.enable}
    </button>
  );
}
