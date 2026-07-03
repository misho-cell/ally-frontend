"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";

const PRICE_IDS: Record<string, string> = {
  pro: "pri_01kvq5fwfdj2p8j42p663mh3yr",
  enterprise: "pri_01kvq5gjc8mb3kx2qhwp44mtkh",
};

const PLANS = [
  {
    key: "pro",
    name: "Pro",
    price: "$19.99",
    period: "/თვე",
    hasTrial: true,
    features: ["AI ასისტენტი", "კონტაქტების ანალიზი", "პრიორიტეტული მხარდაჭერა", "Advanced analytics"],
    highlight: true,
    cta: "5 დღე უფასოდ სცადე",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$79",
    period: "/თვე",
    hasTrial: false,
    features: ["Pro-ის ყველაფერი", "Dedicated support", "Custom integrations"],
    highlight: false,
    cta: "Enterprise-ის არჩევა",
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [paddleReady, setPaddleReady] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);

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
    <div className="min-h-screen bg-white px-4 py-12 flex flex-col items-center">
      <div className="w-full max-w-2xl">
        {/* Header with close button */}
        <div className="relative text-center mb-10">
          <Link
            href="/chat"
            className="absolute right-0 top-0 flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-[#8A8778] transition-colors hover:bg-gray-200 hover:text-[#23261F]"
            aria-label="დახურვა"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </Link>

          <div className="flex items-center justify-center gap-2.5 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ally-logo.svg" alt="Ally" width={32} height={32} style={{ borderRadius: "26%" }} />
            <span className="text-[#23261F] text-2xl font-semibold tracking-tight">Ally</span>
          </div>
          <h1 className="text-3xl font-bold text-[#23261F] mb-3">აირჩიე შენი Plan</h1>
          <p className="text-[#8A8778] text-base max-w-md mx-auto">
            Pro-ზე 5 დღე უფასოდ სცადე — ბარათი არ გეჭდება სანამ trial არ დასრულდება.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 flex flex-col gap-4 relative border ${
                plan.highlight ? "bg-[#3E7A56] border-[#3E7A56]" : "bg-white border-[#E4E0D3]"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-[#23261F] text-white text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    ყველაზე პოპულარული
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-lg font-bold ${plan.highlight ? "text-white" : "text-[#23261F]"}`}>{plan.name}</span>
                  {plan.hasTrial && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${plan.highlight ? "bg-white/20 text-white" : "bg-[#DEE8E0] text-[#3E7A56]"}`}>
                      5-day trial
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-3xl font-bold ${plan.highlight ? "text-white" : "text-[#23261F]"}`}>{plan.price}</span>
                  <span className={`text-sm ${plan.highlight ? "text-white/70" : "text-[#8A8778]"}`}>{plan.period}</span>
                </div>
                {plan.hasTrial && (
                  <p className={`text-xs mt-1 ${plan.highlight ? "text-white/70" : "text-[#8A8778]"}`}>პირველი 5 დღე უფასოა</p>
                )}
              </div>

              <ul className="flex flex-col gap-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className={`flex items-center gap-2 text-sm ${plan.highlight ? "text-white" : "text-[#23261F]"}`}>
                    <svg className={`h-4 w-4 shrink-0 ${plan.highlight ? "text-white/80" : "text-[#3E7A56]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => handleCheckout(plan.key)}
                disabled={!paddleReady || loading === plan.key}
                className={`w-full h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  plan.highlight
                    ? "bg-white text-[#3E7A56] hover:bg-gray-100"
                    : "bg-[#3E7A56] text-white hover:opacity-90"
                }`}
              >
                {loading === plan.key ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    იტვირთება...
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
          <Link href="/chat" className="text-sm text-[#8A8778] hover:text-[#23261F] transition-colors">
            გამოტოვება — უფასო ვერსიის გამოყენება
          </Link>
        </div>
      </div>
    </div>
  );
}
