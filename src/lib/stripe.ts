"use client";

import { apiFetch, ApiError } from "./api";
import { getLocale } from "./i18n";

// Stripe subscription (6 Sept). Both routes are live on the backend; the
// client only ever redirects to a Stripe-hosted URL — same tab, never a new
// one (a new tab is lost on mobile). Token TOP-UPS still go through Paddle
// (see paddle.ts); this file is the monthly subscription only.

export const PAST_DUE_GRACE_DAYS = 14;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "inactive"
  | ""
  | null
  | undefined;

export type BillingProfile = {
  subscription_status?: SubscriptionStatus;
  subscription_tier?: string;
  trial_ends_at?: string | null;
  current_period_ends_at?: string | null;
  // Set when the status last changed. For past_due this is the moment the
  // card failed — the 14-day grace window counts from here, NOT from
  // current_period_ends_at (Stripe has already pushed that a month ahead).
  subscription_status_changed_at?: string | null;
};

export type CheckoutOutcome =
  | { kind: "redirected" }
  | { kind: "cancelled" }
  | { kind: "unavailable"; message: string }
  | { kind: "failed"; message: string };

const S = {
  en: {
    unavailable: "Payments are temporarily unavailable",
    failed: "Couldn't open the payment page",
    chargeToday: "You've already used your free trial. $19.99 will be charged today. Continue?",
    portalFailed: "Couldn't open subscription management. Please try again.",
  },
  ka: {
    unavailable: "გადახდა დროებით მიუწვდომელია",
    failed: "გადახდის გვერდი ვერ გაიხსნა",
    chargeToday: "უფასო პერიოდით უკვე ისარგებლე. თანხა დღესვე ჩამოიჭრება. გავაგრძელოთ?",
    portalFailed: "გამოწერის მართვა ვერ გაიხსნა. სცადე თავიდან.",
  },
};

// POST /billing/stripe/checkout → { url, trial_days }. The trial is granted
// once per person, forever; a returning user gets trial_days: 0 and is
// charged on day one — so confirm before sending them to Stripe in that
// case. Resolves "redirected" right before navigation.
export async function startStripeCheckout(): Promise<CheckoutOutcome> {
  const s = S[getLocale()];
  let data: { url: string; trial_days: number };
  try {
    const res = await apiFetch<{ success: boolean; data: { url: string; trial_days: number } }>(
      "/billing/stripe/checkout",
      { method: "POST" },
    );
    data = res.data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 503) return { kind: "unavailable", message: s.unavailable };
    return { kind: "failed", message: s.failed };
  }
  if (!data?.url) return { kind: "failed", message: s.failed };
  if (data.trial_days === 0 && !window.confirm(s.chargeToday)) return { kind: "cancelled" };
  window.location.href = data.url;
  return { kind: "redirected" };
}

// POST /billing/stripe/portal → { url }. 404 = this account has never had a
// Stripe customer — not an error, the caller should simply hide the button.
export async function openStripePortal(): Promise<"redirected" | "none" | "failed"> {
  try {
    const res = await apiFetch<{ success: boolean; data: { url: string } }>("/billing/stripe/portal", {
      method: "POST",
    });
    if (!res.data?.url) return "failed";
    window.location.href = res.data.url;
    return "redirected";
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return "none";
    return "failed";
  }
}

export function portalErrorText(): string {
  return S[getLocale()].portalFailed;
}

// Days of access left in the past_due grace window, or null when
// subscription_status_changed_at is missing (then just ask for the card).
export function pastDueDaysLeft(p: BillingProfile | null | undefined): number | null {
  if (!p?.subscription_status_changed_at) return null;
  const changed = new Date(p.subscription_status_changed_at).getTime();
  if (isNaN(changed)) return null;
  const end = changed + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((end - Date.now()) / (24 * 60 * 60 * 1000)));
}

export function isSubscribed(status: SubscriptionStatus): boolean {
  return status === "trialing" || status === "active";
}
