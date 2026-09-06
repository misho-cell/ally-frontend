"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { openStripePortal, pastDueDaysLeft, portalErrorText, type BillingProfile } from "@/lib/stripe";

// Stripe (6 Sept): past_due = the card failed but access is NOT cut yet.
// Stripe retries for ~two weeks; the person keeps full access meanwhile and
// must be able to fix the card from anywhere — so this banner lives in the
// root layout, not just on /profile. Day count runs from
// subscription_status_changed_at + 14 (not from current_period_ends_at,
// which Stripe has already moved a month ahead by the time the charge fails).
const S = {
  en: {
    body: "We couldn't charge your card. Please update it.",
    days: (n: number) => `Access is kept for ${n} more ${n === 1 ? "day" : "days"}.`,
    cta: "Update card",
  },
  ka: {
    body: "ბარათიდან თანხის ჩამოჭრა ვერ მოხერხდა. გთხოვთ, განაახლოთ ბარათი.",
    days: (n: number) => `წვდომა შენარჩუნებულია ${n} დღე.`,
    cta: "ბარათის შეცვლა",
  },
};

const SKIP_PREFIXES = ["/login", "/join", "/admin", "/pricing", "/privacy", "/terms", "/refund"];

export default function PastDueBanner() {
  const pathname = usePathname();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const skip = !pathname || pathname === "/" || SKIP_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (skip) return;
    let token = "";
    try { token = localStorage.getItem("token") ?? ""; } catch {}
    if (!token) return;
    let alive = true;
    apiFetch<{ data?: BillingProfile } & BillingProfile>("/profile")
      .then((res) => { if (alive) setProfile(res.data ?? res); })
      .catch(() => {});
    return () => { alive = false; };
  }, [pathname, skip]);

  if (skip || profile?.subscription_status !== "past_due") return null;

  const s = S[getLocale()];
  const days = pastDueDaysLeft(profile);

  async function fixCard() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    const out = await openStripePortal();
    if (out === "redirected") return;
    setBusy(false);
    if (out === "failed") setErr(portalErrorText());
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 top-0 z-[60] flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5"
      style={{ background: "var(--terra-tint)", color: "var(--danger)", borderBottom: "1px solid var(--sidebar-border)", boxShadow: "var(--shadow-pop)" }}
    >
      <span style={{ font: "500 13px/18px var(--font-system)" }}>
        ⚠️ {s.body}{days !== null ? ` ${s.days(days)}` : ""}
      </span>
      <button
        type="button"
        onClick={fixCard}
        disabled={busy}
        className="ml-auto rounded-full px-3.5 py-1.5 text-xs font-semibold disabled:opacity-60"
        style={{ background: "var(--danger)", color: "#FBFAF4" }}
      >
        {busy ? "…" : s.cta}
      </button>
      {err && <span className="w-full text-xs">{err}</span>}
    </div>
  );
}
