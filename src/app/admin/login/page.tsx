"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

export default function AdminLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data: { token: string } }>(
        "/auth/admin/login",
        { method: "POST", body: { email, password } }
      );
      // Admin session lives ONLY in adminToken — never touch the user `token`,
      // so working in the admin panel can't hijack the phone-login session.
      localStorage.setItem("adminToken", res.data.token);
      const secure = window.location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `adminToken=${res.data.token}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax${secure}`;
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ავტორიზაცია ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-white px-4 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-8 text-center text-3xl font-bold tracking-tight text-[#23261F]">
          Ally Admin
        </h1>

        <div className="overflow-hidden rounded-2xl border border-[#E4E0D3] bg-white">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-6">
            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@ally.com"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                პაროლი
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-12 items-center justify-center rounded-xl bg-[#3E7A56] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                "შესვლა"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
