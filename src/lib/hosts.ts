// #7294 (staging, 23 Oct): every address the app shows or opens follows the
// build it is in. A staging copy built with its own NEXT_PUBLIC_API_URL must
// never point people at the live server or the live site.

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/+$/, "");

// The connector address people paste into Claude or ChatGPT.
export const MCP_URL = `${API_BASE}/mcp`;

// The server's host as the guides print it (api.netai.guru on production).
export const API_HOST = API_BASE.replace(/^https?:\/\//, "");

// The site people are invited to: the one they are using now. Server-side
// rendering has no window; production's address is the fallback there.
export function siteUrl(): string {
  return typeof window === "undefined" ? "https://netai.guru" : window.location.origin;
}
