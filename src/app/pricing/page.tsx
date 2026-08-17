"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";
import { getLocale } from "@/lib/i18n";

const PRICE_IDS: Record<string, string> = {
  pro: "pri_01kvq5fwfdj2p8j42p663mh3yr",
  enterprise: "pri_01kvq5gjc8mb3kx2qhwp44mtkh",
};

// Screen-local strings (phone locale: ka → Georgian, else English).
const L = {
  en: {
    choosePlan: "Choose your plan",
    subtitle: "Try Pro free for 5 days. Your card won't be charged until the trial ends.",
    mostPopular: "Most popular",
    trialBadge: "5-day trial",
    trialNote: "First 5 days free",
    tryFree: "Try 5 days free",
    chooseEnterprise: "Choose Enterprise",
    opening: "Opening…",
    skip: "Skip and continue with the free version",
    features: {
      pro: ["Personal assistant", "Contact analysis", "Priority support", "Advanced reporting"],
      enterprise: ["Everything in Pro", "Dedicated support", "Custom integrations"],
    },
  },
  ka: {
    choosePlan: "აირჩიე გეგმა",
    subtitle: "სცადე Pro 5 დღე უფასოდ. ბარათიდან თანხა საცდელი პერიოდის ბოლომდე არ ჩამოგეჭრება.",
    mostPopular: "ყველაზე პოპულარული",
    trialBadge: "5-დღიანი საცდელი",
    trialNote: "პირველი 5 დღე უფასოა",
    tryFree: "სცადე 5 დღე უფასოდ",
    chooseEnterprise: "აირჩიე Enterprise",
    opening: "იხსნება…",
    skip: "გამოტოვება და უფასო ვერსიით გაგრძელება",
    features: {
      pro: ["პირადი ასისტენტი", "კონტაქტების ანალიზი", "პრიორიტეტული მხარდაჭერა", "გაფართოებული შედეგების ნახვა"],
      enterprise: ["ყველაფერი Pro-დან", "გამოყოფილი მხარდაჭერა", "ინდივიდუალური ინტეგრაციები"],
    },
  },
};

export default function PricingPage() {
  const s = L[getLocale()];
  const router = useRouter();
  const [paddleReady, setPaddleReady] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

  const PLANS = [
    {
      key: "pro",
      name: "Pro",
      price: "$19.99",
      period: "/mo",
      hasTrial: true,
      features: s.features.pro,
      highlight: true,
      cta: s.tryFree,
    },
    {
      key: "enterprise",
      name: "Enterprise",
      price: "$79",
      period: "/mo",
      hasTrial: false,
      features: s.features.enterprise,
      highlight: false,
      cta: s.chooseEnterprise,
    },
  ];

  useEffect(() => {
    ensurePaddle().then(() => setPaddleReady(true)).catch(() => {});
    const off = onCheckoutCompleted(() => {
      router.replace("/chat");
    });
    return off;
  }, [router]);

  function handleCheckout(planKey: string) {
    if (!paddleReady) return;
    setLoading(planKey);
    openCheckout(PRICE_IDS[planKey]);
    setLoading(null);
  }

  return (
    <div className="min-h-screen px-4 py-12 flex flex-col items-center" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-2xl">
        {/* Header with close button */}
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
          <h1 className="mb-3" style={{ font: "500 26px/32px var(--font-bricolage)", color: "var(--ink)" }}>{s.choosePlan}</h1>
          <p className="max-w-md mx-auto" style={{ font: "400 14px/21px var(--font-system)", color: "var(--ink-soft)" }}>
            {s.subtitle}
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className="flex flex-col gap-4 relative"
              style={{
                borderRadius: "var(--radius-card)",
                padding: "24px",
                background: plan.highlight ? "var(--accent)" : "#FFFFFF",
                border: `1px solid ${plan.highlight ? "var(--accent)" : "var(--sidebar-border)"}`,
                boxShadow: "var(--shadow-card)",
              }}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span
                    className="text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap"
                    style={{ background: "var(--ink-strong)", color: "var(--toast-fg)" }}
                  >
                    {s.mostPopular}
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-bold" style={{ color: plan.highlight ? "#FBFAF4" : "var(--ink)" }}>{plan.name}</span>
                  {plan.hasTrial && (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={plan.highlight ? { background: "rgba(255,255,255,0.2)", color: "#FBFAF4" } : { background: "var(--accent-tint)", color: "var(--accent-strong)" }}
                    >
                      {s.trialBadge}
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold" style={{ color: plan.highlight ? "#FBFAF4" : "var(--ink)" }}>{plan.price}</span>
                  <span className="text-sm" style={{ color: plan.highlight ? "rgba(255,255,255,0.7)" : "var(--meta)" }}>{plan.period}</span>
                </div>
                {plan.hasTrial && (
                  <p className="text-xs mt-1" style={{ color: plan.highlight ? "rgba(255,255,255,0.7)" : "var(--meta)" }}>{s.trialNote}</p>
                )}
              </div>

              <ul className="flex flex-col gap-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm" style={{ color: plan.highlight ? "#FBFAF4" : "var(--ink)" }}>
                    <svg className="h-4 w-4 shrink-0" style={{ color: plan.highlight ? "rgba(255,255,255,0.8)" : "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.key)}
                disabled={!paddleReady || loading === plan.key}
                className="w-full h-11 rounded-full text-sm font-semibold transition-all disabled:opacity-60"
                style={
                  plan.highlight
                    ? { background: "#FBFAF4", color: "var(--accent-strong)" }
                    : { background: "var(--accent)", color: "#FBFAF4" }
                }
              >
                {loading === plan.key ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    {s.opening}
                  </span>
                ) : (
                  plan.cta
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Skip */}
        <div className="text-center">
          <Link href="/chat" className="text-sm transition-colors hover:text-[var(--ink)]" style={{ color: "var(--meta)" }}>
            {s.skip}
          </Link>
        </div>
      </div>
    </div>
  );
}
