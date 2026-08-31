"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Phase = "loading" | "ready" | "error";

// Invite landing page (get_invite_link points here) — Georgian content
// confirmed final by the 30 Aug tester round, no em dashes anywhere.
export default function JoinClient() {
  const [ref, setRef] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");

  useEffect(() => {
    document.documentElement.lang = "ka";
    return () => {
      document.documentElement.lang = "en";
    };
  }, []);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("ref");
    setRef(code);
    if (!code) {
      setPhase("error");
      return;
    }
    // Sends both field names — the backend contract accepts either.
    fetch(`${BASE_URL}/auth/referral/opened`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, referralCode: code }),
    })
      .then((res) => {
        if (!res.ok) {
          setPhase("error");
          return;
        }
        return res.json().then((json) => {
          setPhase(json?.success === false ? "error" : "ready");
        });
      })
      // Network failure shouldn't block registration — fail open.
      .catch(() => setPhase("ready"));
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
          <p className="text-sm" style={{ color: "var(--meta)" }}>ითვირთება...</p>
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
              რეგისტრაციას 1 წუთი სხირდება. მოწვევის კოდი ავტომატურად ივსება.
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
