"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/deviceId";
import { getLocale } from "@/lib/i18n";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Screen-local strings (phone locale: ka → Georgian, else English).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    backProfile: "← Profile",
    title: "My earnings",
    totalEarned: (v: string) => `Total earned: ${v} — share your number to start.`,
    buyTokens: "Buy tokens",
    buySub: "Buy a subscription",
    perMonth: "1 month",
    withdraw: "Withdraw",
    withdrawFrom: (v: string) => `Withdrawals available from ${v}`,
    withdrawSoon: "Withdrawals are coming soon",
    history: "History",
    noActivity: "No activity yet",
    noActivitySub: "Invites you share and payouts will appear here.",
    loadError: "Couldn't load your earnings. Try again later.",
    insufficient: "Insufficient balance",
    refreshing: "Something went wrong — refreshing",
    genericError: "Something went wrong",
    tokensAdded: (n: string) => `+${n} tokens added`,
    subActivated: (name: string) => `${name} activated for 1 month`,
    confirmTokens: (price: string, n: string) => `${price} will be deducted from your balance and ${n} tokens will be added.`,
    confirmSub: (price: string, name: string) => `${price} will be deducted from your balance and 1 month of ${name} will be activated (no auto-renewal).`,
    cancel: "Cancel",
    confirm: "Confirm",
    earn: (level: string) => `Referral earnings${level}`,
    level: (n: number) => ` (level ${n})`,
    tokenPurchase: "Token purchase",
    subPurchase: "Subscription purchase",
    withdrawal: "Withdrawal",
    transaction: "Transaction",
  },
  ka: {
    backProfile: "← პროფილი",
    title: "ჩემი შემოსავალი",
    totalEarned: (v: string) => `ჯამური შემოსავალი: ${v}. გააზიარე შენი ნომერი დასაწყებად.`,
    buyTokens: "ტოკენების ყიდვა",
    buySub: "გამოწერის ყიდვა",
    perMonth: "1 თვე",
    withdraw: "განაღდება",
    withdrawFrom: (v: string) => `განაღდება შესაძლებელია ${v}-დან`,
    withdrawSoon: "განაღდება მალე დაემატება",
    history: "ისტორია",
    noActivity: "აქტივობა ჯერ არ არის",
    noActivitySub: "შენი მოსაწვევები და განაღდებები აქ გამოჩნდება.",
    loadError: "შემოსავალი ვერ ჩაიტვირთა. სცადე მოგვიანებით.",
    insufficient: "არასაკმარისი ბალანსი",
    refreshing: "რაღაც შეცდომა მოხდა, ვაახლებ",
    genericError: "რაღაც შეცდომა მოხდა",
    tokensAdded: (n: string) => `+${n} ტოკენი დაემატა`,
    subActivated: (name: string) => `${name} გააქტიურდა 1 თვით`,
    confirmTokens: (price: string, n: string) => `ბალანსიდან ჩამოგეჭრება ${price} და დაგემატება ${n} ტოკენი.`,
    confirmSub: (price: string, name: string) => `ბალანსიდან ჩამოგეჭრება ${price} და გააქტიურდება ${name} 1 თვით (ავტომატური განახლების გარეშე).`,
    cancel: "გაუქმება",
    confirm: "დადასტურება",
    earn: (level: string) => `რეფერალური შემოსავალი${level}`,
    level: (n: number) => ` (დონე ${n})`,
    tokenPurchase: "ტოკენების ყიდვა",
    subPurchase: "გამოწერის ყიდვა",
    withdrawal: "განაღდება",
    transaction: "ტრანზაქცია",
  },
};

type HistoryItem = {
  amountUsd: number;
  reason: string;
  level: number | null;
  createdAt: string;
};

type Referral = {
  balanceUsd: number;
  totalEarnedUsd: number;
  minWithdrawalUsd: number;
  canWithdraw: boolean;
  history: HistoryItem[];
};

type TopupPackage = {
  id: number;
  paddlePriceId?: string;
  tokens: number;
  label: string;
  priceUsd?: number;
};

type SubTier = { tier: "pro" | "enterprise"; name: string; priceUsd: number };
const SUB_TIERS: SubTier[] = [
  { tier: "pro", name: "Pro", priceUsd: 19.99 },
  { tier: "enterprise", name: "Enterprise", priceUsd: 79 },
];

function usd(n: number): string {
  return `$${Math.abs(n).toFixed(2)}`;
}

function fmtTokens(n: number): string {
  return Number(n).toLocaleString("en-US");
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Strip a trailing price from a package label so the price renders exactly
// once per row (handover 3.6.4): amount left, price right.
function amountFromLabel(label: string): string {
  return label.replace(/\s*[—\-·|]?\s*\$[\d.,]+\s*$/, "").trim() || label;
}

type Confirm =
  | { kind: "tokens"; pkg: TopupPackage }
  | { kind: "sub"; sub: SubTier }
  | null;

export default function EarningsPage() {
  const s = L[getLocale()];
  const [data, setData] = useState<Referral | null>(null);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  function showToast(msg: string, ok: boolean = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 2400);
  }

  const loadReferral = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/billing/referral`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (json?.data) setData(json.data as Referral);
    return json?.data as Referral | undefined;
  }, []);

  const loadPackages = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
  }, []);

  useEffect(() => {
    Promise.all([loadReferral(), loadPackages()])
      .then(([ref]) => {
        if (!ref) setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [loadReferral, loadPackages]);

  function historyLabel(item: HistoryItem): string {
    switch (item.reason) {
      case "earn":
        return s.earn(item.level != null ? s.level(item.level) : "");
      case "spend_tokens":
        return s.tokenPurchase;
      case "spend_subscription":
        return s.subPurchase;
      case "withdrawal":
        return s.withdrawal;
      default:
        return s.transaction; // new backend reasons render neutrally
    }
  }

  // Shared spend handler. Branches on the response `reason` code (not the error
  // text — texts may change). Buttons stay disabled while the request runs.
  async function spend(path: string, body: object, successMsg: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 402 && json.reason === "insufficient_balance") {
        showToast(s.insufficient, false);
        await loadReferral();
        return;
      }
      if (res.status === 404 && (json.reason === "unknown_package" || json.reason === "unknown_tier")) {
        showToast(s.refreshing, false);
        await Promise.all([loadReferral(), loadPackages()]);
        return;
      }
      if (!res.ok || json.success === false) {
        showToast(json.error ?? s.genericError, false);
        return;
      }
      showToast(successMsg);
      await loadReferral();
      // Wallet/subscription state changed server-side — refresh the token balance
      // quietly so the chat chip and profile widget are correct on next view.
      fetch(`${BASE_URL}/billing/tokens`, { headers: authHeaders() }).catch(() => {});
    } catch {
      showToast(s.genericError, false);
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const balance = data?.balanceUsd ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast.ok && <span>✓</span>}
          {toast.msg}
        </div>
      )}

      <div
        className="profile-col mx-auto flex flex-col"
        style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}
      >
        <div className="flex items-center gap-3 mb-3">
          <Link href="/profile" className="transition-colors" style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}>
            {s.backProfile}
          </Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</span>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            <span className="sk-bar" style={{ width: "100%", height: 96, borderRadius: "var(--radius-card)" }} />
            <span className="sk-bar" style={{ width: "100%", height: 160, borderRadius: "var(--radius-card)" }} />
            <span className="sk-bar" style={{ width: "100%", height: 96, borderRadius: "var(--radius-card)" }} />
          </div>
        ) : error || !data ? (
          <div className="card p-8 text-center text-sm" style={{ color: "var(--meta)" }}>
            {s.loadError}
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="card flex items-center justify-between gap-3">
              <div>
                <p style={{ font: "600 30px/36px var(--font-system)", color: "var(--ink-strong)" }}>{usd(balance)}</p>
                <p className="mt-1" style={{ fontSize: "13px", color: "var(--ink-soft)" }}>
                  {s.totalEarned(usd(data.totalEarnedUsd))}
                </p>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/ally/think.jpg"
                alt=""
                style={{ width: 84, mixBlendMode: "multiply", flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>

            {/* Spend: tokens — price rendered exactly once per row */}
            {packages.length > 0 && (
              <div className="card flex flex-col gap-3">
                <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.buyTokens}</h2>
                <div className="flex flex-col gap-2">
                  {packages.map((pkg) => {
                    const price = pkg.priceUsd ?? Infinity;
                    const affordable = balance >= price;
                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        disabled={!affordable || busy}
                        onClick={() => setConfirm({ kind: "tokens", pkg })}
                        className="price-row disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>{amountFromLabel(pkg.label)}</span>
                        {pkg.priceUsd != null && <b>{usd(pkg.priceUsd)}</b>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Spend: subscription */}
            <div className="card flex flex-col gap-3">
              <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.buySub}</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {SUB_TIERS.map((tier) => {
                  const affordable = balance >= tier.priceUsd;
                  return (
                    <button
                      key={tier.tier}
                      type="button"
                      disabled={!affordable || busy}
                      onClick={() => setConfirm({ kind: "sub", sub: tier })}
                      className="tile disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{tier.name}</p>
                      <p style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{usd(tier.priceUsd)} · {s.perMonth}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Withdraw — placeholder until the payout flow ships */}
            <div className="card flex flex-col gap-2">
              <button
                type="button"
                disabled={!data.canWithdraw}
                onClick={() => showToast(s.withdrawSoon, false)}
                className="btn-primary w-full"
              >
                {s.withdraw}
              </button>
              {!data.canWithdraw && (
                <p className="text-center" style={{ fontSize: "12px", color: "var(--meta)" }}>
                  {s.withdrawFrom(usd(data.minWithdrawalUsd))}
                </p>
              )}
            </div>

            {/* History */}
            <div className="card flex flex-col gap-1">
              <h2 className="mb-2" style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.history}</h2>
              {data.history.length === 0 ? (
                <div className="py-4 text-center">
                  <p style={{ fontSize: "13px", color: "var(--meta)" }}>{s.noActivity}</p>
                  <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.noActivitySub}</p>
                </div>
              ) : (
                data.history.map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2.5"
                    style={{ borderBottom: i === data.history.length - 1 ? "none" : "1px solid var(--skeleton)" }}
                  >
                    <div>
                      <p style={{ fontSize: "14px", color: "var(--ink)" }}>{historyLabel(item)}</p>
                      <p style={{ fontSize: "12px", color: "var(--meta)" }}>{fmtDate(item.createdAt)}</p>
                    </div>
                    <span
                      style={{
                        fontSize: "14px",
                        fontWeight: 600,
                        color: item.amountUsd >= 0 ? "var(--accent-strong)" : "var(--danger)",
                      }}
                    >
                      {item.amountUsd >= 0 ? "+" : "−"}{usd(item.amountUsd)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Confirm dialog */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(18,21,16,0.32)" }}>
          <div className="card w-full max-w-sm flex flex-col gap-4" style={{ boxShadow: "var(--shadow-pop)" }}>
            <p style={{ font: "400 14px/22px var(--font-system)", color: "var(--ink)" }}>
              {confirm.kind === "tokens"
                ? s.confirmTokens(confirm.pkg.priceUsd != null ? usd(confirm.pkg.priceUsd) : "", fmtTokens(confirm.pkg.tokens))
                : s.confirmSub(usd(confirm.sub.priceUsd), confirm.sub.name)}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="btn-secondary disabled:opacity-50"
              >
                {s.cancel}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirm.kind === "tokens"
                    ? spend("/billing/referral/spend-tokens", { packageId: confirm.pkg.id }, s.tokensAdded(fmtTokens(confirm.pkg.tokens)))
                    : spend("/billing/referral/spend-subscription", { tier: confirm.sub.tier }, s.subActivated(confirm.sub.name))
                }
                className="btn-primary disabled:opacity-60"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  s.confirm
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
