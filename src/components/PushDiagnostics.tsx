"use client";

import { useEffect, useState } from "react";
import { getLocale } from "@/lib/i18n";
import { getDeviceId } from "@/lib/deviceId";
import NotificationButton from "./NotificationButton";

// Row 6 (12 Sept): the three values needed to tell a push problem apart —
// install mode, permission, and which push service holds the subscription —
// shown ON SCREEN.
//
// Why not the console: an iPhone has no JS console. Reading
// Notification.permission there needs a Mac with Safari Web Inspector plugged
// in by cable, so "send us the console output" is not a request a tester can
// act on. This card is screenshot-able instead.
//
// Reading the endpoint host also settles a question the database cannot:
// web.push.apple.com serves macOS Safari as well as iPhones, so an Apple
// endpoint on an account does not prove that the *phone* ever registered.

const L = {
  en: {
    title: "Notification diagnostics",
    hint: "Screenshot this if notifications are not arriving.",
    installed: "Added to home screen",
    permission: "Permission",
    service: "Push service",
    device: "Device",
    deviceId: "Device id",
    // #859: the one fact nobody could get at. "The worker never ran" and
    // "the worker ran and the phone drew nothing" looked identical from
    // every side, so the question stayed open a whole day.
    lastPush: "Last push received",
    lastTap: "Last notification tapped",
    never: "never on this device",
    yes: "yes",
    no: "no",
    none: "none",
    unavailable: "not available in this browser",
    tabNote: "On iPhone, notifications only work when the app is opened from the home screen, never from a Safari tab.",
  },
  ka: {
    title: "შეტყობინებების დიაგნოსტიკა",
    hint: "თუ შეტყობინებები არ მოდის, გადაუღე ამას სქრინშოტი.",
    installed: "მთავარ ეკრანზე დამატებული",
    permission: "ნებართვა",
    service: "მიწოდების სერვისი",
    device: "მოწყობილობა",
    deviceId: "მოწყობილობის id",
    lastPush: "ბოლო შეტყობინება მივიღე",
    lastTap: "ბოლოს დავაჭირე",
    never: "ამ მოწყობილობაზე არასდროს",
    yes: "კი",
    no: "არა",
    none: "არ არის",
    unavailable: "ამ ბრაუზერში მიუწვდომელია",
    tabNote: "iPhone-ზე შეტყობინებები მუშაობს მხოლოდ მაშინ, როცა აპი მთავარი ეკრანიდან იხსნება, არა Safari-ს ტაბიდან.",
  },
};

type Info = {
  deviceId: string;
  standalone: boolean;
  permission: string | null;
  endpointHost: string | null;
  device: string;
};

type PushLog = { at?: unknown; kind?: unknown };

// Written by the service worker (worker/index.js) on every push it handles
// and every notification tapped. Read here rather than sent anywhere: the
// phone that needs reading may be offline, locked or logged out, and this
// card is the one thing a tester can screenshot.
async function readPushLog(): Promise<{ push: string | null; click: string | null }> {
  const empty = { push: null, click: null };
  try {
    if (!("caches" in window)) return empty;
    const cache = await caches.open("netai-push-log");
    const res = await cache.match("/__push-log");
    if (!res) return empty;
    const rows: unknown = await res.json();
    if (!Array.isArray(rows)) return empty;
    const latest = (kind: string): string | null => {
      for (let i = rows.length - 1; i >= 0; i--) {
        const r = rows[i] as PushLog;
        if (r?.kind === kind && typeof r.at === "string") return r.at;
      }
      return null;
    };
    return { push: latest("push"), click: latest("click") };
  } catch {
    return empty;
  }
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // The phone's own clock, because the person reading it is standing next
  // to that phone and comparing it with when they expected the push.
  return d.toLocaleString();
}

function deviceName(ua: string): string {
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  return "?";
}

export default function PushDiagnostics() {
  const s = L[getLocale()];
  const [info, setInfo] = useState<Info | null>(null);
  const [log, setLog] = useState<{ push: string | null; click: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches === true ||
      navigator.standalone === true;
    const permission = "Notification" in window ? Notification.permission : null;
    const device = deviceName(navigator.userAgent);

    const finish = (endpointHost: string | null) => {
      if (alive) setInfo({ standalone, permission, endpointHost, device, deviceId: getDeviceId() });
    };

    void readPushLog().then((l) => { if (alive) setLog(l); });

    if (!("serviceWorker" in navigator)) {
      finish(null);
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (!sub?.endpoint) { finish(null); return; }
        try { finish(new URL(sub.endpoint).host); } catch { finish(sub.endpoint.slice(0, 40)); }
      })
      .catch(() => finish(null));

    return () => { alive = false; };
  }, []);

  if (!info) return null;

  const isIos = info.device === "iPhone" || info.device === "iPad";

  const row = (k: string, v: string) => (
    <div className="flex items-baseline justify-between gap-4">
      <span style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>{k}</span>
      <span className="text-right" style={{ fontSize: "13px", color: "var(--ink)", overflowWrap: "anywhere" }}>{v}</span>
    </div>
  );

  return (
    <div className="card flex flex-col gap-2">
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.title}</h2>
      <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.hint}</p>
      <div className="flex flex-col gap-1.5" style={{ marginTop: "4px" }}>
        {row(s.device, info.device)}
        {row(s.deviceId, info.deviceId.slice(-12))}
        {row(s.installed, info.standalone ? s.yes : s.no)}
        {row(s.permission, info.permission ?? s.unavailable)}
        {row(s.service, info.endpointHost ?? s.none)}
        {log && row(s.lastPush, log.push ? shortTime(log.push) : s.never)}
        {log && row(s.lastTap, log.click ? shortTime(log.click) : s.never)}
      </div>
      {isIos && !info.standalone && (
        <p style={{ fontSize: "12px", color: "var(--danger)", marginTop: "2px" }}>{s.tabNote}</p>
      )}
      {/* Row 6: the only "turn notifications on" control used to live inside a
          single thread page, so anyone who stayed on the list or the profile
          had no way to grant permission at all. It renders nothing once
          permission is granted. */}
      <div style={{ marginTop: "2px" }}>
        <NotificationButton />
      </div>
    </div>
  );
}
