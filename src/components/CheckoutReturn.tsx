"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isSubscribed, type BillingProfile } from "@/lib/stripe";

// Stripe (6 Sept): after payment Stripe sends the user back to
// /chat?checkout=success — but the webhook that flips subscription_status
// lands independently, often a few seconds LATER than the person does.
// Reading /profile once at that instant would say "not subscribed" to
// someone who just paid. So: poll every 2s, up to 10 times; stop on
// trialing/active; after 20s say the payment is received and activating,
// never that it failed. The query param is stripped immediately so a
// refresh doesn't restart the cycle.
const S = {
  en: {
    checking: "Verifying your payment…",
    welcome: "You're in. Welcome to Netai Pro!",
    pending: "Payment received. Activation will finish in a few seconds.",
  },
  ka: {
    checking: "ვამოწმებთ გადახდას…",
    welcome: "მზადაა. კეთილი იყოს შენი მობრძანება Netai Pro-ში!",
    pending: "გადახდა მიღებულია, აქტივაცია რამდენიმე წამში დასრულდება.",
  },
};

type Phase = "idle" | "checking" | "welcome" | "pending";

export default function CheckoutReturn() {
  const pathname = usePathname();
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!pathname?.startsWith("/chat")) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;

    params.delete("checkout");
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""));

    let alive = true;
    let attempts = 0;
    setPhase("checking");

    const tick = async () => {
      if (!alive) return;
      attempts += 1;
      try {
        const res = await apiFetch<{ data?: BillingProfile } & BillingProfile>("/profile");
        const p = res.data ?? res;
        if (isSubscribed(p.subscription_status)) {
          if (alive) setPhase("welcome");
          return;
        }
      } catch {}
      if (attempts >= 10) {
        if (alive) setPhase("pending");
        return;
      }
      setTimeout(tick, 2000);
    };
    tick();

    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (phase !== "welcome" && phase !== "pending") return;
    const id = setTimeout(() => setPhase("idle"), phase === "welcome" ? 4000 : 8000);
    return () => clearTimeout(id);
  }, [phase]);

  if (phase === "idle") return null;
  const s = S[getLocale()];

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 top-4 z-[70] flex -translate-x-1/2 items-center gap-2.5 px-4 py-2.5"
      style={{
        background: "var(--ink-strong)",
        color: "var(--bg)",
        borderRadius: "var(--radius-pill)",
        boxShadow: "var(--shadow-pop)",
        font: "600 13px/18px var(--font-system)",
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      {phase === "checking" && (
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      <span>{phase === "checking" ? s.checking : phase === "welcome" ? s.welcome : s.pending}</span>
    </div>
  );
}
