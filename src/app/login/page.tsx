"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getLocale } from "@/lib/i18n";
import { clearUserScopedStorage } from "@/lib/user";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SMS_COOLDOWN = 30;

// Country dial codes for the phone step (D4). Georgia first/default.
// Plain ISO text labels — no emoji in UI (founder rule).
const DIAL_CODES: { code: string; label: string }[] = [
  { code: "+995", label: "GE +995" },
  { code: "+1", label: "US +1" },
  { code: "+44", label: "UK +44" },
  { code: "+49", label: "DE +49" },
  { code: "+33", label: "FR +33" },
  { code: "+34", label: "ES +34" },
  { code: "+39", label: "IT +39" },
  { code: "+31", label: "NL +31" },
  { code: "+48", label: "PL +48" },
  { code: "+7", label: "RU +7" },
  { code: "+90", label: "TR +90" },
  { code: "+380", label: "UA +380" },
  { code: "+371", label: "LV +371" },
  { code: "+374", label: "AM +374" },
  { code: "+994", label: "AZ +994" },
  { code: "+972", label: "IL +972" },
  { code: "+971", label: "AE +971" },
  { code: "+54", label: "AR +54" },
];

// Compose the E.164-ish phone we send: a raw value that already starts with
// '+' wins verbatim (power users / old habit); otherwise dial code + digits.
function composePhone(dial: string, raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[\s\-()]/g, "");
  const digits = trimmed.replace(/\D/g, "").replace(/^0+/, "");
  return `${dial}${digits}`;
}

// Screen-local strings (phone locale: ka → Georgian, else English).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    enterPhone: "Enter your phone number",
    getCode: "Get code",
    wait: (s: number) => `Wait (${s}s)`,
    otpSent: "6-digit code sent to you on WhatsApp",
    verify: "Verify",
    sendSms: (s: number) => `Send via SMS (${s}s)`,
    sendSmsNow: "Didn't get the code — send via SMS",
    smsSent: "Code sent via SMS",
    back: "← Back",
    inviteOnly: "Netai is invite-only",
    inviteOnlyBody: "Enter your friend's invite code or phone number — they must be a Netai subscriber",
    referralPlaceholder: "Code or number (e.g. KC8FC24P)",
    referralNotFound: "This code or number wasn't found or has no active subscription. Try another one",
    continueBtn: "Continue",
    firstTime: "First time here — enter your name",
    namePlaceholder: "Name Surname",
    invitedBy: "Invited by (optional)",
    invitedByPlaceholder: "Friend's code or number",
    signUp: "Sign up",
    genericError: "Something went wrong",
    invalidCode: "Invalid code",
    cantVerify: "Couldn't verify — please try again",
    cantProceed: "Registration couldn't proceed. Please try again later.",
    rateLimited: "Too many requests. Please try again later.",
    pricing: "Pricing",
    terms: "Terms",
    privacy: "Privacy",
    refund: "Refund Policy",
  },
  ka: {
    enterPhone: "შეიყვანე შენი ტელეფონის ნომერი",
    getCode: "კოდის მიღება",
    wait: (s: number) => `მოიცადე (${s}წმ)`,
    otpSent: "6-ნიშნა კოდი გამოგიგზავნეთ WhatsApp-ზე",
    verify: "დადასტურება",
    sendSms: (s: number) => `SMS-ით გაგზავნა (${s}წმ)`,
    sendSmsNow: "კოდი არ მოვიდა? გაგზავნე SMS-ით",
    smsSent: "კოდი გაიგზავნა SMS-ით",
    back: "← უკან",
    inviteOnly: "Netai მხოლოდ მოწვევით შემოდიხარ",
    inviteOnlyBody: "შეიყვანე მეგობრის მოსაწვევი კოდი ან ნომერი. მას უნდა ჰქონდეს Netai-ს აქტიური გამოწერა",
    referralPlaceholder: "კოდი ან ნომერი (მაგ. KC8FC24P)",
    referralNotFound: "ეს კოდი ან ნომერი ვერ მოიძებნა ან აქტიური გამოწერა არ აქვს. სცადე სხვა",
    continueBtn: "გაგრძელება",
    firstTime: "პირველად ხარ აქ? შეიყვანე სახელი",
    namePlaceholder: "სახელი გვარი",
    invitedBy: "ვინ მოგიწვია? (არასავალდებულო)",
    invitedByPlaceholder: "მეგობრის კოდი ან ნომერი",
    signUp: "რეგისტრაცია",
    genericError: "რაღაც შეცდომა მოხდა",
    invalidCode: "არასწორი კოდი",
    cantVerify: "ვერ გადამოწმდა, სცადე თავიდან",
    cantProceed: "რეგისტრაცია ვერ გაგრძელდა. სცადე მოგვიანებით.",
    rateLimited: "ძალიან ბევრი მოთხოვნაა. სცადე მოგვიანებით.",
    pricing: "ფასები",
    terms: "წესები",
    privacy: "კონფიდენციალურობა",
    refund: "თანხის დაბრუნება",
  },
};

type Step = "phone" | "otp" | "referral" | "name";

type PostError = Error & { retryAfter?: number };

type Eligibility = {
  eligible: boolean;
  mode?: string;
  reason?: string;
};

function clearToken() {
  localStorage.removeItem("token");
  document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  // Account switch on the same device: purge everything user-scoped so the
  // next account never inherits the previous one's cached name/read-state
  // (stale-content bug, 18 Aug).
  clearUserScopedStorage();
}

export default function LoginPage() {
  const s = L[getLocale()];
  const [step, setStep] = useState<Step>("phone");
  // What the user types (national digits, usually) + the selected dial code.
  // `phone` is the composed full number actually used by every auth call.
  const [dial, setDial] = useState("+995");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsToast, setSmsToast] = useState<string | null>(null);
  const [smsCooldown, setSmsCooldown] = useState(SMS_COOLDOWN);
  // Invite gate: referral screen state. confirmedReferralRef holds the value
  // (code OR phone) that passed eligibility — it MUST be sent with
  // /auth/register (the server re-checks it there).
  const [referralInput, setReferralInput] = useState("");
  const [referralError, setReferralError] = useState("");
  const confirmedReferralRef = useRef<string | null>(null);
  // Optional referrer on the name step: builds the referral chain in ALL modes
  // (gate off included). No validation — unknown values register fine without
  // a link, and the backend ignores self-referrals.
  const [inviteInput, setInviteInput] = useState("");
  // OTP is single-use: once verify-otp + complete-login succeed we must not
  // re-run them on retry (e.g. when the eligibility call itself failed).
  const otpPassedRef = useRef(false);
  // 429 rate-limit countdown. While > 0, both submit and resend are blocked.
  const [rlSecs, setRlSecs] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rlRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Start countdown when OTP step begins
  useEffect(() => {
    if (step === "otp") {
      setSmsCooldown(SMS_COOLDOWN);
      cooldownRef.current = setInterval(() => {
        setSmsCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    }
    return () => {
      if (cooldownRef.current) clearInterval(cooldownRef.current);
    };
  }, [step]);

  useEffect(() => {
    return () => {
      if (rlRef.current) clearInterval(rlRef.current);
    };
  }, []);

  // Block submit + resend for `secs` seconds (429 Retry-After).
  function startRateLimit(secs: number) {
    setRlSecs(secs);
    if (rlRef.current) clearInterval(rlRef.current);
    rlRef.current = setInterval(() => {
      setRlSecs((prev) => {
        if (prev <= 1) {
          clearInterval(rlRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    // also hold the resend button at least this long
    setSmsCooldown((c) => Math.max(c, secs));
  }

  function showSmsToast(msg: string) {
    setSmsToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setSmsToast(null), 3500);
  }

  function saveToken(token: string) {
    // Always wipe any prior token + user-scoped cache first so a stale
    // admin/other-account session can never resurface.
    clearToken();
    localStorage.setItem("token", token);
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
  }

  function redirectTo(path: string) {
    window.location.href = path;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({})) as {
      success?: boolean;
      error?: string;
      message?: string;
      data?: T;
    } & T;
    if (res.status === 429) {
      const raw = res.headers.get("Retry-After");
      const secs = raw ? parseInt(raw, 10) : NaN;
      const err = new Error(
        json.error ?? json.message ?? s.rateLimited
      ) as PostError;
      err.retryAfter = Number.isFinite(secs) && secs > 0 ? secs : 30;
      throw err;
    }
    if (!res.ok || json.success === false) {
      throw new Error(json.error ?? json.message ?? `Request failed with status ${res.status}`);
    }
    return (json.data ?? json) as T;
  }

  function handleError(err: unknown, fallback: string) {
    const e = err as PostError;
    if (e?.retryAfter) {
      startRateLimit(e.retryAfter);
    }
    setError(e instanceof Error ? e.message : fallback);
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Login start: drop any leftover token (e.g. a stale admin session) before
    // we begin authenticating this phone.
    clearToken();
    otpPassedRef.current = false;
    confirmedReferralRef.current = null;
    setInviteInput("");
    const full = composePhone(dial, phoneRaw);
    setPhone(full);
    try {
      await post("/auth/request-otp", { phone: full, actionType: "AUTH" });
      setStep("otp");
    } catch (err) {
      handleError(err, s.genericError);
    } finally {
      setLoading(false);
    }
  }

  // After a new user's OTP passes, ask the backend whether registration may
  // proceed. The gate is fully server-driven: eligible → name step; a
  // referral_required reason → referral screen. No client-side rules.
  async function routeNewUser() {
    const elig = await post<Eligibility>("/auth/eligibility", { phone });
    if (elig.eligible) {
      confirmedReferralRef.current = null;
      setStep("name");
    } else if (elig.reason === "referral_required") {
      setReferralInput("");
      setReferralError("");
      setStep("referral");
    } else {
      // Unknown ineligible reason — fail closed with a generic message.
      setError(s.cantProceed);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      // Skip verify/complete-login on retry if OTP already passed and only the
      // eligibility call failed (OTP codes are single-use).
      if (!otpPassedRef.current) {
        await post("/auth/verify-otp", { phone, code: otp, actionType: "AUTH" });
        const res = await post<{ token: string; isNewUser: boolean }>(
          "/auth/complete-login",
          { phone }
        );
        if (!res.isNewUser) {
          saveToken(res.token);
          redirectTo("/chat");
          return;
        }
        otpPassedRef.current = true;
      }
      try {
        await routeNewUser();
      } catch (eligErr) {
        const ee = eligErr as PostError;
        if (ee?.retryAfter) startRateLimit(ee.retryAfter);
        // Do NOT fail open — stay here with a retry message.
        setError(s.cantVerify);
      }
      setLoading(false);
    } catch (err) {
      handleError(err, s.invalidCode);
      setLoading(false);
    }
  }

  async function handleReferralSubmit(e: React.FormEvent) {
    e.preventDefault();
    setReferralError("");
    setError("");
    setLoading(true);
    try {
      // One input, both params (backend decision 17 Aug): the server tries the
      // value as a code first, then as a phone — garbage in either is harmless.
      const val = referralInput.trim();
      const elig = await post<Eligibility>("/auth/eligibility", {
        phone,
        referralPhone: val,
        referralCode: val,
      });
      if (elig.eligible) {
        // Remember the validated referral — register re-checks it server-side.
        confirmedReferralRef.current = val;
        setStep("name");
      } else {
        setReferralError(s.referralNotFound);
      }
    } catch (err) {
      const ee = err as PostError;
      if (ee?.retryAfter) {
        startRateLimit(ee.retryAfter);
        setReferralError(ee.message);
      } else {
        setReferralError(s.cantVerify);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: { phone: string; name: string; referralPhone?: string; referralCode?: string } = { phone, name };
      // Gate flow value wins; otherwise the optional "Invited by" field. Always
      // sent when present — this is what builds the referral chain. The same
      // value goes in BOTH params (code or number, server sorts it out).
      const referral = confirmedReferralRef.current ?? (inviteInput.trim() || null);
      if (referral) {
        body.referralPhone = referral;
        body.referralCode = referral;
      }
      const res = await post<{ token: string }>("/auth/register", body);
      saveToken(res.token);
      redirectTo("/onboarding/contacts");
    } catch (err) {
      const e2 = err as PostError;
      if (e2?.retryAfter) {
        handleError(err, s.genericError);
      } else {
        // Server re-checks the gate at register time (e.g. the referrer's
        // subscription lapsed between eligibility and register). Show the
        // server's error and send the user back to the referral screen.
        setLoading(false);
        setReferralError(e2 instanceof Error ? e2.message : s.genericError);
        confirmedReferralRef.current = null;
        setReferralInput("");
        setStep("referral");
        return;
      }
      setLoading(false);
    }
  }

  const rateLimited = rlSecs > 0;

  return (
    <div className="flex min-h-full flex-col items-center justify-between px-4 py-12" style={{ background: "var(--bg)" }}>
      {/* SMS toast */}
      {smsToast && (
        <div className="toast" role="status" aria-live="polite">{smsToast}</div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center justify-center gap-2.5">
            <span className="ally-avatar" style={{ width: 30, height: 30 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assets/ally/ally-avatar.jpg" alt="Netai" onError={(e) => { e.currentTarget.style.display = "none"; }} />
            </span>
            <span style={{ font: "500 26px/32px var(--font-bricolage)", color: "var(--ink)" }}>Netai</span>
          </div>

          <div className="card flex flex-col gap-4 overflow-hidden">
            {error && (
              <div
                className="px-4 py-3 text-sm"
                style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}
              >
                {error}
                {rateLimited && ` (${rlSecs}s)`}
              </div>
            )}

            {step === "phone" && (
              <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.enterPhone}</p>
                <div className="flex gap-2">
                  <select
                    value={dial}
                    onChange={(e) => setDial(e.target.value)}
                    aria-label="Country code"
                    className="input-pill"
                    style={{ width: 108, flex: "0 0 auto", paddingLeft: 10, paddingRight: 6 }}
                  >
                    {DIAL_CODES.map((c) => (
                      <option key={c.code} value={c.code}>{c.label}</option>
                    ))}
                  </select>
                  <input
                    type="tel"
                    required
                    value={phoneRaw}
                    onChange={(e) => setPhoneRaw(e.target.value)}
                    placeholder="555 12 34 56"
                    className="input-pill flex-1 min-w-0"
                  />
                </div>
                <button type="submit" disabled={loading || rateLimited} className="btn-primary h-12">
                  {loading ? <Spinner /> : rateLimited ? s.wait(rlSecs) : s.getCode}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.otpSent}</p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="input-pill text-center text-2xl tracking-widest"
                />
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6 || rateLimited}
                  className="btn-primary h-12"
                >
                  {loading ? <Spinner /> : rateLimited ? s.wait(rlSecs) : s.verify}
                </button>

                {/* SMS resend */}
                <button
                  type="button"
                  onClick={handleSmsResend}
                  disabled={smsCooldown > 0 || smsLoading || rateLimited}
                  className="btn-secondary h-10 text-xs disabled:cursor-not-allowed"
                >
                  {smsLoading ? (
                    <Spinner dark />
                  ) : smsCooldown > 0 ? (
                    s.sendSms(smsCooldown)
                  ) : (
                    s.sendSmsNow
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("phone"); setOtp(""); setError(""); otpPassedRef.current = false; }}
                  className="text-xs transition-colors"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {s.back}
                </button>
              </form>
            )}

            {step === "referral" && (
              <form onSubmit={handleReferralSubmit} className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <p style={{ font: "500 17px/24px var(--font-bricolage)", color: "var(--ink)" }}>{s.inviteOnly}</p>
                  <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.inviteOnlyBody}</p>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={referralInput}
                  onChange={(e) => { setReferralInput(e.target.value); setReferralError(""); }}
                  placeholder={s.referralPlaceholder}
                  className="input-pill"
                />
                {referralError && (
                  <p className="text-sm" style={{ color: "var(--danger)" }}>{referralError}</p>
                )}
                <button
                  type="submit"
                  disabled={loading || !referralInput.trim() || rateLimited}
                  className="btn-primary h-12"
                >
                  {loading ? <Spinner /> : rateLimited ? s.wait(rlSecs) : s.continueBtn}
                </button>
              </form>
            )}

            {step === "name" && (
              <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.firstTime}</p>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={s.namePlaceholder}
                  className="input-pill"
                />
                {/* Optional referrer — hidden when the invite gate already captured one.
                    Builds the referral chain in every mode; no validation needed. */}
                {!confirmedReferralRef.current && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs" style={{ color: "var(--ink-soft)" }}>{s.invitedBy}</label>
                    <input
                      type="text"
                      value={inviteInput}
                      onChange={(e) => setInviteInput(e.target.value)}
                      placeholder={s.invitedByPlaceholder}
                      className="input-pill"
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || !name.trim() || rateLimited}
                  className="btn-primary h-12"
                >
                  {loading ? <Spinner /> : rateLimited ? s.wait(rlSecs) : s.signUp}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Legal footer */}
      <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs" style={{ color: "var(--meta)" }}>
        <Link href="/pricing" className="transition-colors hover:text-[var(--ink)]">{s.pricing}</Link>
        <Link href="/terms" className="transition-colors hover:text-[var(--ink)]">{s.terms}</Link>
        <Link href="/privacy" className="transition-colors hover:text-[var(--ink)]">{s.privacy}</Link>
        <Link href="/refund" className="transition-colors hover:text-[var(--ink)]">{s.refund}</Link>
      </div>
    </div>
  );

  async function handleSmsResend() {
    setSmsLoading(true);
    try {
      await post("/auth/resend-otp", { phone, actionType: "AUTH" });
      showSmsToast(s.smsSent);
      // restart cooldown
      setSmsCooldown(SMS_COOLDOWN);
      if (cooldownRef.current) clearInterval(cooldownRef.current);
      cooldownRef.current = setInterval(() => {
        setSmsCooldown((prev) => {
          if (prev <= 1) {
            clearInterval(cooldownRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err) {
      const e = err as PostError;
      if (e?.retryAfter) startRateLimit(e.retryAfter);
      showSmsToast(e instanceof Error ? e.message : s.genericError);
    } finally {
      setSmsLoading(false);
    }
  }
}

function Spinner({ dark }: { dark?: boolean }) {
  return (
    <span className={`h-5 w-5 animate-spin rounded-full border-2 ${dark ? "border-gray-300 border-t-gray-600" : "border-white/30 border-t-white"}`} />
  );
}
