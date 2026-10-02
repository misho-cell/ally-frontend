import { authHeaders, getDeviceId } from "@/lib/deviceId";
import { durableGet, durableSet } from "@/lib/durable";

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
// Not device_id: it is already stable here (a UUID minted once, never
// regenerated) and the backend measured zero device_ids carrying two
// endpoints. That is not because the id rotates. It is because the rows that
// duplicate are older than the field — they were written before device_id was
// sent at all, so they carry none and nothing can match them.
//
// 30 Sept. The backend then measured device_id rotating WITH the endpoint,
// which reads as a flat contradiction of the paragraph above and is not one.
// Nothing rotates the id. The id and ENDPOINT_KEY below simply lived in the
// SAME store, so clearing that store reminted both in the same instant and
// also emptied the `previous_endpoint` that was supposed to link the new row
// to the old — one event defeating all three remedies at once, because all
// three depended on the store it destroyed. Both are kept redundantly now;
// lib/durable is explicit about what that does and does not survive.
//
// Row 111, forty of forty-five people with no subscription: the result was
// thrown away by `catch {}` at both call sites, so "never asked", "asked and
// refused" and "granted and the POST failed" all looked identical from the
// server — three different bugs with one empty log. Every path now returns a
// named outcome and the caller decides what to show.

// Row 276 (27 Sept). Four different answers to "why has this person no push
// subscription" used to look identical from the server: a row simply absent.
// They are not the same and they do not have the same remedy.
//
//   needs_pwa   an iPhone in a Safari tab. Push is impossible there until the
//               app is on the home screen. Nothing in this code can change it.
//   unasked     we could have asked and did not, or asked where they never
//               looked. Mine to fix.
//   denied      they were asked and said no. That deserves respect and an
//               instruction, not another prompt: the browser will not ask
//               again.
//   granted     with no subscription: they said yes and we lost it. Mine, and
//               the worst of the four.
//
// Sent on every open, because a state can change between one and the next.
// The server keeps `state_since` separate from "when we last heard", so
// somebody who refused once and opens the app daily does not read as having
// refused again every day.
const STATE_PATH = "/notifications/state";

function wireState(state: ReturnType<typeof pushState>): string {
  return state === "needs-pwa" ? "needs_pwa" : state;
}

async function reportState(state: ReturnType<typeof pushState>): Promise<void> {
  try {
    await fetch(`${BASE_URL}${STATE_PATH}`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ state: wireState(state), standalone: isStandalone() }),
    });
  } catch {
    // Telling the server why we are quiet must never be the reason we are
    // quiet. A failure here changes nothing the person can see.
  }
}

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

// G-002 (2 Oct). No push between 23:00 and 09:30 in the RECIPIENT's own local
// time; anything in that window is held and delivered at 09:30 their time. The
// server holds each device by its own clock and has never known one, so until
// now every device was held by Tbilisi time — which for anybody elsewhere is
// a phone that buzzes in the night, or goes quiet in the middle of their day.
//
// Sent only when the browser actually names a zone. An empty string is not a
// zone, and re-subscribing with none keeps whatever the server already has, so
// a guess here would overwrite a known zone with a worse one. Absent means
// "we do not know", which the server already handles; an invented value does
// not look like not knowing.
function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim() ? tz : null;
  } catch {
    return null;
  }
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
      ...(() => { const tz = deviceTimeZone(); return tz ? { time_zone: tz } : {}; })(),
      ...(rotated ? { previous_endpoint: previous } : {}),
    }),
  });
  if (!res.ok) return { state: "failed", reason: `subscribe-${res.status}` };
  // Written only after the server has taken it. Storing it earlier would mean
  // a failed POST still looks registered on the next load, and the retry that
  // would have fixed it never happens.
  durableSet(ENDPOINT_KEY, endpoint);
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
  if (state === "unsupported" || state === "needs-pwa" || state === "denied") {
    // Reported before returning: these three are exactly the cases that leave
    // no subscription behind, and they are the ones worth telling apart.
    void reportState(state);
    return { state };
  }
  if (state === "unasked") {
    if (!ask) {
      void reportState("unasked");
      return { state: "unasked" };
    }
    let permission: NotificationPermission;
    try {
      permission = await Notification.requestPermission();
    } catch {
      return { state: "failed", reason: "permission-threw" };
    }
    if (permission !== "granted") return { state: "denied" };
  }

  // From here the permission is granted, whether it always was or was just
  // given. Said once, before the registration is attempted, so that "granted
  // and yet no subscription" is visible even when everything below fails.
  void reportState("granted");

  let reg: ServiceWorkerRegistration;
  try {
    reg = await navigator.serviceWorker.ready;
  } catch {
    return { state: "failed", reason: "no-service-worker" };
  }

  const previous = durableGet(ENDPOINT_KEY);

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
