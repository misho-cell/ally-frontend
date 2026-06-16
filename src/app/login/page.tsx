"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Step = "phone" | "otp" | "name";

export default function LoginPage() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function saveToken(token: string) {
    localStorage.setItem("token", token);
    document.cookie = `token=${token}; path=/; SameSite=Lax`;
  }

  async function post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message ?? data.error ?? `Request failed with status ${res.status}`);
    }
    return data as T;
  }

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await post("/auth/request-otp", { phone, actionType: "AUTH" });
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
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
      const res = await post<{ success: boolean; data: { token: string; isNewUser: boolean } }>(
        "/auth/complete-login",
        { phone }
      );
      if (res.data.isNewUser) {
        setStep("name");
      } else {
        saveToken(res.data.token);
        router.replace("/chat");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "კოდი არასწორია");
    } finally {
      setLoading(false);
    }
  }

  async function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await post<{ success: boolean; data: { token: string } }>(
        "/auth/register",
        { phone, name }
      );
      saveToken(res.data.token);
      router.replace("/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : "შეცდომა");
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
                {loading ? <Spinner /> : "კოდის მიღება"}
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
                disabled={loading || otp.length !== 6}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Spinner /> : "დადასტურება"}
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
                disabled={loading || !name.trim()}
                className="flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {loading ? <Spinner /> : "რეგისტრაცია"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
  );
}
