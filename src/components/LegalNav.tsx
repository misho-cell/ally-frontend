import Link from "next/link";

// Legal pages keep the registered entity name in their BODY text ("Ally, Inc.")
// — that is the company, not the product. Only the chrome (logo mark, wordmark)
// carries the Netai branding.
//
// The nav and the footer are SEPARATE exports on purpose: pages render the nav
// at the top and the footer at the bottom. Rendering one combined component
// twice (the old shape) printed the copyright line directly under the header.

const LINKS: [string, string][] = [
  ["/pricing", "Pricing"],
  ["/terms", "Terms"],
  ["/privacy", "Privacy"],
  ["/refund", "Refund"],
];

export default function LegalNav() {
  return (
    <nav
      className="px-6 py-4"
      style={{ background: "var(--bg)", borderBottom: "1px solid var(--header-border)" }}
    >
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
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
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm" style={{ color: "var(--meta)" }}>
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="transition-colors hover:text-[var(--ink)]">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}

export function LegalFooter() {
  return (
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
        <div className="flex flex-wrap gap-4">
          <Link href="/pricing" className="transition-colors hover:text-[var(--ink)]">Pricing</Link>
          <Link href="/terms" className="transition-colors hover:text-[var(--ink)]">Terms</Link>
          <Link href="/privacy" className="transition-colors hover:text-[var(--ink)]">Privacy</Link>
          <Link href="/refund" className="transition-colors hover:text-[var(--ink)]">Refund Policy</Link>
        </div>
      </div>
    </footer>
  );
}
