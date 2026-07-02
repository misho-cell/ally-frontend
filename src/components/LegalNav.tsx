import Link from "next/link";

export default function LegalNav() {
  return (
    <>
      <nav className="border-b border-[#E4E0D3] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ally-logo.svg" alt="Ally" width={24} height={24} />
            <span className="font-semibold text-[#23261F]">Ally</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-[#8A8778]">
            <Link href="/pricing" className="hover:text-[#23261F] transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-[#23261F] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[#23261F] transition-colors">Privacy</Link>
            <Link href="/refund" className="hover:text-[#23261F] transition-colors">Refund</Link>
          </div>
        </div>
      </nav>
      <footer className="border-t border-[#E4E0D3] bg-white mt-16 py-8 px-6">
        <div className="mx-auto max-w-4xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-[#8A8778]">
          <span>© 2026 Ally, Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-[#23261F] transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-[#23261F] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[#23261F] transition-colors">Privacy</Link>
            <Link href="/refund" className="hover:text-[#23261F] transition-colors">Refund Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
