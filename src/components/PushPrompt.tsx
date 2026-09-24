"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { ensurePushSubscription, pushState } from "@/lib/push";

// Row 111 (24 Sept). Forty of the forty-five people who have used Netai have
// no push registration at all, and the delivery log holds nothing for any of
// them — not a failure, not an attempt. The reason is not a broken
// registration path: it is that nobody is ever asked. The only two controls
// were a small text link in a thread header and a line inside the diagnostics
// card on the profile, and a person who stays on the list, which is most
// people, meets neither.
//
// So the ask comes to where they already are, once, with the reason attached.
// Dismissal is remembered — being asked twice for the same thing is how a
// person learns to dismiss without reading.

const DISMISS_KEY = "push_prompt_dismissed";

const L = {
  en: {
    title: "Get told when something happens",
    body: "An answer to a request, or a reply from someone you asked. Without this the app can only tell you while it is open.",
    enable: "Turn on",
    later: "Not now",
    failed: "Could not turn them on",
    iosTitle: "Add Netai to your home screen",
    iosBody: "On iPhone, notifications only work when the app is opened from the home screen. Share, then Add to Home Screen.",
  },
  ka: {
    title: "გაიგე, როცა რამე მოხდება",
    body: "პასუხი შენს თხოვნაზე, ან პასუხი იმისგან, ვისაც სთხოვე. ამის გარეშე აპს მხოლოდ მაშინ შეუძლია გითხრას, როცა გახსნილია.",
    enable: "ჩართვა",
    later: "ახლა არა",
    failed: "ჩართვა ვერ მოხერხდა",
    iosTitle: "დაამატე Netai მთავარ ეკრანზე",
    iosBody: "iPhone-ზე შეტყობინებები მუშაობს მხოლოდ მაშინ, როცა აპი მთავარი ეკრანიდან იხსნება. გაზიარება, მერე მთავარ ეკრანზე დამატება.",
  },
};

type Shape = "hidden" | "ask" | "ios" | "busy" | "failed";

export default function PushPrompt() {
  const s = L[getLocale()];
  const [shape, setShape] = useState<Shape>("hidden");
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;
    const state = pushState();
    // "granted" and "denied" are both answered questions and neither is this
    // card's business. "needs-pwa" is the iPhone case: asking there does
    // nothing at all, so it gets the instruction instead of a button.
    // The values this reads — Notification.permission, display-mode,
    // localStorage — do not exist during render or on the server, so an effect
    // is the only correct place to read them. It runs once and settles; the
    // rule cannot tell that apart from a render loop. Narrowed to these lines.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (state === "unasked") setShape("ask");
    else if (state === "needs-pwa") setShape("ios");
  }, []);

  if (shape === "hidden") return null;

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch {}
    setShape("hidden");
  };

  const enable = async () => {
    setShape("busy");
    setReason(null);
    const result = await ensurePushSubscription(true);
    if (result.state === "subscribed" || result.state === "denied") {
      // Denied is an answer too, and re-asking a person who said no is worse
      // than not asking at all.
      dismiss();
      return;
    }
    if (result.state === "failed") {
      setShape("failed");
      setReason(result.reason);
      return;
    }
    setShape("ask");
  };

  const ios = shape === "ios";

  return (
    <div className="card flex flex-col gap-2" style={{ margin: "8px 0" }}>
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
        {ios ? s.iosTitle : s.title}
      </h2>
      <p style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{ios ? s.iosBody : s.body}</p>
      {shape === "failed" && (
        <p style={{ fontSize: "12px", color: "var(--danger)" }}>
          {s.failed}{reason ? ` (${reason})` : ""}
        </p>
      )}
      <div className="flex items-center gap-2" style={{ marginTop: "2px" }}>
        {!ios && (
          <button
            type="button"
            onClick={enable}
            disabled={shape === "busy"}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
            style={{ background: "var(--accent-strong)", color: "#fff" }}
          >
            {s.enable}
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
