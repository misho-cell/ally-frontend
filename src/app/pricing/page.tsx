"use client";

import { useState } from "react";
import Link from "next/link";
import { getLocale } from "@/lib/i18n";
import { startStripeCheckout } from "@/lib/stripe";
import { useOffer } from "@/lib/offer";

// Stripe (6 Sept): one plan, one price. The button copy that depends on
// trial_days (5 vs 0) can only be known AFTER the checkout call returns, so
// the page shows the trial framing and startStripeCheckout() confirms the
// "charged today" case before redirecting.
//
// 9 Oct (Misho): two different free periods exist and the page shows both.
// The card trial is the server's STRIPE_TRIAL_DAYS (5 today); the days an
// invitation carries are the `invite_free_days` setting (20 today), which the
// founder can switch off or lower to 10 or 5 from the dashboard. Neither is
// ours to write down, so both are read from GET /billing/offer. Until the
// server answers, the card trial falls back to the 5 this page has always
// said, and the invitation line is not drawn at all: a missing number must
// not become a promise of free days that may be switched off.
const CARD_TRIAL_FALLBACK = 5;
// The same for the monthly price: the server's `plans.pro` once it sends it,
// this until then (Misho, 10 Oct: prices are read from the server).
const PRO_PRICE_FALLBACK = 19.99;
const usd = (n: number) => `$${n.toFixed(2)}`;
const L = {
  en: {
    title: "Netai Pro",
    subtitle: (n: number) => `Try Pro free for ${n} days. Your card won't be charged until the trial ends.`,
    invite: (n: number) => `Joined with an invitation? Your first ${n} days are free.`,
    period: "/mo",
    cta: (n: number) => `Start your ${n}-day free trial`,
    ctaNote: (n: number) => `A card is required, but nothing is charged for ${n} days.`,
    ctaNoTrial: (p: string) => `Subscribe: ${p}/mo`,
    ctaNoTrialNote: "You've already used your free trial. You'll be charged today.",
    opening: "Opening…",
    retry: "Try again",
    skip: "Skip and continue with the free version",
    features: ["Personal assistant", "Contact analysis", "Priority support", "Advanced reporting"],
  },
  ka: {
    title: "Netai Pro",
    subtitle: (n: number) => `სცადე Pro ${n} დღე უფასოდ. ბარათიდან თანხა საცდელი პერიოდის ბოლომდე არ ჩამოგეჭრება.`,
    invite: (n: number) => `მოწვევით შემოხვედი? პირველი ${n} დღე უფასოა.`,
    period: "/თვე",
    cta: (n: number) => `დაიწყე ${n} დღიანი უფასო პერიოდი`,
    ctaNote: (n: number) => `ბარათი დაგჭირდება, მაგრამ ${n} დღის განმავლობაში არაფერი ჩამოგეჭრება.`,
    ctaNoTrial: (p: string) => `გამოწერა: ${p}/თვე`,
    ctaNoTrialNote: "უფასო პერიოდით უკვე ისარგებლე. თანხა დღესვე ჩამოიჭრება.",
    opening: "იხსნება…",
    retry: "სცადე ხელახლა",
    skip: "გამოტოვება და უფასო ვერსიით გაგრძელება",
    features: ["პირადი ასისტენტი", "კონტაქტების ანალიზი", "პრიორიტეტული მხარდაჭერა", "გაფართოებული შედეგების ნახვა"],
  },
};

export default function PricingPage() {
  const s = L[getLocale()];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const offer = useOffer();
  const cardDays = offer.cardTrialDays ?? CARD_TRIAL_FALLBACK;
  const inviteDays = offer.inviteFreeDays;
  const price = usd(offer.prices.pro ?? PRO_PRICE_FALLBACK);

  async function subscribe() {
    if (loading || unavailable) return;
    setLoading(true);
    setError(null);
    const out = await startStripeCheckout();
    if (out.kind === "redirected") return; // navigation is under way
    setLoading(false);
    if (out.kind === "unavailable") {
      setUnavailable(true);
      setError(out.message);
    } else if (out.kind === "failed") {
      setError(out.message);
    }
  }

  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-md">
        <div className="relative text-center mb-10">
          <Link
            href="/chat"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full transition-colors"
            style={{ background: "var(--skeleton)", color: "var(--ink-soft)" }}
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Link>

          <div className="flex items-center justify-center gap-2.5 mb-6">
            <span className="ally-avatar" style={{ width: 32, height: 32 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ally/ally-avatar.jpg" alt="Netai" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </span>
            <span style={{ font: "500 26px/32px var(--font-bricolage)", color: "var(--ink)" }}>Netai</span>
          </div>
          <h1 className="mb-3" style={{ font: "500 26px/32px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</h1>
          <p className="max-w-md mx-auto" style={{ font: "400 14px/21px var(--font-system)", color: "var(--ink-soft)" }}>
            {s.subtitle(cardDays)}
          </p>
          {inviteDays != null && (
            <p className="mt-2 max-w-md mx-auto" style={{ font: "500 14px/21px var(--font-system)", color: "var(--accent-strong)" }}>
              {s.invite(inviteDays)}
            </p>
          )}
        </div>

        <div
          className="flex flex-col gap-4 mb-8"
          style={{
            borderRadius: "var(--radius-card)",
            padding: "24px",
            background: "var(--accent)",
            border: "1px solid var(--accent)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold" style={{ color: "#FFFFFF" }}>{price}</span>
            <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>{s.period}</span>
          </div>

          <ul className="flex flex-col gap-2 flex-1">
            {s.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm" style={{ color: "#FFFFFF" }}>
                <svg className="h-4 w-4 shrink-0" style={{ color: "rgba(255,255,255,0.8)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={subscribe}
            disabled={loading || unavailable}
            className="w-full h-11 rounded-full text-sm font-semibold transition-all disabled:opacity-60"
            style={{ background: "#FFFFFF", color: "var(--accent-strong)" }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {s.opening}
              </span>
            ) : (
              s.cta(cardDays)
            )}
          </button>
          <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.75)" }}>{s.ctaNote(cardDays)}</p>

          {error && (
            <div
              className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
              style={{ background: "rgba(255,255,255,0.14)", color: "#FFFFFF", borderRadius: "var(--radius-tile)" }}
            >
              <span>{error}</span>
              {!unavailable && (
                <button type="button" onClick={subscribe} className="font-semibold underline">
                  {s.retry}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="text-center">
          <Link href="/chat" className="text-sm transition-colors hover:text-[var(--ink)]" style={{ color: "var(--meta)" }}>
            {s.skip}
          </Link>
        </div>
      </div>
    </div>
  );
}
