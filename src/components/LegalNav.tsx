import Link from "next/link";

// Legal pages keep their legal-entity name in the BODY text ("Ally, Inc.") —
// that is the registered company. Only the product branding in the chrome
// (logo mark + wordmark) is Netai.
export default function LegalNav() {
  return (
    <>
      <nav
        className="px-6 py-4"
        style={{ background: "var(--bg)", borderBottom: "1px solid var(--header-border)" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="ally-avatar" style={{ width: 26, height: 26 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/assets/ally/ally-avatar.jpg"
                alt="Netai"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            </span>
            <span style={{ font: "500 20px/26px var(--font-bricolage)", color: "var(--ink)" }}>
              Netai
            </span>
          </Link>
          <div className="flex items-center gap-6 text-sm" style={{ color: "var(--meta)" }}>
            <Link href="/pricing" className="transition-colors hover:text-[var(--ink)]">Pricing</Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--ink)]">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--ink)]">Privacy</Link>
            <Link href="/refund" className="transition-colors hover:text-[var(--ink)]">Refund</Link>
          </div>
        </div>
      </nav>
      <footer
        className="mt-16 px-6 py-8"
        style={{ background: "var(--bg)", borderTop: "1px solid var(--header-border)" }}
      >
        <div
          className="mx-auto max-w-4xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm"
          style={{ color: "var(--meta)" }}
        >
          {/* Registered entity name — legal text, not branding. */}
          <span>© 2026 Ally, Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="transition-colors hover:text-[var(--ink)]">Pricing</Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--ink)]">Terms</Link>
            <Link href="/privacy" className="transition-colors hover:text-[var(--ink)]">Privacy</Link>
            <Link href="/refund" className="transition-colors hover:text-[var(--ink)]">Refund Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
