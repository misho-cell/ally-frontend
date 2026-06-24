import Link from "next/link";

export default function LegalNav() {
  return (
    <>
      <nav className="border-b border-gray-200 bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ally-logo.svg" alt="Ally" width={24} height={24} />
            <span className="font-bold text-[#1a1a2e]">Ally</span>
          </Link>
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <Link href="/pricing" className="hover:text-[#1a1a2e] transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-[#1a1a2e] transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-[#1a1a2e] transition-colors">Privacy</Link>
            <Link href="/refund" className="hover:text-[#1a1a2e] transition-colors">Refund</Link>
          </div>
        </div>
      </nav>
      <footer className="border-t border-gray-200 bg-white mt-16 py-8 px-6">
        <div className="mx-auto max-w-4xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-sm text-gray-400">
          <span>© 2026 Ally, Inc. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-gray-700 transition-colors">Pricing</Link>
            <Link href="/terms" className="hover:text-gray-700 transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-gray-700 transition-colors">Privacy</Link>
            <Link href="/refund" className="hover:text-gray-700 transition-colors">Refund Policy</Link>
          </div>
        </div>
      </footer>
    </>
  );
}
