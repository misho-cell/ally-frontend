import { authHeaders, getDeviceId } from "@/lib/deviceId";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Rows 101 and 111 (24 Sept). One implementation of push registration, because
// there were two — the header button and the chat layout — written apart and
// drifted apart, and between them they produced both faults the backend
// measured.
//
// Row 101, five copies of every notification: each call site asked
// pushManager.subscribe() unconditionally on every load. When the browser had
// silently rotated the endpoint (a reinstall, a browser update, a permission
// reset), that minted a NEW registration beside the old one, and the server
// has no way to retire the old one: a push service only reports 404/410 for a
// registration it considers dead, and these were not dead, just abandoned.
// Two changes fix it, and both are here:
//   * an existing subscription is REUSED, never replaced. Unsubscribing and
//     re-subscribing would hand out a fresh endpoint on every single load,
//     which is the same bug at a faster rate.
//   * when the endpoint HAS rotated, the one it replaced travels with the
//     registration as `previous_endpoint`, so the server can retire exactly
//     that row rather than guessing which of five is stale.
//
// Not device_id: it is already stable here (a UUID minted once into
// localStorage, never regenerated) and the backend measured zero device_ids
// carrying two endpoints. That is not because the id rotates. It is because
// the rows that duplicate are older than the field — they were written before
// device_id was sent at all, so they carry none and nothing can match them.
//
// Row 111, forty of forty-five people with no subscription: the result was
// thrown away by `catch {}` at both call sites, so "never asked", "asked and
// refused" and "granted and the POST failed" all looked identical from the
// server — three different bugs with one empty log. Every path now returns a
// named outcome and the caller decides what to show.

export type PushOutcome =
  // The browser cannot do push at all.
  | { state: "unsupported" }
  // iOS only serves push to a home-screen install, never a Safari tab.
  | { state: "needs-pwa" }
  // The person was asked and said no, or a previous no is remembered.
  | { state: "denied" }
  // Nobody has asked yet. Distinct from "denied": this one is ours to fix.
  | { state: "unasked" }
  // Registered with the server. `rotated` is true when this replaced an
  // endpoint the browser had changed underneath us.
  | { state: "subscribed"; endpoint: string; rotated: boolean }
  // Something broke. `reason` names which step, so the three bugs above stay
  // three bugs.
  | { state: "failed"; reason: string };

const ENDPOINT_KEY = "push_endpoint";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches === true ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** What push could do here, without asking anyone anything. */
export function pushState(): "unsupported" | "needs-pwa" | "denied" | "granted" | "unasked" {
  if (typeof window === "undefined") return "unsupported";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return "unsupported";
  }
  // Checked before permission: on an iPhone in a tab the permission reads
  // "default" and requesting it silently does nothing, which is exactly the
  // shape of "asked and never stored the result".
  if (isIos() && !isStandalone()) return "needs-pwa";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission === "granted") return "granted";
  return "unasked";
}

async function register(subscription: PushSubscription, previous: string | null): Promise<PushOutcome> {
  const sub = subscription.toJSON();
  const endpoint = sub.endpoint ?? "";
  // Only sent when it actually differs. Sending the same endpoint as its own
  // predecessor would ask the server to retire the row it is writing.
  const rotated = Boolean(previous && previous !== endpoint);
  const res = await fetch(`${BASE_URL}/notifications/subscribe`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      ...sub,
      user_agent: navigator.userAgent,
      device_id: getDeviceId(),
      ...(rotated ? { previous_endpoint: previous } : {}),
    }),
  });
  if (!res.ok) return { state: "failed", reason: `subscribe-${res.status}` };
  // Written only after the server has taken it. Storing it earlier would mean
  // a failed POST still looks registered on the next load, and the retry that
  // would have fixed it never happens.
  localStorage.setItem(ENDPOINT_KEY, endpoint);
  return { state: "subscribed", endpoint, rotated };
}

/**
 * Make sure this browser has exactly one live push registration and that the
 * server knows about it. `ask` decides whether the permission prompt may be
 * shown — a button passes true, a background pass on load passes false, so
 * nobody is prompted by simply opening the app.
 */
export async function ensurePushSubscription(ask: boolean): Promise<PushOutcome> {
  const state = pushState();
  if (state === "unsupported" || state === "needs-pwa" || state === "denied") return { state };
  if (state === "unasked") {
    if (!ask) return { state: "unasked" };
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { state: "failed", reason: "permission-threw" };
    }
    if (permission !== "granted") return { state: "denied" };
  }

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch {
    return { state: "failed", reason: "no-service-worker" };
  }

  const previous = localStorage.getItem(ENDPOINT_KEY);

  // The browser is the only party that knows what it already holds. Asking it
  // first is what keeps a second registration from being minted on every load.
  let existing: PushSubscription | null = null;
  try {
    existing = await reg.pushManager.getSubscription();
  } catch {
    existing = null;
  }
  if (existing) {
    // Re-registering a subscription the server already has is cheap and
    // idempotent, and it is what carries `previous_endpoint` up on the first
    // load after a rotation the client never saw happen.
    try {
      return await register(existing, previous);
    } catch {
      return { state: "failed", reason: "subscribe-network" };
    }
  }

  let vapidKey: string;
  try {
    const keyRes = await fetch(`${BASE_URL}/notifications/vapid-public-key`, { headers: authHeaders() });
    if (!keyRes.ok) return { state: "failed", reason: `vapid-${keyRes.status}` };
    const keyJson: unknown = await keyRes.json();
    const holder = keyJson as { data?: { key?: string }; key?: string };
    vapidKey = holder.data?.key ?? holder.key ?? "";
  } catch {
    return { state: "failed", reason: "vapid-network" };
  }
  if (!vapidKey) return { state: "failed", reason: "vapid-empty" };

  let created: PushSubscription;
  try {
    created = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch {
    return { state: "failed", reason: "browser-refused" };
  }

  try {
    return await register(created, previous);
  } catch {
    return { state: "failed", reason: "subscribe-network" };
  }
}
