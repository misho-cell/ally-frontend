"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const SMS_COOLDOWN = 30;

type Step = "phone" | "otp" | "name";

type PostError = Error & { retryAfter?: number };

export default function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsToast, setSmsToast] = useState<string | null>(null);
  const [smsCooldown, setSmsCooldown] = useState(SMS_COOLDOWN);
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
        json.error ?? json.message ?? "ძალიან ბევრი მოთხოვნა. გთხოვთ, სცადოთ მოგვიანებით."
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
    try {
      await post("/auth/request-otp", { phone, actionType: "AUTH" });
      setStep("otp");
    } catch (err) {
      handleError(err, "შეცდომა");
    } finally {
      setLoading(false);
    }
  }

  async function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await post("/auth/verify-otp", { phone, code: otp, actionType: "AUTH" });
      const res = await post<{ token: string; isNewUser: boolean }>(
        "/auth/complete-login",
        { phone }
      );
      if (res.isNewUser) {
        setStep("name");
        setLoading(false);
      } else {
        saveToken(res.token);
        redirectTo("/chat");
      }
    } catch (err) {
      handleError(err, "კოდი არასწორია");
      setLoading(false);
    }
  }

  async function handleSmsResend() {
    setSmsLoading(true);
    try {
      await post("/auth/resend-otp", { phone, actionType: "AUTH" });
      showSmsToast("კოდი SMS-ით გაიგზავნა");
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
      showSmsToast(e instanceof Error ? e.message : "შეცდომა");
    } finally {
      setSmsLoading(false);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await post<{ token: string }>("/auth/register", { phone, name });
      saveToken(res.token);
      redirectTo("/onboarding/contacts");
    } catch (err) {
      handleError(err, "შეცდომა");
      setLoading(false);
    }
  }

  const rateLimited = rlSecs > 0;

  return (
    <div className="flex min-h-full flex-col items-center justify-between bg-[#1a1a2e] px-4 py-12">
      {/* SMS toast */}
      {smsToast && (
        <div
          style={{
            position: "fixed",
            bottom: "80px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "rgba(0,0,0,0.82)",
            color: "white",
            borderRadius: "12px",
            padding: "10px 18px",
            fontSize: "13.5px",
            zIndex: 9999,
            maxWidth: "90%",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          {smsToast}
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center w-full">
        <div className="w-full max-w-sm">
          <h1 className="mb-8 text-center text-3xl font-bold tracking-tight text-white">
            Ally
          </h1>

          <div className="overflow-hidden rounded-2xl bg-white shadow-xl p-6 flex flex-col gap-4">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
                {rateLimited && ` (${rlSecs} წმ)`}
              </div>
            )}

            {step === "phone" && (
              <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-gray-500">შეიყვანე ტელეფონის ნომერი</p>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+995555123456"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
                />
                <button
                  type="submit"
                  disabled={loading || rateLimited}
                  className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? <Spinner /> : rateLimited ? `დაელით (${rlSecs} წმ)` : "კოდის მიღება"}
                </button>
              </form>
            )}

            {step === "otp" && (
              <form onSubmit={handleOtpSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-gray-500">
                  WhatsApp-ზე გამოგზავნილი 6-ნიშნა კოდი
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl tracking-widest outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
                />
                <button
                  type="submit"
                  disabled={loading || otp.length !== 6 || rateLimited}
                  className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? <Spinner /> : rateLimited ? `დაელით (${rlSecs} წმ)` : "დადასტურება"}
                </button>

                {/* SMS resend */}
                <button
                  type="button"
                  onClick={handleSmsResend}
                  disabled={smsCooldown > 0 || smsLoading || rateLimited}
                  className="flex h-10 items-center justify-center rounded-xl border border-gray-200 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {smsLoading ? (
                    <Spinner />
                  ) : smsCooldown > 0 ? (
                    `SMS-ით გაგზავნა (${smsCooldown} წმ)`
                  ) : (
                    "კოდი არ მივიღე — SMS-ით გამოგზავნა"
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  ← უკან
                </button>
              </form>
            )}

            {step === "name" && (
              <form onSubmit={handleNameSubmit} className="flex flex-col gap-4">
                <p className="text-sm text-gray-500">
                  პირველად გამოიყენებ — შეიყვანე შენი სახელი
                </p>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="სახელი გვარი"
                  className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
                />
                <button
                  type="submit"
                  disabled={loading || !name.trim() || rateLimited}
                  className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {loading ? <Spinner /> : rateLimited ? `დაელით (${rlSecs} წმ)` : "რეგისტრაცია"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Legal footer */}
      <div className="mt-8 flex flex-wrap justify-center gap-4 text-xs text-white/40">
        <Link href="/pricing" className="hover:text-white/70 transition-colors">Pricing</Link>
        <Link href="/terms" className="hover:text-white/70 transition-colors">Terms</Link>
        <Link href="/privacy" className="hover:text-white/70 transition-colors">Privacy</Link>
        <Link href="/refund" className="hover:text-white/70 transition-colors">Refund Policy</Link>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
