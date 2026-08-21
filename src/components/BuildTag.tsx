"use client";

import { useEffect } from "react";

// Task 23: which build does each device run? Vercel exposes the commit SHA at
// build time; the tag is visible in the corner AND logged to the console so
// testers can compare devices. Remove once the investigation closes.
const SHA = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev";

export default function BuildTag() {
  useEffect(() => {
    console.info(`Netai build ${SHA}`);
  }, []);
  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        right: 6,
        bottom: 3,
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
