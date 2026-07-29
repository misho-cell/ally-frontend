"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { authHeaders } from "@/lib/deviceId";
import { ensurePaddle, onCheckoutCompleted, openCheckout } from "@/lib/paddle";
import { getLocale } from "@/lib/i18n";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MCP_URL = "https://api.allyapp.one/mcp";
const SITE_URL = "https://allyapp.one";

// Screen-local strings (phone locale: ka → Georgian, else English).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    backChat: "← Chat",
    title: "Profile",
    inviteTitle: "Invite friends",
    inviteBody:
      "When a friend signs up, they enter your number in the invite field. You earn a share of their first subscription — and of subscriptions from the people they invite, up to 6 levels deep.",
    inviteBtn: "Invite friend",
    inviteCopied: "Invite copied to clipboard",
    shareText: (phone: string) =>
      `Hey! I'm using Netai — an assistant that works your own network to get things done. Join me:\n\n` +
      `1. Open ${SITE_URL} and sign in with your phone number\n` +
      `2. On the sign-up step, put my number in the “Invited by” field: ${phone}\n\n` +
      `That's it — see you inside!`,
    tokens: "Tokens",
    renews: (d: string) => `Renews ${d}`,
    trialBalance: "Trial balance — subscribe to keep going",
    addTokens: "Add tokens",
    tokensAdded: "Tokens added",
    earnings: "My earnings",
    earningsSub: "Invite friends, earn from their subscriptions",
    claudeTitle: "Netai in Claude",
    claudeBody: "Use your Netai network directly from Claude — search, intro requests and replies, without leaving the chat.",
    claudeBadge: "Requires a paid claude.ai plan (Pro/Team)",
    copy: "Copy",
    copied: "Copied!",
    claudeSteps: [
      "Open claude.ai → Settings → Connectors",
      "Click “Add custom connector”",
      "Name: Netai, URL: paste the address you copied → Add",
      "Click “Connect” → enter your phone number → WhatsApp code",
    ],
    claudeTip: "Tip: in the connector settings, set “Read-only tools” to “Allowed” so searches don’t ask for confirmation every time",
    claudeNote: "Claude will always ask you before sending an intro request — nothing is sent behind your back.",
    subscription: "Subscription",
    choosePlan: "Choose a plan",
    manageSub: "Manage subscription",
    signOut: "Sign out",
    trialLabel: (tier: string) => `${tier} Trial`,
    daysLeft: (n: number) => (n > 0 ? `${n} days left in trial` : "Trial ended"),
    autoCharge: (d: string) => `${d} — automatic charge`,
    activeLabel: (tier: string) => `${tier} — Active`,
    nextPayment: (d: string) => `Next payment: ${d}`,
    paymentIssue: "Payment issue",
    paymentFailedBody: "The payment failed — update your payment method via the Paddle portal.",
    canceled: "Canceled",
    continuesUntil: (tier: string, d: string) => `${tier} continues until ${d}`,
    freePlan: "Free plan",
    tapChoose: "Tap below to choose a plan.",
    portalError: "Couldn't open the portal. Please try again.",
    genericError: "Something went wrong",
  },
  ka: {
    backChat: "← ჩეთი",
    title: "პროფილი",
    inviteTitle: "დაპატიჟე მეგობრები",
    inviteBody:
      "როცა მეგობარი დარეგისტრირდება, მოსაწვევის ველში შენს ნომერს ჩაწერს. შენ მიიღებ წილს მისი პირველი გამოწერიდან და მის მიერ დაპატიჟებულების გამოწერებიდანაც, 6 დონემდე.",
    inviteBtn: "მეგობრის დაპატიჟება",
    inviteCopied: "მოსაწვევი დაკოპირდა",
    shareText: (phone: string) =>
      `გამარჯობა! ვიყენებ Netai-ს, ასისტენტს, რომელიც შენივე ქსელის დახმარებით აგვარებს საქმეებს. შემომიერთდი:\n\n` +
      `1. გახსენი ${SITE_URL} და შედი შენი ნომრით\n` +
      `2. რეგისტრაციისას „Invited by“ ველში ჩაწერე ჩემი ნომერი: ${phone}\n\n` +
      `სულ ეს არის, შიგნით გნახავ!`,
    tokens: "ტოკენები",
    renews: (d: string) => `განახლდება: ${d}`,
    trialBalance: "საცდელი ბალანსი. გასაგრძელებლად გამოიწერე.",
    addTokens: "ტოკენების დამატება",
    tokensAdded: "ტოკენები დაემატა",
    earnings: "ჩემი შემოსავალი",
    earningsSub: "დაპატიჟე მეგობრები და მიიღე წილი მათი გამოწერებიდან",
    claudeTitle: "Netai Claude-ში",
    claudeBody: "გამოიყენე შენი Netai ქსელი პირდაპირ Claude-დან: ძიება, გაცნობის თხოვნები და პასუხები, ჩეთიდან გაუსვლელად.",
    claudeBadge: "საჭიროა claude.ai-ს ფასიანი გეგმა (Pro/Team)",
    copy: "კოპირება",
    copied: "დაკოპირდა!",
    claudeSteps: [
      "გახსენი claude.ai → Settings → Connectors",
      "დააჭირე „Add custom connector“",
      "Name: Netai, URL: ჩასვი დაკოპირებული მისამართი → Add",
      "დააჭირე „Connect“ → ჩაწერე შენი ნომერი → WhatsApp კოდი",
    ],
    claudeTip: "რჩევა: კონექტორის პარამეტრებში „Read-only tools“ გადართე „Allowed“-ზე, რომ ძიება ყოველაზე დადასტურებას არ ითხოვდეს",
    claudeNote: "Claude ყოველთვის გკითხავს გაცნობის თხოვნის გაგზავნამდე. შენს ზურგს უკან არაფერი იგზავნება.",
    subscription: "გამოწერა",
    choosePlan: "აირჩიე გეგმა",
    manageSub: "გამოწერის მართვა",
    signOut: "გასვლა",
    trialLabel: (tier: string) => `${tier} საცდელი`,
    daysLeft: (n: number) => (n > 0 ? `საცდელ პერიოდში დარჩა ${n} დღე` : "საცდელი პერიოდი დასრულდა"),
    autoCharge: (d: string) => `${d}: ავტომატური გადახდა`,
    activeLabel: (tier: string) => `${tier}: აქტიური`,
    nextPayment: (d: string) => `შემდეგი გადახდა: ${d}`,
    paymentIssue: "გადახდის პრობლემა",
    paymentFailedBody: "გადახდა ვერ შესრულდა. გაანახლე გადახდის მეთოდი Paddle-ის პორტალიდან.",
    canceled: "გაუქმებული",
    continuesUntil: (tier: string, d: string) => `${tier} გაგრძელდება ${d}-მდე`,
    freePlan: "უფასო გეგმა",
    tapChoose: "გეგმის ასარჩევად დააჭირე ქვემოთ.",
    portalError: "პორტალი ვერ გაიხსნა. სცადე თავიდან.",
    genericError: "რაღაც შეცდომა მოხდა",
  },
};

function useStrings() {
  return L[getLocale()];
}

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

function fmtTokens(n: number): string {
  return Number(n).toLocaleString("en-US");
}

// Group a +995XXXXXXXXX number with spaces for display: +995 599 93 41 75.
// Anything that doesn't match stays as-is (never alter the digits).
function groupPhone(phone: string): string {
  const m = phone.match(/^(\+995)(\d{3})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}

// Pull the price out of a top-up package label ("500 ტოკენი — $10.99").
// Prices always come from the backend label — never hardcoded.
function priceFromLabel(label: string): string | null {
  const m = label.match(/\$[\d.,]+/);
  return m ? m[0] : null;
}

// Invite friends — referral share, prominent on the profile. The share text
// carries the site link, a mini how-to and the user's number so the friend
// has zero follow-up questions.
function InviteFriendsCard({ phone }: { phone: string }) {
  const s = useStrings();
  const [toast, setToast] = useState<string | null>(null);

  async function share() {
    const text = s.shareText(phone);
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        setToast(s.inviteCopied);
        setTimeout(() => setToast(null), 2400);
      }
    } catch {}
  }

  return (
    <div className="card flex flex-col gap-3">
      {toast && (
        <div className="toast" role="status" aria-live="polite"><span>✓</span>{toast}</div>
      )}
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.inviteTitle}</h2>
      <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>
        {s.inviteBody}
      </p>
      <button type="button" onClick={share} className="btn-primary self-start">
        {s.inviteBtn}
      </button>
    </div>
  );
}

// Static "add Netai to your Claude" guide — no API involved. Collapsible so
// the profile stays compact.
function AllyInClaudeCard() {
  const s = useStrings();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="card flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.claudeTitle}</h2>
        <span style={{ color: "var(--meta)", fontSize: "12px" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>
            {s.claudeBody}
          </p>

          <span
            className="self-start rounded-full px-3 py-1"
            style={{ background: "var(--accent-tint)", color: "var(--accent-strong)", fontSize: "12px", fontWeight: 600 }}
          >
            {s.claudeBadge}
          </span>

          {/* Copy URL */}
          <div className="flex items-center gap-2">
            <code
              className="flex-1 truncate px-3 py-2.5 text-xs"
              style={{
                color: "var(--ink)",
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
                borderRadius: "var(--radius-tile)",
              }}
            >
              {MCP_URL}
            </code>
            <button type="button" onClick={copyUrl} className="btn-primary shrink-0" style={{ padding: "8px 16px", fontSize: "12px" }}>
              {copied ? s.copied : s.copy}
            </button>
          </div>

          {/* Steps */}
          <ol className="flex flex-col gap-2 pl-5" style={{ color: "var(--ink)", listStyleType: "decimal", fontSize: "13.5px", lineHeight: "21px" }}>
            {s.claudeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>
              <span style={{ color: "var(--meta)" }}>{s.claudeTip}</span>
            </li>
          </ol>

          <p
            className="px-3 py-2.5 text-xs"
            style={{ color: "var(--meta)", background: "var(--sidebar-bg)", borderRadius: "var(--radius-tile)" }}
          >
            {s.claudeNote}
          </p>
        </div>
      )}
    </div>
  );
}

// Token wallet card (handover 3.5.4/3.5.5) + top-up price tiles.
// Hidden entirely when the backend kill-switch is off (enabled:false).
function TokensWidget() {
  const s = useStrings();
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
            setToast(s.tokensAdded);
            setTimeout(() => setToast(null), 2400);
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
  const fillColor =
    remainingPct !== null && remainingPct <= 0.05
      ? "var(--request-accent)"
      : "var(--accent)";
  // Top-up is for subscribers only — trial wallets get the subscribe CTA elsewhere.
  const showTopup = !!tokens && !isTrial && packages.length > 0;

  async function buy(pkg: TopupPackage) {
    try {
      await ensurePaddle();
      openCheckout(pkg.paddlePriceId);
    } catch {}
  }

  return (
    <div className="card flex flex-col gap-3">
      {toast && (
        <div className="toast" role="status" aria-live="polite"><span>✓</span>{toast}</div>
      )}
      <div className="flex items-baseline justify-between">
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.tokens}</h2>
        {tokens && !isTrial && granted > 0 && (
          <span style={{ fontSize: "12px", color: "var(--meta)" }}>{s.renews(nextRenewalDate())}</span>
        )}
      </div>

      {failed || !tokens ? (
        <p className="text-sm" style={{ color: "var(--meta)" }}>—</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span style={{ font: "600 28px/34px var(--font-system)", letterSpacing: "-0.3px", color: "var(--ink-strong)" }}>
              {fmtTokens(balance!)}
            </span>
            {granted > 0 && (
              <span style={{ font: "400 14px/20px var(--font-system)", color: "var(--meta)" }}>/ {fmtTokens(granted)}</span>
            )}
          </div>

          {granted > 0 && (
            <div className="w-full overflow-hidden" style={{ height: "6px", borderRadius: "3px", background: "var(--skeleton)" }}>
              <div
                className="h-full"
                style={{
                  width: `${Math.round((remainingPct ?? 0) * 100)}%`,
                  borderRadius: "3px",
                  background: fillColor,
                  transition: "width 0.4s",
                }}
              />
            </div>
          )}

          {isTrial && (
            <p className="text-xs" style={{ color: "var(--meta)" }}>{s.trialBalance}</p>
          )}

          {showTopup && (
            <div className="mt-2 flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--skeleton)" }}>
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink-soft)" }}>{s.addTokens}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {packages.map((pkg) => {
                  const price = priceFromLabel(pkg.label);
                  return (
                    <button key={pkg.id} type="button" onClick={() => buy(pkg)} className="tile">
                      <span className="amt">
                        {fmtTokens(pkg.tokens)}
                        <small>{pkg.label.replace(/\s*[—\-·|].*$/, "").replace(/^[\d,.\s]+/, "").trim() || pkg.label}</small>
                      </span>
                      {price && <b>{price}</b>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubscriptionBadge({ profile }: { profile: Profile }) {
  const s = useStrings();
  const { subscription_status, subscription_tier, trial_ends_at, current_period_ends_at } = profile;

  const panel = (dotColor: string, title: string, titleColor: string, body?: string | null, bg?: string) => (
    <div style={{ background: bg ?? "var(--accent-tint)", borderRadius: "var(--radius-tile)", padding: "12px 14px" }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        <span style={{ font: "600 13.5px/20px var(--font-system)", color: titleColor }}>{title}</span>
      </div>
      {body && <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--ink-2)", marginTop: "4px" }}>{body}</p>}
    </div>
  );

  if (subscription_status === "trialing" && trial_ends_at) {
    const days = daysUntil(trial_ends_at);
    return panel(
      "var(--accent)",
      s.trialLabel(TIER_LABELS[subscription_tier]),
      "var(--accent-strong)",
      `${s.daysLeft(days)} · ${s.autoCharge(fmt(trial_ends_at))}`
    );
  }

  if (subscription_status === "active") {
    return panel(
      "var(--accent)",
      s.activeLabel(TIER_LABELS[subscription_tier]),
      "var(--accent-strong)",
      current_period_ends_at ? s.nextPayment(fmt(current_period_ends_at)) : null
    );
  }

  if (subscription_status === "past_due") {
    return panel("var(--danger)", s.paymentIssue, "var(--danger)", s.paymentFailedBody, "var(--terra-tint)");
  }

  if (subscription_status === "canceled" && current_period_ends_at) {
    return panel(
      "var(--request-accent)",
      s.canceled,
      "var(--request-accent)",
      s.continuesUntil(TIER_LABELS[subscription_tier], fmt(current_period_ends_at)),
      "var(--request-tint)"
    );
  }

  return panel("var(--meta)", s.freePlan, "var(--ink)", s.tapChoose, "var(--sidebar-bg)");
}

export default function ProfilePage() {
  const s = useStrings();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortal, setShowPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ success: boolean; data: Profile }>("/profile")
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : s.genericError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setError(s.portalError);
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
      <div className="min-h-screen flex flex-col gap-3 px-6 py-10 mx-auto" style={{ background: "var(--bg)", maxWidth: "620px" }}>
        <span className="sk-bar" style={{ width: "40%", height: 22 }} />
        <span className="sk-bar" style={{ width: "100%", height: 90, borderRadius: "var(--radius-card)" }} />
        <span className="sk-bar" style={{ width: "100%", height: 140, borderRadius: "var(--radius-card)" }} />
        <span className="sk-bar" style={{ width: "100%", height: 90, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div
        className="profile-col mx-auto flex flex-col"
        style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/chat"
            className="transition-colors"
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}
          >
            {s.backChat}
          </Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>
            {s.title}
          </span>
        </div>

        {error && (
          <div
            className="px-4 py-3 text-sm"
            style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}
          >
            {error}
          </div>
        )}

        {profile && (
          <div className="flex flex-col gap-3.5">
            {/* User card */}
            <div className="card">
              <div className="flex items-center gap-4">
                <div className="initial-avatar" style={{ width: 48, height: 48, fontSize: "18px" }}>
                  {profile.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink)" }}>
                    {profile.name}
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--ink-soft)" }}>
                    {groupPhone(profile.phone)}
                  </p>
                </div>
              </div>
            </div>

            {/* Invite friends (referral share) */}
            <InviteFriendsCard phone={profile.phone} />

            {/* Token wallet */}
            <TokensWidget />

            {/* Referral earnings */}
            <Link
              href="/profile/earnings"
              className="card flex items-center justify-between transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cta-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sidebar-border)"; }}
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.earnings}</h2>
                <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                  {s.earningsSub}
                </p>
              </div>
              <span style={{ color: "var(--meta)" }}>→</span>
            </Link>

            {/* Netai in Claude (MCP connector guide) */}
            <AllyInClaudeCard />

            {/* Subscription card */}
            <div className="card flex flex-col gap-4">
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                {s.subscription}
              </h2>

              <SubscriptionBadge profile={profile} />

              {isFreeOrInactive ? (
                <Link href="/pricing" className="btn-primary w-full">
                  {s.choosePlan}
                </Link>
              ) : showPortal ? (
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className="btn-secondary w-full disabled:opacity-60"
                >
                  {portalLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--cta-border)", borderTopColor: "var(--accent-strong)" }} />
                  ) : (
                    s.manageSub
                  )}
                </button>
              ) : null}
            </div>

            {/* Sign out */}
            <button onClick={signOut} className="btn-destructive py-2 text-center self-center">
              {s.signOut}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
