"use client";

import { useState } from "react";
import { getLocale } from "@/lib/i18n";

const SITE_URL = "https://netai.guru";

// Button labels follow the UI locale; the card copy itself is the APPROVED
// English text. The Georgian body translation is drafted and pending
// prompt-team approval — swap it in once confirmed:
// მოიწვიე მეგობრები და მიიღე ჯილდო /
// გაუზიარე შენი მოსაწვევი კოდი მეგობრებს. როცა ვინმე შენი კოდით
// შემოუერთდება და პირველ გამოწერას შეიძენს, ჯილდოს მიიღებ. ჯილდო
// ერგება მისი ქსელის გამოწერებზეც, 6 დონემდე.
const BTN = {
  en: { copy: "Copy", copied: "Copied!", invite: "Invite friend" },
  ka: { copy: "კოპირება", copied: "დაკოპირდა!", invite: "მეგობრის მოწვევა" },
};

// The share text carries the referral CODE, never the phone number (founder
// decision, 17 Aug). If the code is missing the code line is simply omitted.
export function inviteShareText(code: string | null): string {
  return (
    `Hey! I'm using Netai, an assistant that works your own network to get things done. Join me:\n\n` +
    `1. Open ${SITE_URL} and sign in with your phone number\n` +
    (code ? `2. On the sign-up step, enter my referral code: ${code}\n\n` : `\n`) +
    `That's it, see you inside!`
  );
}

export default function ReferralRewardsCard({ code }: { code: string | null }) {
  const b = BTN[getLocale()];
  const [copied, setCopied] = useState<"code" | "text" | null>(null);

  function flash(kind: "code" | "text") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      flash("code");
    } catch {}
  }

  // One share mechanism everywhere (ticket 6 #10): native sheet, clipboard
  // fallback.
  async function share() {
    const text = inviteShareText(code);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch {
      return; // user closed the sheet
    }
    try {
      await navigator.clipboard.writeText(text);
      flash("text");
    } catch {}
  }

  return (
    <div className="card flex flex-col gap-3">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
        Invite friends and earn rewards
      </h2>
      <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>
        Share your referral code with friends. When someone joins using your code and purchases
        their first subscription, you earn a reward. You can also earn when people in their
        referral network subscribe, across up to 6 levels.
      </p>
      {code && (
        <div className="flex items-center gap-2">
          <code
            className="flex-1 truncate px-3 py-2.5"
            style={{
              color: "var(--ink-strong)",
              background: "var(--sidebar-bg)",
              border: "1px solid var(--sidebar-border)",
              borderRadius: "var(--radius-tile)",
              fontSize: "16px",
              fontWeight: 600,
              letterSpacing: "1.5px",
            }}
          >
            {code}
          </code>
          <button
            type="button"
            onClick={copyCode}
            className="btn-secondary shrink-0"
            style={{ padding: "8px 16px", fontSize: "12px" }}
          >
            {copied === "code" ? b.copied : b.copy}
          </button>
        </div>
      )}
      <button type="button" onClick={share} className="btn-primary self-start">
        {copied === "text" ? b.copied : b.invite}
      </button>
    </div>
  );
}
