"use client";

import { useEffect, useState } from "react";
import { authHeaders } from "@/lib/deviceId";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
    return <span className="text-xs text-gray-400">აპი გადმოწერე ნოტიფ-ებისთვის</span>;
  }

  if (status === "denied") {
    return <span className="text-xs text-gray-400">ნოტიფ. დაბლოკილია</span>;
  }

  return (
    <button
      type="button"
      onClick={enable}
      disabled={status === "loading"}
      className="rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 disabled:opacity-50"
    >
      {status === "loading" ? "..." : "🔔 ნოტიფ."}
    </button>
  );
}
