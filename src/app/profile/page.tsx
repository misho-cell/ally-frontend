"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";

type Profile = {
  name: string;
  phone: string;
  subscription_tier: "free" | "premium" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | "inactive";
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
};

const TIER_LABELS: Record<string, string> = {
  free: "უფასო",
  premium: "Premium",
  pro: "Pro",
  enterprise: "Enterprise",
};

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function fmt(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("ka-GE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
          {days > 0 ? `${days} დღე დარჩა trial-ში` : "Trial დასრულდა"}
        </p>
        <p className="text-xs text-blue-500 mt-1">{fmt(trial_ends_at)} — ავტომატური გადახდა</p>
      </div>
    );
  }

  if (subscription_status === "active") {
    return (
      <div className="rounded-xl bg-green-50 border border-green-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="font-semibold text-green-800">{TIER_LABELS[subscription_tier]} — აქტიური</span>
        </div>
        {current_period_ends_at && (
          <p className="text-sm text-green-700">შემდეგი გადახდა: {fmt(current_period_ends_at)}</p>
        )}
      </div>
    );
  }

  if (subscription_status === "past_due") {
    return (
      <div className="rounded-xl bg-red-50 border border-red-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-red-500" />
          <span className="font-semibold text-red-800">გადახდის პრობლემა</span>
        </div>
        <p className="text-sm text-red-700">გადახდა ვერ მოხდა — განაახლე გადახდის მეთოდი Paddle portal-ის გამოყენებით.</p>
      </div>
    );
  }

  if (subscription_status === "canceled" && current_period_ends_at) {
    return (
      <div className="rounded-xl bg-orange-50 border border-orange-100 p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="h-2 w-2 rounded-full bg-orange-500" />
          <span className="font-semibold text-orange-800">გაუქმებულია</span>
        </div>
        <p className="text-sm text-orange-700">
          {TIER_LABELS[subscription_tier]} {fmt(current_period_ends_at)}-მდე გრძელდება
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        <span className="font-semibold text-gray-700">უფასო Plan</span>
      </div>
      <p className="text-sm text-gray-500">Plan-ის ასარჩევად დააჭირე ქვემოთ.</p>
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
      .catch((err) => setError(err instanceof ApiError ? err.message : "პრობლემა მოხდა"))
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
        setError("Portal-ის გახსნა ვერ მოხდა. სცადეთ თავიდან.");
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
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-[#1a1a2e]" />
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
            className="text-xl font-bold"
            style={{ color: "var(--ink-strong)", fontFamily: "var(--font-bricolage)" }}
          >
            პროფილი
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
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
                  style={{ background: "#1a1a2e" }}
                >
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="font-semibold text-lg" style={{ color: "var(--ink-strong)" }}>
                    {profile.name}
                  </p>
                  <p className="text-sm" style={{ color: "var(--meta)" }}>
                    {profile.phone}
                  </p>
                </div>
              </div>
            </div>

            {/* Subscription card */}
            <div
              className="rounded-2xl p-6 flex flex-col gap-4"
              style={{
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
              }}
            >
              <h2 className="font-semibold" style={{ color: "var(--ink-strong)" }}>
                Subscription
              </h2>

              <SubscriptionBadge profile={profile} />

              {isFreeOrInactive ? (
                <Link
                  href="/pricing"
                  className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#1a1a2e" }}
                >
                  Plan-ის არჩევა
                </Link>
              ) : showPortal ? (
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="flex h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
                  style={{
                    border: "1px solid var(--sidebar-border)",
                    color: "var(--ink-2)",
                  }}
                >
                  {portalLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                  ) : (
                    "Subscription-ის მართვა"
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
              გამოსვლა
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
