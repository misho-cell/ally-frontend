"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

const PRICE_IDS: Record<string, string> = {
  premium: "pri_01kvq5da2w9fjgv7cn0eqqqk63",
  pro: "pri_01kvq5fwfdj2p8j42p663mh3yr",
  enterprise: "pri_01kvq5gjc8mb3kx2qhwp44mtkh",
};

function getUserId(): string {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) return "";
    const payload = JSON.parse(atob(token.split(".")[1]));
    return String(payload.userId ?? "");
  } catch {
    return "";
  }
}

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: string) => void };
      Initialize: (opts: {
        token: string;
        eventCallback: (data: { name: string }) => void;
      }) => void;
      Checkout: {
        open: (opts: {
          items: { priceId: string; quantity: number }[];
          customData: Record<string, string>;
        }) => void;
      };
    };
  }
}

const PLANS = [
  {
    key: "premium",
    name: "Premium",
    price: "$2.99",
    period: "/თვე",
    hasTrial: true,
    trialLabel: "5-day free trial",
    features: ["AI ასისტენტი", "კონტაქტების ანალიზი", "ძირითადი ფუნქციები"],
    highlight: false,
    cta: "5 დღე უფასოდ სცადე",
  },
  {
    key: "pro",
    name: "Pro",
    price: "$19.99",
    period: "/თვე",
    hasTrial: false,
    trialLabel: null,
    features: ["Premium-ის ყველაფერი", "პრიორიტეტული მხარდაჭერა", "Advanced analytics"],
    highlight: true,
    cta: "Pro-ს არჩევა",
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "$79",
    period: "/თვე",
    hasTrial: false,
    trialLabel: null,
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
    if (document.querySelector('script[src*="cdn.paddle.com"]')) {
      setPaddleReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      window.Paddle?.Environment.set("production");
      window.Paddle?.Initialize({
        token: process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN!,
        eventCallback(data) {
          if (data.name === "checkout.completed") {
            router.replace("/chat");
          }
        },
      });
      setPaddleReady(true);
    };
    document.head.appendChild(script);
  }, [router]);

  function openCheckout(planKey: string) {
    if (!paddleReady || !window.Paddle) return;
    setLoading(planKey);
    const userId = getUserId();
    window.Paddle.Checkout.open({
      items: [{ priceId: PRICE_IDS[planKey], quantity: 1 }],
      customData: { user_id: userId },
    });
    setLoading(null);
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] px-4 py-12 flex flex-col items-center">
      <div className="w-full max-w-3xl">
        {/* Logo + header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2.5 mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ally-logo.svg" alt="Ally" width={32} height={32} />
            <span className="text-white text-2xl font-bold tracking-tight">Ally</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-3">აირჩიე შენი Plan</h1>
          <p className="text-gray-400 text-base max-w-md mx-auto">
            Premium-ზე 5 დღე უფასოდ სცადე — ბარათი არ გეჭდება სანამ trial არ დასრულდება.
          </p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {PLANS.map((plan) => (
            <div
              key={plan.key}
              className={`rounded-2xl p-6 flex flex-col gap-4 relative ${
                plan.highlight
                  ? "bg-[#29a9e1] ring-2 ring-[#29a9e1]"
                  : "bg-white/10"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="bg-white text-[#1a1a2e] text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                    ყველაზე პოპულარული
                  </span>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg font-bold text-white">{plan.name}</span>
                  {plan.hasTrial && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">
                      5-day trial
                    </span>
                  )}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-sm text-white/60">{plan.period}</span>
                </div>
                {plan.hasTrial && (
                  <p className="text-xs text-white/60 mt-1">პირველი 5 დღე უფასოა</p>
                )}
              </div>

              <ul className="flex flex-col gap-2 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white">
                    <svg
                      className="h-4 w-4 shrink-0 text-white/80"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>

              <button
                onClick={() => openCheckout(plan.key)}
                disabled={!paddleReady || loading === plan.key}
                className={`w-full h-11 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 ${
                  plan.highlight
                    ? "bg-white text-[#1a1a2e] hover:bg-gray-100"
                    : "bg-white/15 text-white hover:bg-white/25"
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
          <Link
            href="/chat"
            className="text-sm text-gray-500 hover:text-gray-400 transition-colors"
          >
            გამოტოვება — უფასო ვერსიის გამოყენება
          </Link>
        </div>
      </div>
    </div>
  );
}
