"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { authHeaders } from "@/lib/deviceId";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import ReferralRewardsCard from "@/components/ReferralRewardsCard";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Screen-local strings (phone locale: ka → Georgian, else English).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    backProfile: "← Profile",
    title: "My earnings",
    totalEarned: (v: string) => `Total earned: ${v} — share your referral code to start.`,
    onHold: (v: string, days: number) => `${v} more will become available within ${days} days.`,
    availableFrom: (d: string, days: number | null) =>
      days != null ? `On hold, available from ${d} (${days}-day refund window)` : `On hold, available from ${d}`,
    buyTokens: "Buy tokens",
    // Row 318 (approved by Misho, 4 Oct). Somebody buying tokens could see
    // three prices and no way to judge them: the screen never said what a
    // token is worth or what happens to the ones a subscription grants.
    //
    // The ranges are measured (1,241 answers over 7 days: a tenth at 7 or
    // under, half at 17 or under, nine in ten at 28 or under, dearest 65), so
    // "about 10 to 30" is a true summary rather than a round number.
    //
    // Deliberately no grant size and no price: those are settings Misho
    // changes, and copy that repeats a number the server owns goes wrong
    // silently. The prices beneath come from the server; the day does not.
    tokensWhat: "A token is what one question costs. An ordinary question is about 10 to 30 tokens, a longer search more, so 500 tokens is roughly 25 to 50 questions.",
    tokensWeekly: "A subscription adds new tokens every Monday. Granted tokens you did not use expire then. Tokens you buy stay, and they do not expire.",
    // Row 318, added 4 Oct on Misho's word. At zero the server still answers
    // once a week and refuses after that. Somebody who hit zero got one
    // answer and then a refusal with nothing on screen explaining either, so
    // the rule looked like the app breaking rather than the rule it is.
    tokensZero: "At zero you still get one answer a week. After that a new question waits for Monday or for tokens you buy.",
    buySub: "Buy a subscription",
    perMonth: "1 month",
    withdraw: "Withdraw",
    withdrawFrom: (v: string) => `Withdrawals available from ${v}`,
    withdrawSoon: "Withdrawals are coming soon",
    // #503 (2 Oct, Ninia). The balance said what the invites were worth and
    // never who they were. Only people who actually registered appear: an
    // invitation nobody opened has no person to name, and listing it as
    // somebody would be inventing one.
    invited: "Who I invited",
    invitedEmpty: "Nobody has joined through your link yet.",
    invitedError: "Couldn't load the list. Try again later.",
    stRegistered: "Registered",
    stTrial: "On trial",
    stPaid: "Paying",
    noName: "Name not given",
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
    // #508: "level 3" is the same jargon the rewards text used, in the row
    // that shows the money arriving. The chain is counted in steps now, in
    // both places, so the line and the explanation agree.
    level: (n: number) => ` (step ${n})`,
    tokenPurchase: "Token purchase",
    subPurchase: "Subscription purchase",
    withdrawal: "Withdrawal",
    transaction: "Transaction",
  },
  ka: {
    backProfile: "← პროფილი",
    title: "ჩემი შემოსავალი",
    totalEarned: (v: string) => `ჯამური შემოსავალი: ${v}. გააზიარე შენი მოსაწვევი კოდი დასაწყებად.`,
    // D674 / D677, wording approved by Misho on 6 Oct. Both numbers are the
    // server's (`onHoldUsd`, `holdDays`); neither is ever written here.
    onHold: (v: string, days: number) => `კიდევ ${v} ხელმისაწვდომი გახდება ${days} დღის განმავლობაში.`,
    // 7 Oct, Misho's wording. The dash in his text is a comma here, by the
    // house rule for Georgian copy. The day count is the server's `holdDays`;
    // without it the bracket is left out rather than guessed.
    availableFrom: (d: string, days: number | null) =>
      days != null
        ? `დაკავებულია, ხელმისაწვდომი იქნება ${d}-დან (ანაზღაურების ${days} დღე)`
        : `დაკავებულია, ხელმისაწვდომი იქნება ${d}-დან`,
    buyTokens: "ტოკენების ყიდვა",
    tokensWhat: "ტოკენი ერთი კითხვის ფასია. ჩვეულებრივი კითხვა დაახლოებით 10-დან 30 ტოკენამდეა, გრძელი ძებნა მეტი, ანუ 500 ტოკენი დაახლოებით 25-დან 50 კითხვამდეა.",
    tokensWeekly: "გამოწერას ყოველ ორშაბათს ახალი ტოკენები ემატება. გაუხარჯავი ტოკენები მაშინ ამოიწურება. ნაყიდ ტოკენებს კი ვადა არ გასდის და რჩება.",
    tokensZero: "ნულზეც კვირაში ერთ პასუხს მაინც მიიღებ. მერე ახალი კითხვა ორშაბათს დაგელოდება, ან სანამ ტოკენებს შეიძენ.",
    buySub: "გამოწერის ყიდვა",
    perMonth: "1 თვე",
    withdraw: "განაღდება",
    withdrawFrom: (v: string) => `განაღდება შესაძლებელია ${v}-დან`,
    withdrawSoon: "განაღდება მალე დაემატება",
    invited: "ვინ მოვიწვიე",
    invitedEmpty: "შენი ბმულით ჯერ არავინ შემოსულა.",
    invitedError: "სია ვერ ჩაიტვირთა. სცადე მოგვიანებით.",
    stRegistered: "დარეგისტრირდა",
    stTrial: "საცდელ პერიოდზეა",
    stPaid: "იხდის",
    noName: "სახელი არ მიუთითებია",
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
    // Georgian ordinals are not a suffix you can append: the first is
    // „1-ლი" and the rest take „მე-". The same two forms the admin screens
    // already use, so the app counts the same way everywhere.
    level: (n: number) => (n === 1 ? " (1-ლი ნაბიჯი)" : ` (მე-${n} ნაბიჯი)`),
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
  // D694. Present only on a reward still on hold: the moment it can be spent.
  // Absent means nothing is held on this row, so no line is drawn.
  availableFrom?: string;
};

type Referral = {
  balanceUsd: number;
  // D674 (5 Oct). A reward can be refunded away for its first `holdDays`, so
  // only `availableUsd` can be spent or withdrawn; the server enforces it.
  // Optional: a deployment from before D674 sends none of the three.
  availableUsd?: number;
  onHoldUsd?: number;
  holdDays?: number;
  totalEarnedUsd: number;
  minWithdrawalUsd: number;
  canWithdraw: boolean;
  history: HistoryItem[];
};

// #503: `name` may be null — somebody can register without giving one, and
// the list must say that rather than leave a blank row that reads as a bug.
type Invited = { name?: string | null; joined_at?: string | null; state?: string | null };

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
  const [referralCode, setReferralCode] = useState<string | null>(null);
  // #503: null means not loaded or the route is absent on this deployment;
  // an empty array means the server answered and nobody has joined. The
  // screen says different things for those two, because "we could not ask"
  // is not "nobody came".
  const [invited, setInvited] = useState<Invited[] | null>(null);
  // 5 Oct: #503 came back as "no list" from a phone. The card used to vanish
  // when the request failed, which reads exactly like a list that was never
  // built. The route is live everywhere now, so a failure is a failure and
  // says so.
  const [invitedFailed, setInvitedFailed] = useState(false);
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

  const loadInvited = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/billing/referral/invited`, { headers: authHeaders() });
      if (!res.ok) { setInvitedFailed(true); return; }
      const json = await res.json().catch(() => ({}));
      const rows = json?.data?.invited ?? json?.invited;
      if (Array.isArray(rows)) setInvited(rows as Invited[]);
      else setInvitedFailed(true);
    } catch {
      setInvitedFailed(true);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() });
    const json = await res.json().catch(() => ({}));
    if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
  }, []);

  // Referral code for the rewards card (ticket 6 #5) — comes with the profile.
  const loadCode = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/profile`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      const code = json?.data?.referral_code;
      if (typeof code === "string" && code) setReferralCode(code);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([loadReferral(), loadPackages(), loadCode(), loadInvited()])
      .then(([ref]) => {
        if (!ref) setError(true);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [loadReferral, loadPackages, loadCode, loadInvited]);

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

  // The big number is what the owner can spend, because a spend above it is
  // refused (D674). `balanceUsd` also counts rewards still on hold; it is the
  // fallback only when the server sends no `availableUsd` at all, which is
  // not the same thing as sending 0.
  const balance = data?.availableUsd ?? data?.balanceUsd ?? 0;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast.ok && <span style={{ marginRight: 4 }}>✓</span>}
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
                {/* Only when the server says something is held and for how
                    long. No hold and an absent field are both "say nothing",
                    because there is nothing true to say about either. */}
                {(data.onHoldUsd ?? 0) > 0 && data.holdDays != null && (
                  <p className="mt-1" style={{ fontSize: "13px", color: "var(--ink-soft)" }}>
                    {s.onHold(usd(data.onHoldUsd ?? 0), data.holdDays)}
                  </p>
                )}
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/ally/think.jpg"
                alt=""
                style={{ width: 84, mixBlendMode: "multiply", flexShrink: 0 }}
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </div>

            {/* Spend: tokens — always tappable (ticket 6 #6); the server answers
                402/insufficient_balance and the toast explains. */}
            {packages.length > 0 && (
              <div className="card flex flex-col gap-3">
                <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.buyTokens}</h2>
                {/* Row 318: above the prices, not below. A person reads the
                    price first and decides there, so an explanation underneath
                    arrives after the decision it was written for. */}
                <p style={{ font: "400 13px/20px var(--font-system)", color: "var(--ink-2)" }}>{s.tokensWhat}</p>
                <p style={{ font: "400 13px/20px var(--font-system)", color: "var(--ink-soft)" }}>{s.tokensWeekly}</p>
                <p style={{ font: "400 13px/20px var(--font-system)", color: "var(--ink-soft)" }}>{s.tokensZero}</p>
                <div className="flex flex-col gap-2">
                  {packages.map((pkg) => (
                    <button
                      key={pkg.id}
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirm({ kind: "tokens", pkg })}
                      className="price-row disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span>{amountFromLabel(pkg.label)}</span>
                      {pkg.priceUsd != null && <b>{usd(pkg.priceUsd)}</b>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Spend: subscription */}
            <div className="card flex flex-col gap-3">
              <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.buySub}</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {SUB_TIERS.map((tier) => (
                  <button
                    key={tier.tier}
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ kind: "sub", sub: tier })}
                    className="tile disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <p style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{tier.name}</p>
                    <p style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{usd(tier.priceUsd)} · {s.perMonth}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Referral rewards + code (ticket 6 #5) — above Withdraw */}
            <ReferralRewardsCard code={referralCode} />

            {/* #503 (Ninia). The balance said what the invitations were worth
                and never who they were. Shown only once the server has
                answered: a deployment without the route, and an owner nobody
                has joined through, are different facts, and an empty card
                under "who I invited" would claim the second when it is the
                first. */}
            {invited === null && invitedFailed && (
              <div className="card flex flex-col gap-2">
                <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.invited}</h2>
                <p style={{ fontSize: "12.5px", color: "var(--meta)" }}>{s.invitedError}</p>
              </div>
            )}
            {invited !== null && (
              <div className="card flex flex-col gap-2">
                <h2 style={{ fontSize: "14.5px", fontWeight: 600, color: "var(--ink)" }}>{s.invited}</h2>
                {invited.length === 0 ? (
                  <p style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{s.invitedEmpty}</p>
                ) : (
                  invited.map((p, i) => (
                    <div key={`${p.name ?? ""}-${p.joined_at ?? ""}-${i}`} className="flex items-center gap-2">
                      <span style={{ fontSize: "13.5px", color: p.name ? "var(--ink)" : "var(--meta)" }}>
                        {p.name?.trim() ? p.name : s.noName}
                      </span>
                      {/* The state is the whole point of the list: an invite
                          that registered and one that pays are worth
                          different things to the person reading it. */}
                      <span
                        className="rounded-full px-2 py-0.5"
                        style={{
                          fontSize: "11px",
                          fontWeight: 600,
                          background: p.state === "paid" ? "var(--accent-tint)" : "var(--sidebar-bg)",
                          color: p.state === "paid" ? "var(--accent-strong)" : "var(--ink-2)",
                        }}
                      >
                        {p.state === "paid" ? s.stPaid : p.state === "trial" ? s.stTrial : s.stRegistered}
                      </span>
                      {p.joined_at && (
                        <span className="ml-auto" style={{ fontSize: "11.5px", color: "var(--meta)" }}>
                          {fmtDateLoc(p.joined_at)}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Withdraw — the ONLY button gated on balance (ticket 6 #6) */}
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
                      <p style={{ fontSize: "12px", color: "var(--meta)" }}>{fmtDateLoc(item.createdAt, { month: "short", day: "numeric", year: "numeric" })}</p>
                      {item.availableFrom && fmtDateLoc(item.availableFrom) && (
                        <p style={{ fontSize: "12px", color: "var(--meta)" }}>
                          {s.availableFrom(fmtDateLoc(item.availableFrom, { month: "short", day: "numeric", year: "numeric" }), data.holdDays ?? null)}
                        </p>
                      )}
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
