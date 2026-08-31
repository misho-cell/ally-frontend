"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isOnboardingDone } from "@/lib/user";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    // FT-6 (31 Aug): onboarding was a one-shot gate — interrupted by a
    // payment popup, a refresh, or a closed tab, it was gone for good and
    // the user never got a contacts sync. Route back into it until it's
    // completed or explicitly skipped.
    router.replace(isOnboardingDone() ? "/chat" : "/onboarding/contacts");
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center" style={{ background: "var(--bg)" }}>
      <span
        className="h-8 w-8 animate-spin rounded-full border-2"
        style={{ borderColor: "var(--sidebar-border)", borderTopColor: "var(--accent)" }}
      />
    </div>
  );
}
