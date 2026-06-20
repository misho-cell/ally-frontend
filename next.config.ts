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
        urlPattern: /^https:\/\/ally-backend-production\.up\.railway\.app\/threads\/stream/,
        handler: "NetworkOnly",
      },
      {
        // All backend API calls — NetworkOnly (no caching)
        urlPattern: /^https:\/\/ally-backend-production\.up\.railway\.app\/.*/,
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
