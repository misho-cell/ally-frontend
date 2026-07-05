"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/deviceId";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function historyLabel(item: HistoryItem): string {
  switch (item.reason) {
    case "earn":
      return `Referral earnings${item.level != null ? ` (level ${item.level})` : ""}`;
    case "spend_tokens":
      return "Token purchase";
    case "spend_subscription":
      return "Subscription purchase";
    case "withdrawal":
      return "Withdrawal";
    default:
      return "Transaction"; // new backend reasons render neutrally
  }
}

type Confirm =
  | { kind: "tokens"; pkg: TopupPackage }
  | { kind: "sub"; sub: SubTier }
  | null;

export default function EarningsPage() {
  const [data, setData] = useState<Referral | null>(null);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
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
    Promise.all([
      loadReferral(),
      loadPackages(),
      fetch(`${BASE_URL}/profile`, { headers: authHeaders() })
        .then((r) => r.json())
        .then((j) => setPhone(j?.data?.phone ?? ""))
        .catch(() => {}),
    ])
      .then(([ref]) => {
        if (!ref) setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [loadReferral, loadPackages]);

  async function share() {
    const text = `Sign up for Ally and enter my number in the invite field: ${phone}`;
    try {
      if (navigator.share) {
        await navigator.share({ text });
      } else {
        await navigator.clipboard.writeText(text);
        showToast("Copied to clipboard");
      }
    } catch {}
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
        showToast("Insufficient balance");
        await loadReferral();
        return;
      }
      if (res.status === 404 && (json.reason === "unknown_package" || json.reason === "unknown_tier")) {
        showToast("Something went wrong — refreshing");
        await Promise.all([loadReferral(), loadPackages()]);
        return;
      }
      if (!res.ok || json.success === false) {
        showToast(json.error ?? "Something went wrong");
        return;
      }
      showToast(successMsg);
      await loadReferral();
      // Wallet/subscription state changed server-side — refresh the token balance
      // quietly so the chat chip and profile widget are correct on next view.
      fetch(`${BASE_URL}/billing/tokens`, { headers: authHeaders() }).catch(() => {});
    } catch {
      showToast("Something went wrong");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const balance = data?.balanceUsd ?? 0;

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg)" }}>
      {toast && (
        <div
          style={{
            position: "fixed", bottom: "40px", left: "50%", transform: "translateX(-50%)",
            background: "rgba(23,22,19,0.88)", color: "white", borderRadius: "12px",
            padding: "10px 18px", fontSize: "13.5px", zIndex: 9999, maxWidth: "90%",
            textAlign: "center", pointerEvents: "none",
          }}
        >
          {toast}
        </div>
      )}

      <div className="mx-auto max-w-md flex flex-col gap-4">
        <div className="flex items-center gap-3 mb-4">
          <Link href="/profile" className="text-sm transition-colors" style={{ color: "var(--meta)" }}>
            ← Profile
          </Link>
          <span className="text-xl font-semibold" style={{ color: "var(--ink)" }}>My earnings</span>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#E4E0D3] border-t-[#3E7A56]" />
          </div>
        ) : error || !data ? (
          <div className="rounded-2xl border border-[#E4E0D3] bg-white p-8 text-center text-sm" style={{ color: "var(--meta)" }}>
            Couldn&apos;t load your earnings. Pull to refresh or try again later.
          </div>
        ) : (
          <>
            {/* Balance */}
            <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6">
              <p className="text-4xl font-bold" style={{ color: "var(--ink)" }}>{usd(balance)}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--meta)" }}>
                Total earned: {usd(data.totalEarnedUsd)}
              </p>
            </div>

            {/* How to earn + share */}
            <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6 flex flex-col gap-3">
              <h2 className="font-semibold" style={{ color: "var(--ink)" }}>How do I earn?</h2>
              <p className="text-sm" style={{ color: "var(--meta)" }}>
                Invite friends: when they sign up, they enter your number in the invite
                field. You earn a share of their first subscription — and of
                subscriptions from the people they invite, up to 6 levels deep.
              </p>
              <button
                type="button"
                onClick={share}
                className="self-start rounded-xl bg-[#3E7A56] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Share my number
              </button>
            </div>

            {/* Spend: tokens */}
            {packages.length > 0 && (
              <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6 flex flex-col gap-3">
                <h2 className="font-semibold" style={{ color: "var(--ink)" }}>Buy tokens</h2>
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
                        className="flex items-center justify-between rounded-xl border border-[#C7D6C9] bg-white px-4 py-3 text-sm font-medium text-[#23261F] transition-colors hover:bg-[#F7F9F7] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <span>{pkg.label}</span>
                        {pkg.priceUsd != null && <span style={{ color: "var(--meta)" }}>{usd(pkg.priceUsd)}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Spend: subscription */}
            <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6 flex flex-col gap-3">
              <h2 className="font-semibold" style={{ color: "var(--ink)" }}>Buy a subscription</h2>
              <div className="flex flex-col gap-2 sm:flex-row">
                {SUB_TIERS.map((s) => {
                  const affordable = balance >= s.priceUsd;
                  return (
                    <button
                      key={s.tier}
                      type="button"
                      disabled={!affordable || busy}
                      onClick={() => setConfirm({ kind: "sub", sub: s })}
                      className="flex-1 rounded-xl border border-[#C7D6C9] bg-white px-4 py-3 text-left transition-colors hover:bg-[#F7F9F7] disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-semibold text-[#23261F]">{s.name}</p>
                      <p className="text-xs" style={{ color: "var(--meta)" }}>{usd(s.priceUsd)} · 1 month</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Withdraw — placeholder until the payout flow ships */}
            <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6 flex flex-col gap-2">
              <button
                type="button"
                disabled={!data.canWithdraw}
                onClick={() => showToast("Withdrawals are coming soon")}
                className="rounded-xl border border-[#E4E0D3] px-4 py-3 text-sm font-semibold text-[#23261F] transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Withdraw
              </button>
              {!data.canWithdraw && (
                <p className="text-xs" style={{ color: "var(--meta)" }}>
                  Withdrawals available from {usd(data.minWithdrawalUsd)}
                </p>
              )}
            </div>

            {/* History */}
            <div className="rounded-2xl border border-[#E4E0D3] bg-white p-6 flex flex-col gap-1">
              <h2 className="mb-2 font-semibold" style={{ color: "var(--ink)" }}>History</h2>
              {data.history.length === 0 ? (
                <p className="py-4 text-center text-sm" style={{ color: "var(--meta)" }}>No activity yet</p>
              ) : (
                data.history.map((item, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-[#F1F0EA] py-2.5 last:border-b-0">
                    <div>
                      <p className="text-sm" style={{ color: "var(--ink)" }}>{historyLabel(item)}</p>
                      <p className="text-xs" style={{ color: "var(--meta)" }}>{fmtDate(item.createdAt)}</p>
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{ color: item.amountUsd >= 0 ? "#3E7A56" : "#dc2626" }}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 flex flex-col gap-4">
            <p className="text-sm leading-relaxed" style={{ color: "var(--ink)" }}>
              {confirm.kind === "tokens"
                ? `${confirm.pkg.priceUsd != null ? usd(confirm.pkg.priceUsd) : ""} will be deducted from your balance and ${confirm.pkg.tokens} tokens will be added.`
                : `${usd(confirm.sub.priceUsd)} will be deducted from your balance and 1 month of ${confirm.sub.name} will be activated (no auto-renewal).`}
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirm(null)}
                className="rounded-xl border border-[#E4E0D3] px-5 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  confirm.kind === "tokens"
                    ? spend("/billing/referral/spend-tokens", { packageId: confirm.pkg.id }, `+${confirm.pkg.tokens} tokens added`)
                    : spend("/billing/referral/spend-subscription", { tier: confirm.sub.tier }, `${confirm.sub.name} activated for 1 month`)
                }
                className="flex items-center justify-center rounded-xl bg-[#3E7A56] px-5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
