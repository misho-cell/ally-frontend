"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { copyText, fetchInvite, shareInvite, type Invite } from "@/lib/invite";

const SITE_URL = "https://netai.guru";

// Referral Rewards. Copy per Lika's approved strings (task 22 c): Georgian
// translation live, buttons exactly „დაკოპირება“ / „მოიწვიე მეგობარი“ with a
// visible „დაკოპირებულია“ state. Georgian: no em-dashes, never italic.
const L = {
  en: {
    title: "Invite friends and earn rewards",
    body:
      "Share your referral code with friends. When someone joins using your code and purchases their first subscription, you earn a reward. You can also earn when people in their referral network subscribe, across up to 6 levels.",
    copy: "Copy",
    copied: "Copied",
    invite: "Invite friend",
    copyLink: "Copy link",
  },
  ka: {
    title: "მოიწვიე მეგობრები და მიიღე ჯილდო",
    body:
      "გაუზიარე შენი მოსაწვევი კოდი მეგობრებს. როცა ვინმე შენი კოდით შემოუერთდება და პირველ გამოწერას შეიძენს, ჯილდოს მიიღებ. ჯილდო ერგება მისი ქსელის გამოწერებზეც, 6 დონემდე.",
    copy: "დაკოპირება",
    copied: "დაკოპირებულია",
    invite: "მოიწვიე მეგობარი",
    copyLink: "ბმულის დაკოპირება",
  },
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
  const s = L[getLocale()];
  const [copied, setCopied] = useState<"code" | "text" | "link" | null>(null);
  // Row 320. Fetched when the card mounts, not when the button is pressed:
  // `navigator.share` needs the user activation of the tap itself, and an
  // await in between loses it on iOS Safari. Prefetching is what makes the
  // press open the sheet at once instead of after a round trip.
  const [invite, setInvite] = useState<Invite | null>(null);
  // The profile carries the code and so does the invite route. Either is the
  // same code; whichever arrived is shown, so a profile that came back without
  // it does not blank out a code the person actually has.
  const shownCode = code ?? invite?.code ?? null;

  // The copied state flips OPTIMISTICALLY, before the async clipboard write —
  // testers reported the state never appearing when clipboard.writeText was
  // rejected silently (task 22 c).
  function flash(kind: "code" | "text" | "link") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyCode() {
    if (!shownCode) return;
    flash("code");
    await copyText(shownCode);
  }

  useEffect(() => {
    let alive = true;
    void fetchInvite().then((got) => { if (alive) setInvite(got); });
    return () => { alive = false; };
  }, []);

  // One share mechanism everywhere (ticket 6 #10): native sheet, clipboard
  // fallback. The server's text wins when it arrived, because it is written
  // in the language this person chose and it is the text the funnel counts.
  // The locally composed one stays as the fallback for the window before the
  // fetch lands, and for accounts the invite-link flag is still off for.
  async function share() {
    const text = invite?.share_text ?? inviteShareText(shownCode);
    const outcome = await shareInvite(text, invite?.link ?? null);
    if (outcome === "copied") flash("text");
  }

  // #379. Copying the address is its own act: the share sheet on iOS offered
  // testers almost nothing, and a link on the clipboard goes wherever the
  // person wants without a sheet at all. Shown only when the server gave us a
  // link — there is no second place to invent one from, and a button that
  // copied nothing would be worse than no button.
  async function copyLink() {
    const link = invite?.link;
    if (!link) return;
    flash("link");
    await copyText(link);
  }

  return (
    <div className="card flex flex-col gap-3">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
      <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>{s.body}</p>
      {shownCode && (
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
            {shownCode}
          </code>
          <button
            type="button"
            onClick={copyCode}
            className="btn-secondary shrink-0"
            style={{ padding: "8px 16px", fontSize: "12px" }}
          >
            {copied === "code" ? s.copied : s.copy}
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={share} className="btn-primary">
          {copied === "text" ? s.copied : s.invite}
        </button>
        {invite?.link && (
          <button type="button" onClick={copyLink} className="btn-secondary">
            {copied === "link" ? s.copied : s.copyLink}
          </button>
        )}
      </div>
    </div>
  );
}
