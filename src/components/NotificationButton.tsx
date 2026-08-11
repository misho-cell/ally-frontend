"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/deviceId";
import { getLocale } from "@/lib/i18n";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Screen-local strings (phone locale: ka → Georgian, else English).
// No emoji in UI copy (brand rule).
const L = {
  en: {
    needsPwa: "Install the app for notifications",
    blocked: "Notifications blocked",
    enable: "Notifications",
  },
  ka: {
    needsPwa: "შეტყობინებებისთვის დააინსტალირე აპლიკაცია",
    blocked: "შეტყობინებები დაბლოკილია",
    enable: "შეტყობინებები",
  },
};

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

type Status = "idle" | "loading" | "granted" | "denied" | "needs-pwa" | "unsupported";

export default function NotificationButton() {
  const s = L[getLocale()];
  const [status, setStatus] = useState<Status>("idle");

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);

    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }
    if (isIos && !isStandalone) {
      setStatus("needs-pwa");
      return;
    }
    if (Notification.permission === "denied") {
      setStatus("denied");
      return;
    }
    if (Notification.permission === "granted" && localStorage.getItem("push_endpoint")) {
      setStatus("granted");
      return;
    }
  }, []);

  async function enable() {
    setStatus("loading");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus("denied");
        return;
      }
      const keyRes = await fetch(`${BASE_URL}/notifications/vapid-public-key`, {
        headers: authHeaders(),
      });
      const keyJson = await keyRes.json();
      const vapidKey = keyJson.data?.key ?? keyJson.key;
      const reg = await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const sub = subscription.toJSON();
      await fetch(`${BASE_URL}/notifications/subscribe`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(sub),
      });
      localStorage.setItem("push_endpoint", sub.endpoint ?? "");
      setStatus("granted");
    } catch {
      setStatus("idle");
    }
  }

  if (status === "granted" || status === "unsupported") return null;

  if (status === "needs-pwa") {
    return <span className="text-xs" style={{ color: "var(--meta)" }}>{s.needsPwa}</span>;
  }

  if (status === "denied") {
    return <span className="text-xs" style={{ color: "var(--meta)" }}>{s.blocked}</span>;
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={status === "loading"}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{ color: "var(--accent-strong)" }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-tint)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
    >
      {status === "loading" ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2"
          style={{ borderColor: "var(--cta-border)", borderTopColor: "var(--accent-strong)" }}
        />
      ) : (
        <svg viewBox="0 0 20 20" fill="none" style={{ width: 14, height: 14 }}>
          <path
            d="M10 3a4 4 0 00-4 4v3l-1.5 2.5h11L14 10V7a4 4 0 00-4-4z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M8 15a2 2 0 004 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      )}
      {s.enable}
    </button>
  );
}
