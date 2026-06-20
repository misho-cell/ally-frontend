"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

type Step = "phone" | "otp" | "register-name" | "register-otp";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function saveToken(token: string) {
    localStorage.setItem("token", token);
    // max-age=2592000 = 30 days; without this the cookie is session-only and
    // disappears when the browser closes, forcing OTP on every restart
    document.cookie = `token=${token}; path=/; max-age=2592000; SameSite=Lax`;
  }

  async function handleRequestOTP(actionType: "AUTH" | "REGISTER") {
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/request-otp", {
        method: "POST",
        body: { phone, actionType },
      });
    } finally {
      setLoading(false);
    }
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/request-otp", {
        method: "POST",
        body: { phone, actionType: "AUTH" },
      });
      setStep("otp");
    } catch (err) {
      if (err instanceof ApiError && err.message.toLowerCase().includes("not found")) {
        setStep("register-name");
      } else {
        setError(err instanceof ApiError ? err.message : "შეცდომა");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleOTPSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/verify-otp", {
        method: "POST",
        body: { phone, code: otp, actionType: "AUTH" },
      });
      const res = await apiFetch<{ success: boolean; data: { token: string } }>(
        "/auth/register",
        { method: "POST", body: { phone, name: "" } }
      );
      saveToken(res.data.token);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "კოდი არასწორია");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await handleRequestOTP("REGISTER");
      setStep("register-otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "შეცდომა");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterOTPSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await apiFetch("/auth/verify-otp", {
        method: "POST",
        body: { phone, code: otp, actionType: "REGISTER" },
      });
      const res = await apiFetch<{ success: boolean; data: { token: string } }>(
        "/auth/register",
        { method: "POST", body: { phone, name } }
      );
      saveToken(res.data.token);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "კოდი არასწორია");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#1a1a2e] px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold tracking-tight text-white">
          Ally
        </h1>

        <div className="overflow-hidden rounded-2xl bg-white shadow-xl p-6 flex flex-col gap-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Step 1: Phone */}
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
                disabled={loading}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "კოდის მიღება"
                )}
              </button>
            </form>
          )}

          {/* Step 2: OTP (login) */}
          {step === "otp" && (
            <form onSubmit={handleOTPSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                WhatsApp-ზე გამოგზავნილი 6-ნიშნა კოდი
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl tracking-widest outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "შესვლა"
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

          {/* Step 3a: Registration — name */}
          {step === "register-name" && (
            <form onSubmit={handleRegisterNameSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                ეს ნომერი არ არის რეგისტრირებული. შეიყვანე სახელი.
              </p>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="სახელი გვარი"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
              <button
                type="submit"
                disabled={loading || !name.trim()}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "კოდის მიღება"
                )}
              </button>
            </form>
          )}

          {/* Step 3b: Registration — OTP */}
          {step === "register-otp" && (
            <form onSubmit={handleRegisterOTPSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-gray-500">
                WhatsApp-ზე გამოგზავნილი 6-ნიშნა კოდი
              </p>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="rounded-xl border border-gray-200 px-4 py-3 text-center text-2xl tracking-widest outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
              />
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "რეგისტრაცია"
                )}
              </button>
              <button
                type="button"
                onClick={() => { setStep("register-name"); setOtp(""); setError(""); }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                ← უკან
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
