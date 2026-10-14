"use client";

import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { isStandalone } from "@/lib/push";
import { tickCount, useGadget, useSetupState } from "@/lib/setup";

// "Setup: N of M done", one tap from home until every step is done
// (onboarding vision, principle 6). The same count as the setup page's
// (#4592), so the two never disagree.
export default function SetupBanner({ className = "" }: { className?: string }) {
  const [state] = useSetupState();
  const gadget = useGadget();
  if (!state) return null;
  const { done, total } = tickCount(state, gadget !== null && isStandalone());
  if (done >= total) return null;
  return (
    <Link href="/setup" className={`dz-setup ${className}`}>
      {tf("setupBanner", { n: done, total })} · {t("setupContinue")} ›
    </Link>
  );
}
