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
    // Exclude SSE endpoint and all API calls from service worker caching
    navigateFallbackDenylist: [/\/threads\/stream/],
    runtimeCaching: [
      {
        // SSE stream — never intercept
        urlPattern: /\/threads\/stream/,
        handler: "NetworkOnly",
      },
      {
        // All backend API calls — NetworkOnly (no caching)
        urlPattern: ({ url }: { url: URL }) => {
          const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
          return url.href.startsWith(apiBase);
        },
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
