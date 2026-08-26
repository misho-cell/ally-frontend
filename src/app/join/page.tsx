"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Invite landing page (get_invite_link points here). Content is ours, not
// the backend's — English only until this ships, per the 25 Aug task. Once
// live, backend flips the invite_link_ready app_flag.
export default function JoinPage() {
  const [ref, setRef] = useState<string | null>(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    setRef(code);
    // T3 (26 Aug): fire-and-forget open event — public endpoint, no auth.
    if (code) {
      fetch(`${BASE_URL}/auth/referral/opened`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referralCode: code }),
      }).catch(() => {});
    }
  }, []);

  const href = ref ? `/login?ref=${encodeURIComponent(ref)}` : "/login";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <span style={{ font: "700 22px/1 var(--font-system)", color: "var(--ink-strong)" }}>Netai</span>

        <div className="flex flex-col gap-2">
          <h1 style={{ font: "600 22px/28px var(--font-system)", color: "var(--ink-strong)" }}>
            You&apos;ve been invited to Netai
          </h1>
          <p className="text-sm" style={{ color: "var(--meta)" }}>
            Netai is a personal assistant that works your own network — it helps you find the right
            person for what you need, without ever handing your contacts to anyone.
          </p>
        </div>

        {ref && (
          <div
            className="rounded-xl px-4 py-2 text-xs"
            style={{ background: "var(--sidebar-bg)", color: "var(--meta)", border: "1px solid var(--sidebar-border)" }}
          >
            Invite code: <span style={{ color: "var(--ink)", fontWeight: 600 }}>{ref}</span>
          </div>
        )}

        <Link href={href} className="btn-primary w-full">
          Get started
        </Link>

        <p className="text-xs" style={{ color: "var(--meta)" }}>
          Already have an account? <Link href="/login" className="transition-colors hover:text-[var(--ink)]">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
