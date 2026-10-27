"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { rememberLinkCode } from "@/lib/invite";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Phase = "loading" | "ready" | "error";

// Invite landing page (get_invite_link points here) — Georgian content
// confirmed final by the 30 Aug tester round, no em dashes anywhere.
export default function JoinClient() {
  const [ref, setRef] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    // FE-C (2 Sept): this page's copy is always Georgian regardless of the
    // visitor's app locale, so it always claims ka — no revert on unmount.
    // The root layout's LocaleHtml owns lang everywhere else.
    document.documentElement.lang = "ka";
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    setRef(code);
    if (!code) {
      setPhase("error");
      return;
    }
    // Sends both field names — the backend contract accepts either.
    const opened: Promise<Phase> = fetch(`${BASE_URL}/auth/referral/opened`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, referralCode: code }),
    })
      .then((res) => {
        if (!res.ok) return "error" as const;
        return res.json().then((json) => (json?.success === false ? "error" : "ready") as Phase);
      })
      // Network failure shouldn't block registration — fail open.
      .catch(() => "ready" as const);
    // 2641 (backend 11 Oct 02:30Z): GET /invite-codes/:code says in one bit
    // whether the code would be taken. A definite "no" (exists:false, or a
    // 400 for a malformed code) shows the not-valid state; a definite "yes"
    // shows the welcome. Anything else (404 before the route ships, 429,
    // 500, no network) is no answer, and the page keeps today's behaviour
    // rather than turning a real invitation away.
    const exists: Promise<boolean | null> = fetch(`${BASE_URL}/invite-codes/${encodeURIComponent(code)}`)
      .then((res) => {
        if (res.status === 400) return false;
        if (!res.ok) return null;
        return res.json().then((json) => {
          const v = json?.data?.exists;
          return typeof v === "boolean" ? v : null;
        });
      })
      .catch(() => null);
    Promise.all([opened, exists]).then(([o, e]) => {
      const phase = e === false ? "error" : e === true ? "ready" : o;
      // #8185: kept on the device from here, so the login finds it even
      // when it is not opened through this page's own button.
      if (phase === "ready") rememberLinkCode(code);
      setPhase(phase);
    });
  }, []);

  const href = ref ? `/login?ref=${encodeURIComponent(ref)}` : "/login";

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6 py-12 text-center"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <span style={{ font: "700 22px/1 var(--font-system)", color: "var(--ink-strong)" }}>Netai</span>

        {phase === "loading" && (
          <p className="text-sm" style={{ color: "var(--meta)" }}>იტვირთება...</p>
        )}

        {phase === "error" && (
          <>
            <p className="text-sm" style={{ color: "var(--danger)" }}>
              ეს მოწვევის ბმული აღარ მუშაობს. სთხოვე მეგობარს ახალი ბმული.
            </p>
            <p className="text-xs" style={{ color: "var(--meta)" }}>
              უკვე გაქვს ანგარიში? <Link href="/login" className="transition-colors hover:text-[var(--ink)]">შესვლა</Link>
            </p>
          </>
        )}

        {phase === "ready" && (
          <>
            <div className="flex flex-col gap-2">
              <h1 style={{ font: "600 22px/28px var(--font-system)", color: "var(--ink-strong)" }}>
                შენი მეგობარი გიწვევს Netai-ზე
              </h1>
              <p className="text-sm" style={{ color: "var(--meta)" }}>
                Netai შენი პირადი ასისტენტია, რომელიც შენსავე ნაცნობებში პოულობს სწორ ადამიანს.
              </p>
            </div>

            <Link href={href} className="btn-primary w-full">
              შემოუერთდი
            </Link>

            <p className="text-xs" style={{ color: "var(--meta)" }}>
              რეგისტრაციას 1 წუთი სჭირდება. მოწვევის კოდი ავტომატურად ივსება.
            </p>

            <p className="text-xs" style={{ color: "var(--meta)" }}>
              უკვე გაქვს ანგარიში? <Link href="/login" className="transition-colors hover:text-[var(--ink)]">შესვლა</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
