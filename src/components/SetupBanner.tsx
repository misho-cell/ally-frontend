"use client";

import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { useSetupState } from "@/lib/setup";

// "Setup: N of 5 done", one tap from home until every step is done
// (onboarding vision, principle 6). The numbers are the server's.
export default function SetupBanner({ className = "" }: { className?: string }) {
  const [state] = useSetupState();
  if (!state || state.doneCount >= state.total) return null;
  return (
    <Link href="/setup" className={`dz-setup ${className}`}>
      {tf("setupBanner", { n: state.doneCount, total: state.total })} · {t("setupContinue")} ›
    </Link>
  );
}
