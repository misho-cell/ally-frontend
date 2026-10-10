"use client";

import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { useSetupState } from "@/lib/setup";

// "Setup: N of 5 done", one tap from home until every step is done
// (onboarding vision, principle 6). The numbers are the server's.
export default function SetupBanner() {
  const [state] = useSetupState();
  if (!state || state.doneCount >= state.total) return null;
  return (
    <Link
      href="/setup"
      className="flex items-center justify-between gap-2"
      style={{ background: "var(--accent-tint)", border: "1px solid var(--cta-border)", borderRadius: 12, padding: "10px 14px", textDecoration: "none" }}
    >
      <span style={{ font: "500 13.5px/19px var(--font-system)", color: "var(--accent-strong)" }}>
        {tf("setupBanner", { n: state.doneCount, total: state.total })}
      </span>
      <span style={{ font: "600 13px/18px var(--font-system)", color: "var(--accent-strong)" }}>{t("setupContinue")} ›</span>
    </Link>
  );
}
