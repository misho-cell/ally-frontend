"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { authHeaders } from "@/lib/deviceId";
import { onCheckoutCompleted } from "@/lib/paddle";
import { startStripeTopup } from "@/lib/stripe";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import { clearUserName } from "@/lib/user";
import { openStripePortal, portalErrorText, cancelSubscription, resumeSubscription } from "@/lib/stripe";
import PushDiagnostics from "@/components/PushDiagnostics";
import MicDiagnostics from "@/components/MicDiagnostics";
import LanguageCard from "@/components/LanguageCard";
import NotificationsCard from "@/components/NotificationsCard";
import ReferralRewardsCard from "@/components/ReferralRewardsCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { parseTokenBalance, type TokenBalance } from "@/lib/tokens";
import {
  applyDiagnosticsFromLocation,
  subscribeDiagnostics,
  diagnosticsSnapshot,
  diagnosticsServerSnapshot,
} from "@/lib/diagnostics";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const MCP_URL = "https://api.netai.guru/mcp";
const PHOTO_URL = `${BASE_URL}/profile/photo`;
const PHOTO_MAX_BYTES = 300 * 1024;

// Screen-local strings (phone locale: ka → Georgian, else English).
// Georgian: no em-dashes, never italic.
const L = {
  en: {
    backChat: "← Chat",
    title: "Profile",
    tokens: "Tokens",
    renews: (d: string) => `Renews ${d}`,
    perWeek: "weekly",
    perMonth: "monthly",
    // Row 235/250 (24 Sept). This used to read "2,586 of 250 used this
    // period", with a bar beside it pinned at 100%. Every part of that is
    // true and the whole of it is false: the grant is not a ceiling. Spending
    // continues out of the balance once the grant is used, and the balance is
    // the only thing checked before a run. Lika was ten times "over" a number
    // that never stopped anything, while the number that does is printed
    // directly above it.
    // Row 235, reopened 25 Sept. A real person read "465" and then
    // "482 used this period · 250 arrives weekly" and could not say whether
    // she had 465, whether she had spent 482, when, or what the 250 was. Each
    // number was true and none of them was attached to its question. So the
    // big number is labelled, and the rest is one sentence in the order a
    // person asks it: what is left, what went, what comes back and when.
    left: "left",
    spentThisWeek: (spent: string) => `You spent ${spent} this week.`,
    spentThisMonth: (spent: string) => `You spent ${spent} this month.`,
    addedWeekly: (granted: string, d: string) => `${granted} is added every week, next on ${d}.`,
    addedMonthly: (granted: string, d: string) => `${granted} is added every month, next on ${d}.`,
    addedWeeklyNoDate: (granted: string) => `${granted} is added every week.`,
    addedMonthlyNoDate: (granted: string) => `${granted} is added every month.`,
    trialBalance: "Trial balance — subscribe to keep going",
    addTokens: "Add tokens",
    tokensAdded: "Tokens added",
    earnings: "My earnings",
    earningsSub: "Invite friends, earn from their subscriptions",
    claudeTitle: "Netai in Claude",
    claudeBody: "Use your Netai network directly from Claude — search, intro requests and replies, without leaving the chat.",
    claudeBadge: "Requires a paid claude.ai plan (Pro/Team)",
    copy: "Copy",
    copied: "Copied!",
    claudeSteps: [
      "Open claude.ai → Settings → Connectors",
      "Click “Add custom connector”",
      "Name: Netai, URL: paste the address you copied → Add",
      "Click “Connect” → enter your phone number → WhatsApp code",
    ],
    claudeTip: "Tip: in the connector settings, set “Read-only tools” to “Allowed” so searches don’t ask for confirmation every time",
    claudeNote: "Claude will always ask you before sending an intro request — nothing is sent behind your back.",
    subscription: "Subscription",
    choosePlan: "Choose a plan",
    manageSub: "Manage subscription",
    signOut: "Sign out",
    trialLabel: (tier: string) => `${tier} Trial`,
    daysLeft: (n: number) => (n > 0 ? `${n} days left in trial` : "Trial ended"),
    autoCharge: (d: string) => `${d} — automatic charge`,
    activeLabel: (tier: string) => `${tier} — Active`,
    nextPayment: (d: string) => `Next payment: ${d}`,
    paymentIssue: "Payment issue",
    paymentFailedBody: "We couldn't charge your card. Update it to keep your access.",
    changeCard: "Update card",
    trialEndsBanner: (d: string) => `Free trial ends ${d}`,
    canceled: "Canceled",
    continuesUntil: (tier: string, d: string) => `${tier} continues until ${d}`,
    endsOn: (d: string) => `Ends on ${d}. It will not renew.`,
    freePlan: "Free plan",
    tapChoose: "Tap below to choose a plan.",
    portalError: "Couldn't open the portal. Please try again.",
    // #497 (2 Oct). Cancelling ends the plan at the close of the paid period,
    // so the question names that date: "cancel" with no date reads as "it
    // stops now", and somebody who has paid for this month keeps this month.
    addContacts: "Add new contacts",
    addContactsSub: "People you have saved on your phone since last time",
    cancelPlan: "Cancel subscription",
    keepPlan: "Keep it",
    cancelPlanAsk: (d: string) => `The plan will not renew. You keep everything until ${d}, and nothing is charged after that.`,
    cancelPlanAskNoDate: "The plan will not renew. You keep everything until the end of the period already paid for.",
    resumePlan: "Resume",
    // A plan the team granted has no Stripe subscription behind it. Saying
    // "couldn't cancel" would describe a fault; this describes what is true.
    grantedPlan: "This plan was given to you by the team, so there is nothing to cancel here.",
    genericError: "Something went wrong",
    editProfile: "Edit profile",
    nameLabel: "Name",
    employerLabel: "Employer",
    jobLabel: "Position",
    linkLabel: "Link (LinkedIn, website)",
    cityLabel: "City",
    save: "Save",
    saved: "Saved",
    nameRequired: "Name can't be empty",
    dataRights: "Data & privacy",
    // #1920 (7 Oct): the download lives one screen in, and nothing on this
    // card said so, so nobody found it.
    dataRightsSub: "See what we store, download it, or delete your account",
    diagOff: "Diagnostics are on for this browser. Open /profile?diag=0 to hide them again.",
    blocked: "Blocked",
    blockedSub: "People the assistant will not contact or suggest",
    changePhoto: "Change photo",
    removePhoto: "Remove",
    photoError: "Couldn't upload the photo. Try another image.",
  },
  ka: {
    backChat: "← ჩეთი",
    title: "პროფილი",
    tokens: "ტოკენები",
    renews: (d: string) => `განახლდება: ${d}`,
    perWeek: "კვირაში",
    perMonth: "თვეში",
    left: "დაგრჩა",
    spentThisWeek: (spent: string) => `ამ კვირაში დახარჯე ${spent}.`,
    spentThisMonth: (spent: string) => `ამ თვეში დახარჯე ${spent}.`,
    addedWeekly: (granted: string, d: string) => `ყოველ კვირას ემატება ${granted}, შემდეგი ${d}.`,
    addedMonthly: (granted: string, d: string) => `ყოველ თვეს ემატება ${granted}, შემდეგი ${d}.`,
    addedWeeklyNoDate: (granted: string) => `ყოველ კვირას ემატება ${granted}.`,
    addedMonthlyNoDate: (granted: string) => `ყოველ თვეს ემატება ${granted}.`,
    trialBalance: "საცდელი ბალანსი. გასაგრძელებლად გამოიწერე.",
    addTokens: "ტოკენების დამატება",
    tokensAdded: "ტოკენები დაემატა",
    earnings: "ჩემი შემოსავალი",
    earningsSub: "დაპატიჟე მეგობრები და მიიღე წილი მათი გამოწერებიდან",
    claudeTitle: "Netai Claude-ში",
    claudeBody: "გამოიყენე შენი Netai ქსელი პირდაპირ Claude-დან: ძიება, გაცნობის თხოვნები და პასუხები, ჩეთიდან გაუსვლელად.",
    claudeBadge: "საჭიროა claude.ai-ს ფასიანი გეგმა (Pro/Team)",
    copy: "კოპირება",
    copied: "დაკოპირდა!",
    claudeSteps: [
      "გახსენი claude.ai → Settings → Connectors",
      "დააჭირე „Add custom connector“",
      "Name: Netai, URL: ჩასვი დაკოპირებული მისამართი → Add",
      "დააჭირე „Connect“ → ჩაწერე შენი ნომერი → WhatsApp კოდი",
    ],
    claudeTip: "რჩევა: კონექტორის პარამეტრებში „Read-only tools“ გადართე „Allowed“-ზე, რომ ძიება ყოველაზე დადასტურებას არ ითხოვდეს",
    claudeNote: "Claude ყოველთვის გკითხავს გაცნობის თხოვნის გაგზავნამდე. შენს ზურგს უკან არაფერი იგზავნება.",
    subscription: "გამოწერა",
    choosePlan: "აირჩიე გეგმა",
    manageSub: "გამოწერის მართვა",
    signOut: "გასვლა",
    trialLabel: (tier: string) => `${tier} საცდელი`,
    daysLeft: (n: number) => (n > 0 ? `საცდელ პერიოდში დარჩა ${n} დღე` : "საცდელი პერიოდი დასრულდა"),
    autoCharge: (d: string) => `${d}: ავტომატური გადახდა`,
    activeLabel: (tier: string) => `${tier}: აქტიური`,
    nextPayment: (d: string) => `შემდეგი გადახდა: ${d}`,
    paymentIssue: "გადახდის პრობლემა",
    paymentFailedBody: "ბარათიდან თანხის ჩამოჭრა ვერ მოხერხდა. განაახლე ბარათი, რომ წვდომა შეინარჩუნო.",
    changeCard: "ბარათის შეცვლა",
    trialEndsBanner: (d: string) => `უფასო პერიოდი მთავრდება ${d}`,
    canceled: "გაუქმებული",
    continuesUntil: (tier: string, d: string) => `${tier} გაგრძელდება ${d}-მდე`,
    endsOn: (d: string) => `მთავრდება ${d}. ავტომატურად აღარ განახლდება.`,
    freePlan: "უფასო გეგმა",
    tapChoose: "გეგმის ასარჩევად დააჭირე ქვემოთ.",
    portalError: "პორტალი ვერ გაიხსნა. სცადე თავიდან.",
    addContacts: "ახალი კონტაქტების დამატება",
    addContactsSub: "ვინც ბოლო დროს შეინახე ტელეფონში",
    cancelPlan: "გამოწერის გაუქმება",
    keepPlan: "დავტოვოთ",
    cancelPlanAsk: (d: string) => `გამოწერა აღარ განახლდება. ${d}-მდე ყველაფერი გრჩება და შემდეგ თანხა აღარ ჩამოგეჭრება.`,
    cancelPlanAskNoDate: "გამოწერა აღარ განახლდება. უკვე გადახდილი პერიოდის ბოლომდე ყველაფერი გრჩება.",
    resumePlan: "განახლება",
    grantedPlan: "ეს გეგმა გუნდმა მოგცა, ამიტომ აქ გასაუქმებელი არაფერია.",
    genericError: "რაღაც შეცდომა მოხდა",
    editProfile: "პროფილის რედაქტირება",
    nameLabel: "სახელი",
    employerLabel: "სამსახური",
    jobLabel: "თანამდებობა",
    linkLabel: "ბმული (LinkedIn, ვებგვერდი)",
    cityLabel: "ქალაქი",
    save: "შენახვა",
    saved: "შენახულია",
    nameRequired: "სახელი აუცილებელია",
    dataRights: "მონაცემები და კონფიდენციალურობა",
    dataRightsSub: "ნახე რას ვინახავთ, გადმოწერე ან წაშალე ანგარიში",
    diagOff: "დიაგნოსტიკა ჩართულია ამ ბრაუზერში. დასამალად გახსენი /profile?diag=0",
    blocked: "დაბლოკილები",
    blockedSub: "ვისაც ასისტენტი არ დაუკავშირდება და არ შემოგთავაზებს",
    changePhoto: "ფოტოს შეცვლა",
    removePhoto: "წაშლა",
    photoError: "ფოტო ვერ აიტვირთა. სცადე სხვა სურათი.",
  },
};

function useStrings() {
  return L[getLocale()];
}

type Profile = {
  name: string;
  phone: string;
  employer?: string | null;
  // #504 (2 Oct): an http(s) address, up to 300 characters, or null.
  link?: string | null;
  job_position?: string | null;
  city?: string | null;
  referral_code?: string | null;
  subscription_tier: "free" | "premium" | "pro" | "enterprise";
  subscription_status: "trialing" | "active" | "past_due" | "canceled" | "unpaid" | "inactive" | "";
  trial_ends_at: string | null;
  current_period_ends_at: string | null;
  subscription_status_changed_at?: string | null;
  // Row 248 (24 Sept). When the subscription is scheduled to stop, this is
  // when. Null means it is not scheduled to stop, so the payment really is
  // automatic.
  //
  // The date, NOT the flag. The backend first named cancel_at_period_end and
  // then measured live Stripe: the one account that has actually cancelled
  // has cancel_at set to the second of its period end and that flag FALSE.
  // Stripe treats "cancel at period end" and "cancel at this timestamp" as
  // two ways to arrange the same thing, and reading the flag would have left
  // this person told their payment was automatic days before it stopped —
  // looking exactly like the server fix having failed. The flag is how the
  // cancellation was arranged; the date is whether there is one.
  cancels_at?: string | null;
};

// Row 282: one wallet shape for the whole app, parsed in lib/tokens, where a
// field the server did not send stays null instead of becoming a zero.
// Task 34 (9 Sept, D133): the server owns the reset date and the window; the
// client no longer computes "first of next month" itself.

type TopupPackage = {
  id: number;
  paddlePriceId: string;
  tokens: number;
  label: string;
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  premium: "Premium",
  pro: "Pro",
  enterprise: "Enterprise",
};

function daysUntil(dateStr: string): number {
  return Math.max(0, Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000));
}

function nextRenewalDate(): string {
  const now = new Date();
  return fmtDateLoc(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

function fmtTokens(n: number): string {
  return Number(n).toLocaleString("en-US");
}

// Group a +995XXXXXXXXX number with spaces for display: +995 599 93 41 75.
// Anything that doesn't match stays as-is (never alter the digits).
function groupPhone(phone: string): string {
  const m = phone.match(/^(\+995)(\d{3})(\d{2})(\d{2})(\d{2})$/);
  return m ? `${m[1]} ${m[2]} ${m[3]} ${m[4]} ${m[5]}` : phone;
}

// Pull the price out of a top-up package label ("500 ტოკენი — $10.99").
// Prices always come from the backend label — never hardcoded.
function priceFromLabel(label: string): string | null {
  const m = label.match(/\$[\d.,]+/);
  return m ? m[0] : null;
}

// Downscale a picked image on the client (max side 512, JPEG) so the encoded
// payload fits the backend's 300KB decoded limit. Tries decreasing quality
// steps; null when even the lowest step doesn't fit (huge flat PNGs etc.).
async function downscalePhoto(file: File): Promise<{ mime: string; base64: string } | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode"));
      img.src = url;
    });
    const scale = Math.min(1, 512 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality)
      );
      if (blob && blob.size <= PHOTO_MAX_BYTES) {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
          reader.onerror = () => reject(new Error("read"));
          reader.readAsDataURL(blob);
        });
        return { mime: "image/jpeg", base64 };
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Profile photo avatar: shows GET /profile/photo when present (auth header
// needed, so it's fetched into a blob URL, never an <img src> straight to the
// API), otherwise the initial. Upload downsizes client-side, PUTs base64.
function PhotoAvatar({ name }: { name: string }) {
  const s = useStrings();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  function setBlobUrl(url: string | null) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = url;
    setPhotoUrl(url);
  }

  useEffect(() => {
    let cancelled = false;
    fetch(PHOTO_URL, { headers: authHeaders() })
      .then(async (r) => {
        if (!r.ok || cancelled) return;
        const blob = await r.blob();
        if (!cancelled) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setErr(null);
    const packed = await downscalePhoto(file);
    if (!packed) {
      setErr(s.photoError);
      setBusy(false);
      return;
    }
    try {
      await apiFetch("/profile/photo", {
        method: "PUT",
        body: { mime: packed.mime, data_base64: packed.base64 },
      });
      const bytes = atob(packed.base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      setBlobUrl(URL.createObjectURL(new Blob([arr], { type: packed.mime })));
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : s.photoError);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setErr(null);
    try {
      await apiFetch("/profile/photo", { method: "DELETE" });
      setBlobUrl(null);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : s.genericError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5" style={{ flex: "0 0 auto" }}>
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          style={{ width: 48, height: 48, borderRadius: "50%", objectFit: "cover" }}
        />
      ) : (
        <div className="initial-avatar" style={{ width: 48, height: 48, fontSize: "18px" }}>
          {name.charAt(0).toUpperCase()}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent-strong)" }}
        >
          {busy ? "…" : s.changePhoto}
        </button>
        {photoUrl && !busy && (
          <button
            type="button"
            onClick={remove}
            style={{ fontSize: "11px", fontWeight: 600, color: "var(--danger)" }}
          >
            {s.removePhoto}
          </button>
        )}
      </div>
      {err && <p style={{ fontSize: "11px", color: "var(--danger)", textAlign: "center" }}>{err}</p>}
    </div>
  );
}

// #504: a stored value only becomes a link when it parses as http(s). Not a
// pattern test — the URL parser is the thing that actually decides what a
// browser will follow, and "looks like a url" and "is one" are the pair this
// field cannot afford to confuse.
function safeLink(raw: string | null | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

// Edit profile (E9): name / employer / position / city via PATCH /profile.
// Empty optional fields are sent as null (the contract's "clear" value); name
// can never be emptied — asks are sent under it.
function EditProfileCard({ profile, onSaved }: { profile: Profile; onSaved: (p: Partial<Profile>) => void }) {
  const s = useStrings();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.name);
  const [employer, setEmployer] = useState(profile.employer ?? "");
  const [job, setJob] = useState(profile.job_position ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [link, setLink] = useState(profile.link ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErr(s.nameRequired);
      return;
    }
    setSaving(true);
    setErr(null);
    setMsg(null);
    const body = {
      name: name.trim(),
      employer: employer.trim() || null,
      job_position: job.trim() || null,
      city: city.trim() || null,
      // #504: an empty box means "clear it", which is the contract's null —
      // sending "" would store an address that is not one.
      link: link.trim() || null,
    };
    try {
      await apiFetch("/profile", { method: "PATCH", body });
      onSaved(body);
      // Keep the cached sidebar name in sync with the new profile name.
      try { localStorage.setItem("netai_profile_name", body.name); } catch {}
      setMsg(s.saved);
      setTimeout(() => setMsg(null), 2400);
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : s.genericError);
    } finally {
      setSaving(false);
    }
  }

  const field = (label: string, value: string, set: (v: string) => void, required?: boolean) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs" style={{ color: "var(--ink-soft)" }}>{label}</label>
      <input
        type="text"
        value={value}
        required={required}
        onChange={(e) => set(e.target.value)}
        className="input-pill"
      />
    </div>
  );

  return (
    <div className="card flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.editProfile}</h2>
        <span style={{ color: "var(--meta)", fontSize: "12px" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <form onSubmit={save} className="flex flex-col gap-3">
          {field(s.nameLabel, name, setName, true)}
          {field(s.employerLabel, employer, setEmployer)}
          {field(s.jobLabel, job, setJob)}
          {field(s.cityLabel, city, setCity)}
          {/* type="url" so a phone offers the right keyboard; the server is
              still the one that decides what a valid address is, and its 400
              is shown verbatim rather than guessed at here. */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs" style={{ color: "var(--ink-soft)" }}>{s.linkLabel}</label>
            <input
              type="url"
              inputMode="url"
              maxLength={300}
              value={link}
              onChange={(e) => setLink(e.target.value)}
              className="input-pill"
            />
          </div>
          {err && <p className="text-sm" style={{ color: "var(--danger)" }}>{err}</p>}
          {msg && <p className="text-sm" style={{ color: "var(--accent-strong)" }}>{msg}</p>}
          <button type="submit" disabled={saving || !name.trim()} className="btn-primary self-start disabled:opacity-60">
            {saving ? "…" : s.save}
          </button>
        </form>
      )}
    </div>
  );
}

// Static "add Netai to your Claude" guide — no API involved. Collapsible so
// the profile stays compact.
function AllyInClaudeCard() {
  const s = useStrings();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }

  return (
    <div className="card flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.claudeTitle}</h2>
        <span style={{ color: "var(--meta)", fontSize: "12px" }}>{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="flex flex-col gap-4">
          <p style={{ font: "400 13.5px/21px var(--font-system)", color: "var(--ink-2)" }}>
            {s.claudeBody}
          </p>

          <span
            className="self-start rounded-full px-3 py-1"
            style={{ background: "var(--accent-tint)", color: "var(--accent-strong)", fontSize: "12px", fontWeight: 600 }}
          >
            {s.claudeBadge}
          </span>

          {/* Copy URL */}
          <div className="flex items-center gap-2">
            <code
              className="flex-1 truncate px-3 py-2.5 text-xs"
              style={{
                color: "var(--ink)",
                background: "var(--sidebar-bg)",
                border: "1px solid var(--sidebar-border)",
                borderRadius: "var(--radius-tile)",
              }}
            >
              {MCP_URL}
            </code>
            <button type="button" onClick={copyUrl} className="btn-primary shrink-0" style={{ padding: "8px 16px", fontSize: "12px" }}>
              {copied ? s.copied : s.copy}
            </button>
          </div>

          {/* Steps */}
          <ol className="flex flex-col gap-2 pl-5" style={{ color: "var(--ink)", listStyleType: "decimal", fontSize: "13.5px", lineHeight: "21px" }}>
            {s.claudeSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            <li>
              <span style={{ color: "var(--meta)" }}>{s.claudeTip}</span>
            </li>
          </ol>

          <p
            className="px-3 py-2.5 text-xs"
            style={{ color: "var(--meta)", background: "var(--sidebar-bg)", borderRadius: "var(--radius-tile)" }}
          >
            {s.claudeNote}
          </p>
        </div>
      )}
    </div>
  );
}

// Token wallet card. Ticket 6 #9: the headline number is `balance` alone
// (top-ups and manual credits live there, so it can exceed the grant); the
// bar shows spentThisPeriod / grantedThisPeriod, capped at 100%.
function TokensWidget() {
  const s = useStrings();
  const [tokens, setTokens] = useState<TokenBalance | null>(null);
  const [failed, setFailed] = useState(false);
  const [packages, setPackages] = useState<TopupPackage[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const balanceRef = useRef<number | null>(null);

  async function fetchTokens(): Promise<TokenBalance | null> {
    try {
      const res = await fetch(`${BASE_URL}/billing/tokens`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      const parsed = parseTokenBalance(json);
      if (parsed) {
        setTokens(parsed);
        balanceRef.current = parsed.balance;
        return parsed;
      }
    } catch {}
    return null;
  }

  // Named so that a 404 from the top-up route can re-read it: that 404 means
  // the list on screen is out of date, and the honest response is to refresh
  // it rather than report a payment failure that did not happen.
  async function loadPackages() {
    try {
      const res = await fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() });
      const json = await res.json();
      if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
    } catch {}
  }

  useEffect(() => {
    fetchTokens().then((t) => { if (!t) setFailed(true); });
    void loadPackages();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After checkout completes the webhook credits tokens within seconds — poll
  // the balance every 2s (max 30s) until it grows.
  useEffect(() => {
    const off = onCheckoutCompleted(() => {
      const startBalance = balanceRef.current ?? 0;
      let ticks = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        ticks++;
        const t = await fetchTokens();
        // Row 282: a balance the server did not state cannot be "grew", so a
        // missing number keeps polling rather than announcing a top-up.
        const grew = t?.balance != null && t.balance > startBalance;
        if (grew || ticks >= 15) {
          if (grew) {
            setToast(s.tokensAdded);
            setTimeout(() => setToast(null), 2400);
          }
          if (pollRef.current) clearInterval(pollRef.current);
        }
      }, 2000);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (tokens && !tokens.enabled) return null;
  if (!tokens && !failed) return null; // loading — no empty box

  // Row 282: null all the way through. "We were not told" is not "you have
  // none", and this card is about the person's own money.
  const balance = tokens?.balance != null ? Math.max(0, tokens.balance) : null;
  const granted = tokens?.grantedThisPeriod ?? 0;
  const spent = tokens?.spentThisPeriod != null ? Math.max(0, tokens.spentThisPeriod) : 0;
  const isTrial = granted === 120;
  // Top-up is for subscribers only — trial wallets get the subscribe CTA elsewhere.
  const showTopup = !!tokens && !isTrial && packages.length > 0;

  // Row 292 (2 Oct): packs go through Stripe. The old path swallowed every
  // failure, so a person who pressed buy and went nowhere was told nothing at
  // all. Each outcome now says something, and the one that means "this pack
  // is gone" reloads the list rather than blaming the payment page.
  async function buy(pkg: TopupPackage) {
    const out = await startStripeTopup(pkg.id);
    if (out.kind === "redirected" || out.kind === "cancelled") return;
    if (out.kind === "gone") {
      await loadPackages();
      return;
    }
    setToast(out.message);
    setTimeout(() => setToast(null), 3000);
  }

  return (
    <div className="card flex flex-col gap-3">
      {toast && (
        <div className="toast" role="status" aria-live="polite"><span style={{ marginRight: 4 }}>✓</span>{toast}</div>
      )}
      {/* The renewal date used to sit here, opposite the title, and on a
          narrow phone the two ran together as one word. It belongs in the
          sentence below anyway, where it is next to the number it is about. */}
      <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.tokens}</h2>

      {/* Row 282: the same dash for a balance the server did not state as for
          a request that failed, because they are the same fact — we do not
          know. The one thing this card may not do is print a zero for it. */}
      {failed || !tokens || balance == null ? (
        <p className="text-sm" style={{ color: "var(--meta)" }}>-</p>
      ) : (
        <>
          <div className="flex items-baseline gap-1.5">
            <span style={{ font: "600 28px/34px var(--font-system)", letterSpacing: "-0.3px", color: "var(--ink-strong)" }}>
              {fmtTokens(balance)}
            </span>
            {/* Naming the big number. Unlabelled it was read as a spend, a
                limit and an allowance by the same person in one sitting. */}
            <span style={{ fontSize: "12.5px", color: "var(--meta)" }}>{s.left}</span>
          </div>

          {/* The bar that used to sit here filled towards the grant and
              stopped at 100%, which is a picture of a limit. There is no
              limit to draw: the balance above is what runs out.
              The date is only promised when the server sent one: "next on"
              with a date invented here would be the same fault in a new
              place. */}
          {granted > 0 && (() => {
            const monthly = tokens.window === "calendar_month";
            const when = tokens.resetsAt ? fmtDateLoc(tokens.resetsAt) : null;
            const added = when
              ? (monthly ? s.addedMonthly(fmtTokens(granted), when) : s.addedWeekly(fmtTokens(granted), when))
              : (monthly ? s.addedMonthlyNoDate(fmtTokens(granted)) : s.addedWeeklyNoDate(fmtTokens(granted)));
            return (
              <p className="text-xs" style={{ color: "var(--meta)", lineHeight: 1.5 }}>
                {monthly ? s.spentThisMonth(fmtTokens(spent)) : s.spentThisWeek(fmtTokens(spent))}
                {" "}
                {added}
              </p>
            );
          })()}

          {isTrial && (
            <p className="text-xs" style={{ color: "var(--meta)" }}>{s.trialBalance}</p>
          )}

          {showTopup && (
            <div className="mt-2 flex flex-col gap-2 pt-3" style={{ borderTop: "1px solid var(--skeleton)" }}>
              <p style={{ fontSize: "12.5px", fontWeight: 600, color: "var(--ink-soft)" }}>{s.addTokens}</p>
              <div className="grid grid-cols-3 gap-2.5">
                {packages.map((pkg) => {
                  const price = priceFromLabel(pkg.label);
                  return (
                    <button key={pkg.id} type="button" onClick={() => buy(pkg)} className="tile">
                      <span className="amt">
                        {fmtTokens(pkg.tokens)}
                        <small>{pkg.label.replace(/\s*[—\-·|].*$/, "").replace(/^[\d,.\s]+/, "").trim() || pkg.label}</small>
                      </span>
                      {price && <b>{price}</b>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubscriptionBadge({ profile }: { profile: Profile }) {
  const s = useStrings();
  const { subscription_status, subscription_tier, trial_ends_at, current_period_ends_at, cancels_at } = profile;

  const panel = (dotColor: string, title: string, titleColor: string, body?: string | null, bg?: string) => (
    <div style={{ background: bg ?? "var(--accent-tint)", borderRadius: "var(--radius-tile)", padding: "12px 14px" }}>
      <div className="flex items-center gap-2">
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
        <span style={{ font: "600 13.5px/20px var(--font-system)", color: titleColor }}>{title}</span>
      </div>
      {body && <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--ink-2)", marginTop: "4px" }}>{body}</p>}
    </div>
  );

  if (subscription_status === "trialing" && trial_ends_at) {
    const days = daysUntil(trial_ends_at);
    return panel(
      "var(--accent)",
      s.trialLabel(TIER_LABELS[subscription_tier]),
      "var(--accent-strong)",
      `${s.daysLeft(days)} · ${s.autoCharge(fmtDateLoc(trial_ends_at))}`
    );
  }

  if (subscription_status === "active") {
    // Row 248: a scheduled stop is still an active subscription, and it was
    // being told "next payment" right up to the day it ended.
    if (cancels_at) {
      return panel(
        "var(--request-accent)",
        s.activeLabel(TIER_LABELS[subscription_tier]),
        "var(--request-accent)",
        s.endsOn(fmtDateLoc(cancels_at)),
        "var(--request-tint)"
      );
    }
    return panel(
      "var(--accent)",
      s.activeLabel(TIER_LABELS[subscription_tier]),
      "var(--accent-strong)",
      current_period_ends_at ? s.nextPayment(fmtDateLoc(current_period_ends_at)) : null
    );
  }

  if (subscription_status === "past_due") {
    return panel("var(--danger)", s.paymentIssue, "var(--danger)", s.paymentFailedBody, "var(--terra-tint)");
  }

  if (subscription_status === "canceled" && current_period_ends_at) {
    return panel(
      "var(--request-accent)",
      s.canceled,
      "var(--request-accent)",
      s.continuesUntil(TIER_LABELS[subscription_tier], fmtDateLoc(current_period_ends_at)),
      "var(--request-tint)"
    );
  }

  return panel("var(--meta)", s.freePlan, "var(--ink)", s.tapChoose, "var(--sidebar-bg)");
}

export default function ProfilePage() {
  const s = useStrings();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortal, setShowPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // #497: cancelling and resuming the paid plan without the Stripe page.
  const [askCancel, setAskCancel] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  // Set only after the server has told us this plan was granted by the team.
  // Not guessed from the profile: nothing there distinguishes a granted plan
  // from a paid one, and a wrong guess would either hide a real cancel button
  // or offer one that cannot work.
  const [granted, setGranted] = useState(false);
  // #508. The flag lives in this browser, not in the account, so it is read
  // as an external store: false on the server, the stored answer here.
  const showDiagnostics = useSyncExternalStore(
    subscribeDiagnostics,
    diagnosticsSnapshot,
    diagnosticsServerSnapshot,
  );

  useEffect(() => {
    applyDiagnosticsFromLocation(window.location.search);
  }, []);

  async function reloadProfile() {
    try {
      const res = await apiFetch<{ success: boolean; data: Profile }>("/profile");
      setProfile(res.data);
    } catch {}
  }

  useEffect(() => {
    apiFetch<{ success: boolean; data: Profile }>("/profile")
      .then((res) => setProfile(res.data))
      .catch((err) => setError(err instanceof ApiError ? err.message : s.genericError))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The plan always runs to the end of the period already paid for, so both
  // the question and the result name that date. "Cancelled" on its own reads
  // as "it stops now", which is the one thing that does not happen.
  async function doCancel() {
    setPlanBusy(true);
    setError(null);
    const out = await cancelSubscription();
    setPlanBusy(false);
    setAskCancel(false);
    if (out.kind === "granted") { setGranted(true); return; }
    if (out.kind === "failed") { setError(out.message); return; }
    await reloadProfile();
  }

  async function doResume() {
    setPlanBusy(true);
    setError(null);
    const out = await resumeSubscription();
    setPlanBusy(false);
    if (out.kind === "granted") { setGranted(true); return; }
    if (out.kind === "failed") { setError(out.message); return; }
    await reloadProfile();
  }

  // Stripe (6 Sept): same-tab redirect to the Stripe portal (card change,
  // cancel, invoices). 404 = no Stripe customer yet, so no button at all.
  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    const out = await openStripePortal();
    if (out === "redirected") return;
    setPortalLoading(false);
    if (out === "none") setShowPortal(false);
    else setError(portalErrorText());
  }

  function signOut() {
    clearUserName();
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
    router.replace("/login");
  }

  // Which button (6 Sept): trialing/active → manage; past_due → change card
  // (same portal); canceled/unpaid/inactive/empty → subscribe.
  const status = profile?.subscription_status ?? "";
  const isPastDue = status === "past_due";
  const isFreeOrInactive = !(status === "trialing" || status === "active" || isPastDue);
  // Only a plan that renews can be stopped from renewing. past_due is left
  // out: that account's next step is a working card, and offering to cancel
  // beside "your payment failed" reads as the app suggesting it.
  const isPaidPlan = status === "trialing" || status === "active";

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col gap-3 px-6 py-10 mx-auto" style={{ background: "var(--bg)", maxWidth: "620px" }}>
        <span className="sk-bar" style={{ width: "40%", height: 22 }} />
        <span className="sk-bar" style={{ width: "100%", height: 90, borderRadius: "var(--radius-card)" }} />
        <span className="sk-bar" style={{ width: "100%", height: 140, borderRadius: "var(--radius-card)" }} />
        <span className="sk-bar" style={{ width: "100%", height: 90, borderRadius: "var(--radius-card)" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div
        className="profile-col mx-auto flex flex-col"
        style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/chat"
            className="transition-colors"
            style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}
          >
            {s.backChat}
          </Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>
            {s.title}
          </span>
        </div>

        {error && (
          <div
            className="px-4 py-3 text-sm"
            style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}
          >
            {error}
          </div>
        )}

        {profile && (
          <div className="flex flex-col gap-3.5">
            {/* User card */}
            <div className="card">
              <div className="flex items-center gap-4">
                <PhotoAvatar name={profile.name} />
                <div>
                  <p style={{ fontSize: "16px", fontWeight: 600, color: "var(--ink)" }}>
                    {profile.name}
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--ink-soft)" }}>
                    {groupPhone(profile.phone)}
                  </p>
                  {/* #504 (2 Oct). Rendered only when it really is an http(s)
                      address. The server validates on write, but this is the
                      one field whose value becomes something a person taps,
                      and a row written before that validation — or by any
                      other path — must not be able to turn into a javascript:
                      link because this screen trusted it. Anything else shows
                      as plain text: still visible, just not clickable. */}
                  {safeLink(profile.link) ? (
                    <a
                      href={safeLink(profile.link)!}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="block truncate"
                      style={{ fontSize: "13px", color: "var(--accent-strong)", maxWidth: "15rem" }}
                    >
                      {profile.link}
                    </a>
                  ) : profile.link ? (
                    <p className="truncate" style={{ fontSize: "13px", color: "var(--meta)", maxWidth: "15rem" }}>
                      {profile.link}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Edit profile (E9) */}
            <EditProfileCard
              profile={profile}
              onSaved={(p) => setProfile((prev) => (prev ? { ...prev, ...p } : prev))}
            />

            {/* Referral rewards + code (ticket 6 #5, closes E8/E10) */}
            <ReferralRewardsCard code={profile.referral_code ?? null} />

            {/* Token wallet */}
            <TokensWidget />

            {/* Referral earnings */}
            <Link
              href="/profile/earnings"
              className="card flex items-center justify-between transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cta-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sidebar-border)"; }}
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.earnings}</h2>
                <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                  {s.earningsSub}
                </p>
              </div>
              <span style={{ color: "var(--meta)" }}>→</span>
            </Link>

            {/* #374 (2 Oct). A web page cannot see the phonebook change after
                the first import, so anybody saved to the phone later never
                reached the server and could not be found. This is the same
                picker onboarding uses, which is the point: one import path,
                not a second one that drifts from it. */}
            <Link
              href="/onboarding/contacts?from=profile"
              className="card flex items-center justify-between transition-colors"
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.addContacts}</h2>
                <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                  {s.addContactsSub}
                </p>
              </div>
              <span style={{ color: "var(--meta)" }}>→</span>
            </Link>

            {/* Netai in Claude (MCP connector guide) */}
            <AllyInClaudeCard />

            {/* Subscription card */}
            <div className="card flex flex-col gap-4">
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>
                {s.subscription}
              </h2>

              <SubscriptionBadge profile={profile} />

              {isFreeOrInactive ? (
                <Link href="/pricing" className="btn-primary w-full">
                  {s.choosePlan}
                </Link>
              ) : showPortal ? (
                <button
                  onClick={openPortal}
                  disabled={portalLoading}
                  className={`${isPastDue ? "btn-destructive" : "btn-secondary"} w-full disabled:opacity-60`}
                >
                  {portalLoading ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2" style={{ borderColor: "var(--cta-border)", borderTopColor: "var(--accent-strong)" }} />
                  ) : isPastDue ? (
                    s.changeCard
                  ) : (
                    s.manageSub
                  )}
                </button>
              ) : null}

              {/* #497. Ninia could not cancel: Stripe's page offered her no
                  way to and called the product "Ally". The portal above stays
                  for cards and invoices; stopping the plan happens here.

                  A plan the team granted has no subscription behind it, so
                  the server answers 404 and this says so rather than showing
                  a failure for something that is working as intended. */}
              {granted ? (
                <p style={{ font: "400 12.5px/18px var(--font-system)", color: "var(--ink-2)" }}>
                  {s.grantedPlan}
                </p>
              ) : isPaidPlan ? (
                profile.cancels_at ? (
                  <button onClick={doResume} disabled={planBusy} className="btn-secondary w-full disabled:opacity-60">
                    {s.resumePlan}
                  </button>
                ) : (
                  <button
                    onClick={() => setAskCancel(true)}
                    disabled={planBusy}
                    className="w-full transition-colors disabled:opacity-60"
                    style={{ font: "500 13px/18px var(--font-system)", color: "var(--meta)", padding: "4px 0" }}
                  >
                    {s.cancelPlan}
                  </button>
                )
              ) : null}
            </div>

            {/* Data rights (C2) */}
            <Link
              href="/profile/data"
              className="card flex items-center justify-between transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cta-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sidebar-border)"; }}
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.dataRights}</h2>
                <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                  {s.dataRightsSub}
                </p>
              </div>
              <span style={{ color: "var(--meta)" }}>→</span>
            </Link>

            {/* Row 6 (12 Sept): on-screen push diagnostics — an iPhone has no
                console, so this is the only way a tester can report the three
                values that separate a permission problem from a delivery one.
                #508 (3 Oct): hidden unless this browser was switched on with
                /profile?diag=1. Ninia read the profile cold and these two
                boxes meant nothing to her; they were never written for her. */}
            {showDiagnostics && (
              <>
                <PushDiagnostics />
                <MicDiagnostics />
                {/* Whoever switched these on has to be able to switch them
                    off without being told the trick a second time. The way
                    out belongs next to the thing it undoes. */}
                <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.diagOff}</p>
              </>
            )}

            {/* Row 218 (21 Sept): somewhere to say which language, for the
                people whose phone does not match how they speak. */}
            <LanguageCard />

            <NotificationsCard />

            {/* #505 (3 Oct): blocking has worked from chat for weeks, with
                nowhere to see whom you had blocked and no way to undo it
                without remembering the name. */}
            <Link
              href="/profile/blocked"
              className="card flex items-center justify-between transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--cta-border)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--sidebar-border)"; }}
            >
              <div>
                <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{s.blocked}</h2>
                <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                  {s.blockedSub}
                </p>
              </div>
              <span style={{ color: "var(--meta)" }}>→</span>
            </Link>

            {/* Sign out */}
            <button onClick={signOut} className="btn-destructive py-2 text-center self-center">
              {s.signOut}
            </button>
          </div>
        )}
      </div>
    {/* #497: the question names the date the plan actually runs until —
        trial end or paid period end, whichever this account has. Without a
        date "cancel" reads as "it stops now", and what happens is the
        opposite: everything already paid for is kept. */}
    {askCancel && (
      <ConfirmDialog
        message={(() => {
          const until = profile?.current_period_ends_at ?? profile?.trial_ends_at ?? null;
          return until ? s.cancelPlanAsk(fmtDateLoc(until)) : s.cancelPlanAskNoDate;
        })()}
        confirmLabel={s.cancelPlan}
        cancelLabel={s.keepPlan}
        busy={planBusy}
        onConfirm={doCancel}
        onCancel={() => setAskCancel(false)}
      />
    )}
    </div>
  );
}
