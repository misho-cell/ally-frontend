"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchOnboardingStatus } from "@/lib/user";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.replace("/login");
      return;
    }
    // FT-6 (2 Sept): onboarding status now comes from the server
    // (GET /profile/onboarding) — the same rule the backend itself uses to
    // decide how to talk to the user, so a refresh, a second device, or an
    // incognito window can never disagree with it the way a local flag did.
    // A failed check fails toward /chat rather than trapping the user in a
    // redirect loop.
    fetchOnboardingStatus().then((status) => {
      router.replace(status?.isOnboarding ? "/onboarding/contacts" : "/chat");
    });
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
