import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {};

export default withPWA({
  dest: "public",
  customWorkerSrc: "worker",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    navigateFallbackDenylist: [/\/threads\/stream/],
    runtimeCaching: [
      {
        // SSE stream — never intercept
        urlPattern: /^https:\/\/api\.netai\.guru\/threads\/stream/,
        handler: "NetworkOnly",
      },
      {
        // All backend API calls — NetworkOnly. Authenticated responses must
        // NEVER be cached: the SW cache is not keyed by the Authorization
        // header, so a cached response can leak one user's content to the
        // next account on the same device.
        urlPattern: /^https:\/\/api\.netai\.guru\/.*/,
        handler: "NetworkOnly",
      },
      {
        // Legacy backend domain — same rules, kept until fully retired.
        urlPattern: /^https:\/\/ally-backend-production\.up\.railway\.app\/.*/,
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
