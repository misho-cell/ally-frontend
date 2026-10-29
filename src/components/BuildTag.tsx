"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { APP_BUILD as SHA } from "@/lib/build";

// Task 23: which build does each device run? Vercel exposes the commit SHA at
// build time; the tag is visible in the corner AND logged to the console so
// testers can compare devices. Remove once the investigation closes.

//
// #8386 (Giorgi, 29 Oct): shown on the Profile page only. Everywhere else it
// sat in the corner of every screen. The console line stays on every page.
export default function BuildTag() {
  const pathname = usePathname();
  useEffect(() => {
    console.info(`Netai build ${SHA}`);
  }, []);
  if (pathname !== "/profile") return null;
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        // #4889 (Lika, 18 Oct): the installed app on a phone draws under the
        // rounded corner and the home bar, which cut the tag; keep it inside
        // the safe area there, and where it is no inset it stays as it was.
        right: "calc(6px + env(safe-area-inset-right, 0px))",
        bottom: "calc(3px + env(safe-area-inset-bottom, 0px))",
        zIndex: 40,
        font: "400 9px/12px monospace",
        color: "rgba(107,114,101,0.5)",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {SHA}
    </div>
  );
}
