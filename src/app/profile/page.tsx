"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { authHeaders } from "@/lib/deviceId";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Profile = {
  name: string;
  phone: string;
  subscription_tier: "free" | "premium" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | "inactive";
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};

type TokenBalance = {
  enabled: boolean;
  balance: number;
  grantedThisPeriod: number;
  spentThisPeriod: number;
};

type TopupPackage = {
  id: number;
  paddlePriceId: string;
  tokens: number;
  label: string;
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  premium: "Premium",
  pro: "Pro",
  enterprise: "Enterprise",
};

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function nextRenewalDate(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Token wallet widget (Claude-style usage limit view) + top-up packages.
// Hidden entirely when the backend kill-switch is off (enabled:false).
function TokensWidget() {
  const [tokens, setTokens] = useState<TokenBalance | null>(null);
  const [failed, setFailed] = useState(false);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceRef = useRef<number | null>(null);

  async function fetchTokens(): Promise<TokenBalance | null> {
    try {
      const res = await fetch(`${BASE_URL}/billing/tokens`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (json?.data && typeof json.data.enabled === "boolean") {
        setTokens(json.data as TokenBalance);
        balanceRef.current = json.data.balance;
        return json.data as TokenBalance;
      }
    } catch {}
    return null;
  }

  useEffect(() => {
    fetchTokens().then((t) => { if (!t) setFailed(true); });
    fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() })
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After checkout completes the webhook credits tokens within seconds — poll
  // the balance every 2s (max 30s) until it grows.
  useEffect(() => {
    const off = onCheckoutCompleted(() => {
      const startBalance = balanceRef.current ?? 0;
      let ticks = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        ticks++;
        const t = await fetchTokens();
        if ((t && t.balance > startBalance) || ticks >= 15) {
          if (t && t.balance > startBalance) {
            setToast("Tokens added");
            setTimeout(() => setToast(null), 3500);
          }
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tokens && !tokens.enabled) return null;
  if (!tokens && !failed) return null; // loading — no empty box

  const balance = tokens ? Math.max(0, tokens.balance) : null;
  const granted = tokens?.grantedThisPeriod ?? 0;
  const isTrial = granted === 120;
  const remainingPct = tokens && granted > 0 ? balance! / granted : null;
  const barColor =
    remainingPct !== null && remainingPct <= 0.05
      ? "#dc2626"
      : remainingPct !== null && remainingPct <= 0.2
      ? "#d97706"
      : "#3E7A56";
  // Top-up is for subscribers only — trial wallets get the subscribe CTA elsewhere.
  const showTopup = !!tokens && !isTrial && packages.length > 0;

  async function buy(pkg: TopupPackage) {
    try {
      await ensurePaddle();
      openCheckout(pkg.paddlePriceId);
    } catch {}
  }

  return (
    <div
      className="rounded-2xl p-6 flex flex-col gap-3"
      style={{ background: "#FFFFFF", border: "1px solid var(--sidebar-border)" }}
    >
      {toast && (
        <div className="rounded-lg bg-[#DEE8E0] px-3 py-2 text-sm font-medium text-[#2E5C41]">{toast}</div>
      )}
      <h2 className="font-semibold" style={{ color: "var(--ink)" }}>Tokens</h2>

      {failed || !tokens ? (
        <p className="text-sm" style={{ color: "var(--meta)" }}>—</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-bold" style={{ color: "var(--ink)" }}>{balance}</span>
            {granted > 0 && (
              <span className="text-sm" style={{ color: "var(--meta)" }}>/ {granted}</span>
            )}
          </div>

          {granted > 0 && (
            <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "#EFEDE6" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.round((remainingPct ?? 0) * 100)}%`,
                  background: barColor,
                  transition: "width 0.4s",
                }}
              />
            </div>
          )}

          <p className="text-xs" style={{ color: "var(--meta)" }}>
            {isTrial
              ? "Trial balance — subscribe to keep going"
              : granted > 0
              ? `Renews ${nextRenewalDate()}`
              : null}
          </p>

          {showTopup && (
            <div className="mt-2 flex flex-col gap-2 border-t border-[#EFEDE6] pt-3">
              <p className="text-xs font-semibold" style={{ color: "var(--ink)" }}>Add tokens</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                {packages.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    onClick={() => buy(pkg)}
                    className="flex-1 rounded-xl border border-[#C7D6C9] bg-white px-3 py-2.5 text-sm font-medium text-[#23261F] transition-colors hover:bg-[#F7F9F7]"
                  >
                    {pkg.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubscriptionBadge({ profile }: { profile: Profile }) {
  const { subscription_status, subscription_tier, trial_ends_at, current_period_ends_at } = profile;

  if (subscription_status === "trialing" && trial_ends_at) {
    const days = daysUntil(trial_ends_at);
    return (
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="font-semibold text-blue-800">{TIER_LABELS[subscription_tier]} Trial</span>
        </div>
        <p className="text-sm text-blue-700">
          {days > 0 ? `${days} days left in trial` : "Trial ended"}
        </p>
        <p className="text-xs text-blue-500 mt-1">{fmt(trial_ends_at)} — automatic charge</p>
      </div>
    );
  }

  if (subscription_status === "active") {
    return (
      <div className="rounded-xl border p-4" style={{ background: "#DEE8E0", borderColor: "#C7D6C9" }}>
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full" style={{ background: "#3E7A56" }} />
          <span className="font-semibold" style={{ color: "#2E5C41" }}>{TIER_LABELS[subscription_tier]} — Active</span>
        </div>
        {current_period_ends_at && (
          <p className="text-sm" style={{ color: "#3E7A56" }}>Next payment: {fmt(current_period_ends_at)}</p>
        )}
      </div>
    );
  }

  if (subscription_status === "past_due") {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-semibold text-red-800">Payment issue</span>
        </div>
        <p className="text-sm text-red-700">The payment failed — update your payment method via the Paddle portal.</p>
      </div>
    );
  }

  if (subscription_status === "canceled" && current_period_ends_at) {
    return (
      <div className="rounded-xl bg-orange-50 border border-orange-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          <span className="font-semibold text-orange-800">Canceled</span>
        </div>
        <p className="text-sm text-orange-700">
          {TIER_LABELS[subscription_tier]} continues until {fmt(current_period_ends_at)}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        <span className="font-semibold text-gray-700">Free plan</span>
      </div>
      <p className="text-sm text-gray-500">Tap below to choose a plan.</p>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortal, setShowPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Profile }>("/profile")
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ success: boolean; data: { url: string } }>(
        "/billing/customer-portal",
        { method: "POST" }
      );
      window.open(res.data.url, "_blank");
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setShowPortal(false);
      } else {
        setError("Couldn't open the portal. Please try again.");
      }
    } finally {
      setPortalLoading(false);
    }
  }

  function signOut() {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  const isFreeOrInactive =
    !profile ||
    profile.subscription_status === "inactive" ||
    profile.subscription_tier === "free";

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-[#E4E0D3] border-t-[#3E7A56]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto max-w-md">
        {/* Back link */}
        <div className="flex items-center gap-3 mb-8">
          <Link
            href="/chat"
            className="text-sm transition-colors"
            style={{ color: "var(--meta)" }}
          >
            ← Chat
          </Link>
          <span
            className="text-xl font-semibold"
            style={{ color: "var(--ink)" }}
          >
            Profile
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}

        {profile && (
          <div className="flex flex-col gap-4">
            {/* User card */}
            <div
              className="rounded-2xl p-6"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold"
                  style={{ background: "#DEE8E0", border: "2px solid #3E7A56", color: "#23261F" }}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-lg" style={{ color: "var(--ink)" }}>
                    {profile.name}
                  </p>
                  <p className="text-sm" style={{ color: "var(--meta)" }}>
                    {profile.phone}
                  </p>
                </div>
              </div>
            </div>

            {/* Token wallet */}
            <TokensWidget />

            {/* Subscription card */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: "#FFFFFF",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2 className="font-semibold" style={{ color: "var(--ink)" }}>
                Subscription
              </h2>

              <SubscriptionBadge profile={profile} />

              {isFreeOrInactive ? (
                <Link
                  href="/pricing"
                  className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#3E7A56" }}
                >
                  Choose a plan
                </Link>
              ) : showPortal ? (
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    color: "var(--ink)",
                  }}
                >
                  {portalLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  ) : (
                    "Manage subscription"
                  )}
                </button>
              ) : null}
            </div>

            {/* Sign out */}
            <button
              onClick={signOut}
              className="text-sm py-2 text-center transition-colors hover:opacity-80"
              style={{ color: "#ef4444" }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
