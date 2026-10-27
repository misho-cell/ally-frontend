"use client";

import { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ProfileSetupSteps from "@/components/ProfileSetupSteps";
import DzIcon from "@/components/DzIcons";
import { apiFetch, ApiError } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";
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
import { copyText, fetchInvite, shareInvite, type Invite } from "@/lib/invite";
import { inviteShareText } from "@/components/ReferralRewardsCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import { isTrialTokens, parseTokenBalance, type TokenBalance } from "@/lib/tokens";
import { clearSessionToken } from "@/lib/session";
import {
  applyDiagnosticsFromLocation,
  subscribeDiagnostics,
  diagnosticsSnapshot,
  diagnosticsServerSnapshot,
} from "@/lib/diagnostics";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
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
    lastTopUp: (amount: string, d: string) => `Last top-up: ${amount}, ${d}`,
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
    moneyTitle: "Plan and money",
    moneyTabs: { plan: "Plan", tokens: "Tokens", earnings: "Earnings", invite: "Invite" },
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
    lastImport: (d: string, n: number) => `Last upload ${d}, ${n} contacts`,
    monthlyReminder: "Monthly reminder",
    monthlyReminderFailed: "Could not save. Try again.",
    whatsapp: "Messages in WhatsApp",
    whatsappSoon: "Coming soon",
    whatsappWelcome: "We sent you a message in WhatsApp",
    claudeConnected: "Claude is connected",
    myContacts: "My contacts",
    myContactsSub: "Search, and what you have saved about each person",
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
    exportNav: "Download my data",
    // #1920 (7 Oct): the download lives one screen in, and nothing on this
    // card said so, so nobody found it.
    dataRightsSub: "See what we store, download it, or delete your account",
    diagOff: "Diagnostics are on for this browser. Open /profile?diag=0 to hide them again.",
    blocked: "Blocked",
    blockedSub: "People the assistant will not contact or suggest",
    changePhoto: "Change photo",
    removePhoto: "Remove",
    photoError: "Couldn't upload the photo. Try another image.",
    // 13 Oct, FIXED2 account drawer.
    close: "Close",
    personal: "Personal account",
    grpMine: "My Netai",
    assistantTitle: "My assistant",
    assistantLabel: "Assistant's name",
    assistantSave: "Save",
    grpMoney: "Money",
    grpContacts: "Contacts",
    grpSettings: "Settings",
    questionsNav: "Questions about you",
    peopleNav: "People settings",
    factsNav: "Facts kept about me",
    requestsNav: "My introduction requests",
    profileSmall: "Personal information",
    phoneLabel: "Phone number",
    saveProfile: "Save profile",
    inviteTitle: "Invite a friend",
    inviteSmall: "Invite friends and earn rewards",
    codeLabel: "Code to share",
    inviteFriend: "Invite a friend",
    copyLink: "Copy link",
    tokensWeek: (day: string | null, n: string) => (day ? `This week · ${n} is added ${day}` : `This week · ${n} is added`),
    tokensMonth: (date: string | null, n: string) => (date ? `This month · ${n} is added on ${date}` : `This month · ${n} is added`),
    weekdays: ["on Sunday", "on Monday", "on Tuesday", "on Wednesday", "on Thursday", "on Friday", "on Saturday"],
    of: (n: string) => `of ${n}`,
    used: (n: string) => `${n} used`,
    tokenUnit: "tokens",
    planTitle: "Current plan",
    manage: "Manage",
    cancelShort: "Cancel",
    langSmall: "Interface and replies",
    earningsNav: "My earnings",
    claudeNav: "Netai in Claude",
    syncNav: "Contact sync",
    setupNav: "Set up a device",
    langTitle: "Language",
  },
  ka: {
    backChat: "← ჩეთი",
    title: "პროფილი",
    tokens: "ტოკენები",
    renews: (d: string) => `განახლდება: ${d}`,
    perWeek: "კვირაში",
    perMonth: "თვეში",
    left: "დაგრჩა",
    lastTopUp: (amount: string, d: string) => `ბოლო შევსება: ${amount}, ${d}`,
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
    moneyTitle: "გეგმა და თანხები",
    moneyTabs: { plan: "გეგმა", tokens: "ტოკენები", earnings: "შემოსავალი", invite: "მოწვევა" },
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
    lastImport: (d: string, n: number) => `ბოლო ატვირთვა ${d}, ${n} კონტაქტი`,
    monthlyReminder: "თვიური შეხსენება",
    monthlyReminderFailed: "ვერ შეინახა. სცადე თავიდან.",
    whatsapp: "შეტყობინებები WhatsApp-ში",
    whatsappSoon: "მალე ჩაირთვება",
    whatsappWelcome: "WhatsApp-ში შეტყობინება გამოგიგზავნეთ",
    claudeConnected: "Claude დაკავშირებულია",
    myContacts: "ჩემი კონტაქტები",
    myContactsSub: "ძებნა და რა გაქვს შენახული თითოეულზე",
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
    exportNav: "მონაცემების გადმოწერა",
    dataRightsSub: "ნახე რას ვინახავთ, გადმოწერე ან წაშალე ანგარიში",
    diagOff: "დიაგნოსტიკა ჩართულია ამ ბრაუზერში. დასამალად გახსენი /profile?diag=0",
    blocked: "დაბლოკილები",
    blockedSub: "ვისაც ასისტენტი არ დაუკავშირდება და არ შემოგთავაზებს",
    changePhoto: "ფოტოს შეცვლა",
    removePhoto: "წაშლა",
    photoError: "ფოტო ვერ აიტვირთა. სცადე სხვა სურათი.",
    close: "დახურვა",
    personal: "პირადი ანგარიში",
    grpMine: "ჩემი Netai",
    assistantTitle: "ჩემი ასისტენტი",
    assistantLabel: "ასისტენტის სახელი",
    assistantSave: "შენახვა",
    grpMoney: "ფული",
    grpContacts: "კონტაქტები",
    grpSettings: "პარამეტრები",
    questionsNav: "კითხვები შენზე",
    peopleNav: "ადამიანების პარამეტრები",
    factsNav: "ჩემზე შენახული ფაქტები",
    requestsNav: "ჩემი თხოვნების მდგომარეობა",
    profileSmall: "პირადი ინფორმაცია",
    phoneLabel: "ტელეფონის ნომერი",
    saveProfile: "პროფილის შენახვა",
    inviteTitle: "მეგობრის მოწვევა",
    inviteSmall: "მოიწვიე მეგობრები და მიიღე ჯილდო",
    codeLabel: "კოდი გასაზიარებლად",
    inviteFriend: "მეგობრის მოწვევა",
    copyLink: "ბმულის დაკოპირება",
    tokensWeek: (day: string | null, n: string) => (day ? `ეს კვირა · ${day} ${n} ემატება` : `ეს კვირა · ${n} ემატება`),
    tokensMonth: (date: string | null, n: string) => (date ? `ეს თვე · ${date} ${n} ემატება` : `ეს თვე · ${n} ემატება`),
    weekdays: ["კვირას", "ორშაბათს", "სამშაბათს", "ოთხშაბათს", "ხუთშაბათს", "პარასკევს", "შაბათს"],
    of: (n: string) => `${n}-დან`,
    used: (n: string) => `${n} გამოყენებული`,
    tokenUnit: "ტოკენი",
    planTitle: "მიმდინარე გეგმა",
    manage: "მართვა",
    cancelShort: "გაუქმება",
    langSmall: "ინტერფეისი და პასუხები",
    earningsNav: "ჩემი შემოსავალი",
    claudeNav: "Netai Claude-ში",
    syncNav: "კონტაქტების სინქრონი",
    setupNav: "მოწყობილობის დაყენება",
    langTitle: "ენა",
  },
};

function useStrings() {
  return L[getLocale()];
}

type Profile = {
  name: string;
  // 0316 (14 Oct): null is the default name; absent means a server from
  // before the field, and then the section is not drawn at all.
  assistant_name?: string | null;
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

// Profile photo: GET /profile/photo when present (auth header needed, so it
// is fetched into a blob URL, never an <img src> straight to the API),
// otherwise the initial. Upload downsizes client-side and PUTs base64.
// 13 Oct: a hook, because the design draws the photo in the drawer's head
// while its remove link sits with the fields below.
function usePhoto() {
  const s = useStrings();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // A callback ref held in state: the head's avatar opens the picker, and a
  // ref object read during render is what the lint rules forbid.
  const [input, setInput] = useState<HTMLInputElement | null>(null);

  function setBlobUrl(url: string | null) {
    setPhotoUrl(url);
  }

  // Each blob URL is revoked once it is replaced or the page goes away.
  useEffect(() => {
    if (!photoUrl) return;
    return () => URL.revokeObjectURL(photoUrl);
  }, [photoUrl]);

  useEffect(() => {
    let cancelled = false;
    fetch(PHOTO_URL, { headers: authHeaders() })
      .then(async (r) => {
        // Only an image is a photo: anything else (an error page, JSON from
        // a proxy) would draw as a broken picture with a „remove" beside it.
        if (!r.ok || cancelled || !(r.headers.get("content-type") ?? "").startsWith("image/")) return;
        const blob = await r.blob();
        if (!cancelled) setPhotoUrl(URL.createObjectURL(blob));
      })
      .catch(() => {});
    return () => { cancelled = true; };
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

  const pick = () => input?.click();
  return { photoUrl, busy, err, setInput, pick, onPick, remove };
}

// 10 Oct (GET /contacts/import-state): when the last import that brought
// contacts happened, and how many. Nothing is drawn for someone who never
// imported, or when the server cannot say: an unknown date is not "never".
function LastImportLine() {
  const s = useStrings();
  const [info, setInfo] = useState<{ at: string; n: number } | null>(null);
  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/contacts/import-state")
      .then((raw) => {
        const d = unwrapData(raw);
        if (!alive || !isRecord(d)) return;
        if (typeof d.last_import_at === "string" && typeof d.last_import_count === "number") {
          setInfo({ at: d.last_import_at, n: d.last_import_count });
        }
      })
      .catch(() => { /* nothing drawn */ });
    return () => { alive = false; };
  }, []);
  if (!info) return null;
  return <small>{s.lastImport(fmtDateLoc(info.at, { day: "numeric", month: "short" }), info.n)}</small>;
}

// 11 Oct: the monthly-reminder switch. Only the server's `monthly_reminder`
// draws it: an unknown value draws no switch, so "could not read it" never
// looks like "off". A tap sends the opposite, then shows the server's answer.
function MonthlyReminderRow() {
  const s = useStrings();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/contacts/import-state")
      .then((raw) => {
        const d = unwrapData(raw);
        if (alive && isRecord(d) && typeof d.monthly_reminder === "boolean") setOn(d.monthly_reminder);
      })
      .catch(() => { /* no switch */ });
    return () => { alive = false; };
  }, []);
  if (on === null) return null;

  async function toggle() {
    if (busy || on === null) return;
    setBusy(true);
    setFailed(false);
    try {
      const d = unwrapData(await apiFetch<unknown>("/contacts/import-state", { method: "PUT", body: { monthly_reminder: !on } }));
      if (isRecord(d) && typeof d.monthly_reminder === "boolean") setOn(d.monthly_reminder);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pd-switch-row">
      <span>
        {s.monthlyReminder}
        {failed && <small role="status" style={{ display: "block", fontSize: 12, color: "var(--danger)" }}>{s.monthlyReminderFailed}</small>}
      </span>
      <SwitchButton on={on} busy={busy} label={s.monthlyReminder} onClick={toggle} />
    </div>
  );
}

function SwitchButton({ on, busy, label, onClick }: { on: boolean; busy: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={busy}
      onClick={onClick}
      className="relative shrink-0 rounded-full transition-colors"
      style={{ width: 44, height: 26, background: on ? "var(--accent)" : "var(--skeleton)", opacity: busy ? 0.6 : 1 }}
    >
      <span
        className="absolute rounded-full bg-white transition-all"
        style={{ top: 3, left: on ? 21 : 3, width: 20, height: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      />
    </button>
  );
}

// 25 Oct (GET/PUT /profile/whatsapp): whether Netai may write to this person
// in WhatsApp. Read fresh on every open, because a STOP sent in WhatsApp turns
// it off on the server. Same rule as the monthly switch: no known value, no
// switch. channel_on false means the choice is kept but nothing is sent yet.
// welcome_status (25 Oct) is set only by the PUT that turned the switch on;
// the line under the switch is drawn only for "sent", never for the other
// outcomes (already sent, channel off, no template, failed).
type WhatsAppState = { opted_in: boolean; channel_on: boolean; welcome_sent: boolean };

function readWhatsApp(raw: unknown): WhatsAppState | null {
  const d = unwrapData(raw);
  if (!isRecord(d) || typeof d.opted_in !== "boolean") return null;
  return { opted_in: d.opted_in, channel_on: d.channel_on === true, welcome_sent: d.welcome_status === "sent" };
}

function WhatsAppRow() {
  const s = useStrings();
  const [state, setState] = useState<WhatsAppState | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/profile/whatsapp")
      .then((raw) => {
        const w = readWhatsApp(raw);
        if (alive && w) setState(w);
      })
      .catch(() => { /* no switch */ });
    return () => { alive = false; };
  }, []);
  if (!state) return null;

  async function toggle() {
    if (busy || !state) return;
    setBusy(true);
    setFailed(false);
    try {
      const w = readWhatsApp(await apiFetch<unknown>("/profile/whatsapp", { method: "PUT", body: { opted_in: !state.opted_in } }));
      if (w) setState(w);
      else setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pd-switch-row">
      <span>
        {s.whatsapp}
        {!state.channel_on && <small style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{s.whatsappSoon}</small>}
        {state.opted_in && state.welcome_sent && <small role="status" style={{ display: "block", fontSize: 12, color: "var(--ink-2)" }}>{s.whatsappWelcome}</small>}
        {failed && <small role="status" style={{ display: "block", fontSize: 12, color: "var(--danger)" }}>{s.monthlyReminderFailed}</small>}
      </span>
      <SwitchButton on={state.opted_in} busy={busy} label={s.whatsapp} onClick={toggle} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 13 Oct, FIXED2 account drawer. One column of sections in the design's
// order: the person, inviting, tokens, the plan, notifications, language,
// then the pages that sit one level deeper, and sign-out.

function Section({ title, small, children }: { title: string; small?: string | null; children: React.ReactNode }) {
  return (
    <section className="pd-section">
      <div className="pd-title">
        <span>{title}</span>
        {small && <small>{small}</small>}
      </div>
      {children}
    </section>
  );
}

// E9 / #504: name, employer, position, city and link via PATCH /profile. The
// design draws them always open; saving is offered once something changed.
// Empty optional fields are sent as null (the contract's "clear"); the name
// can never be emptied, because asks are sent under it.
function ProfileFields({
  profile,
  onSaved,
  photo,
}: {
  profile: Profile;
  onSaved: (p: Partial<Profile>) => void;
  photo: Omit<ReturnType<typeof usePhoto>, "setInput">;
}) {
  const s = useStrings();
  const [name, setName] = useState(profile.name);
  const [employer, setEmployer] = useState(profile.employer ?? "");
  const [job, setJob] = useState(profile.job_position ?? "");
  const [city, setCity] = useState(profile.city ?? "");
  const [link, setLink] = useState(profile.link ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const dirty =
    name !== profile.name ||
    employer !== (profile.employer ?? "") ||
    job !== (profile.job_position ?? "") ||
    city !== (profile.city ?? "") ||
    link !== (profile.link ?? "");

  async function save() {
    if (!name.trim()) {
      setMsg({ ok: false, text: s.nameRequired });
      return;
    }
    setSaving(true);
    setMsg(null);
    const body = {
      name: name.trim(),
      employer: employer.trim() || null,
      job_position: job.trim() || null,
      city: city.trim() || null,
      // #504: an empty box means "clear it", which is the contract's null.
      link: link.trim() || null,
    };
    try {
      await apiFetch("/profile", { method: "PATCH", body });
      onSaved(body);
      try { localStorage.setItem("netai_profile_name", body.name); } catch {}
      setMsg({ ok: true, text: s.saved });
      setTimeout(() => setMsg(null), 2400);
    } catch (e2) {
      // The server decides what a valid address is; its words are shown.
      setMsg({ ok: false, text: e2 instanceof ApiError ? e2.message : s.genericError });
    } finally {
      setSaving(false);
    }
  }

  // #6799 (D858): the personal information folds, closed, so the setup
  // steps, the invite and the plan are in reach without scrolling past it.
  return (
    <details className="pd-section pd-fold">
      <summary className="pd-title">
        <span>{s.profileSmall}</span>
        <DzIcon name="down" size={16} />
      </summary>
      <div className="pd-fields">
        <div className="pd-row2">
          <label className="pd-field">
            <span>{s.nameLabel}</span>
            <input value={name} required onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="pd-field">
            <span>{s.employerLabel}</span>
            <input value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </label>
        </div>
        <label className="pd-field">
          <span>{s.phoneLabel}</span>
          <input value={groupPhone(profile.phone)} readOnly />
        </label>
        <label className="pd-field">
          <span>{s.jobLabel}</span>
          <input value={job} onChange={(e) => setJob(e.target.value)} />
        </label>
        <label className="pd-field">
          <span>{s.cityLabel}</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
        <label className="pd-field">
          <span>{s.linkLabel}</span>
          <input type="url" inputMode="url" maxLength={300} value={link} onChange={(e) => setLink(e.target.value)} />
        </label>
      </div>
      {dirty && (
        <button type="button" className="pd-cta" disabled={saving || !name.trim()} onClick={save}>
          {saving ? "…" : s.saveProfile}
        </button>
      )}
      {msg && (
        <p role="status" className="pd-msg" style={{ color: msg.ok ? "var(--accent-strong)" : "var(--danger)" }}>{msg.text}</p>
      )}
      {(photo.photoUrl || photo.err) && (
        <div className="nx-row" style={{ marginTop: 8 }}>
          {photo.photoUrl && (
            <button type="button" className="nx-link" style={{ color: "var(--danger)" }} disabled={photo.busy} onClick={photo.remove}>
              {s.removePhoto}
            </button>
          )}
          {photo.err && <span className="pd-msg" style={{ color: "var(--danger)", marginTop: 0 }}>{photo.err}</span>}
        </div>
      )}
    </details>
  );
}

// „ჩემი ასისტენტი" (design 4.10; backend 0316, Misho's yes 14 Oct): the
// assistant's name, up to 40 characters; empty goes back to the default,
// which the server sends as null and the field shows as its placeholder.
function AssistantNameSection({ profile, onSaved }: { profile: Profile; onSaved: (p: Partial<Profile>) => void }) {
  const s = useStrings();
  const [value, setValue] = useState(profile.assistant_name ?? "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const dirty = value.trim() !== (profile.assistant_name ?? "");

  async function save() {
    setSaving(true);
    setMsg(null);
    const next = value.trim() || null;
    try {
      await apiFetch("/profile", { method: "PATCH", body: { assistant_name: next } });
      onSaved({ assistant_name: next });
      setMsg({ ok: true, text: s.saved });
      setTimeout(() => setMsg(null), 2400);
    } catch (e2) {
      setMsg({ ok: false, text: e2 instanceof ApiError ? e2.message : s.genericError });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Section title={s.assistantTitle}>
      <label className="pd-field">
        <span>{s.assistantLabel}</span>
        <input value={value} maxLength={40} placeholder="Netai" onChange={(e) => setValue(e.target.value)} />
      </label>
      {dirty && (
        <button type="button" className="pd-cta" disabled={saving} onClick={save}>
          {saving ? "…" : s.assistantSave}
        </button>
      )}
      {msg && (
        <p role="status" className="pd-msg" style={{ color: msg.ok ? "var(--accent-strong)" : "var(--danger)" }}>{msg.text}</p>
      )}
    </Section>
  );
}

// The referral code, the share sheet and the link. Same mechanics as the
// earnings page's card (lib/invite): the invite is fetched on mount so that
// the tap that opens the share sheet keeps its user activation on iOS.
function InviteSection({ code }: { code: string | null }) {
  const s = useStrings();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState<"code" | "text" | "link" | null>(null);
  const shownCode = code ?? invite?.code ?? null;

  useEffect(() => {
    let alive = true;
    void fetchInvite().then((got) => { if (alive) setInvite(got); });
    return () => { alive = false; };
  }, []);

  function flash(kind: "code" | "text" | "link") {
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  }

  async function share() {
    const text = invite?.share_text ?? inviteShareText(shownCode);
    const outcome = await shareInvite(text, invite?.link ?? null);
    if (outcome === "copied") flash("text");
  }

  return (
    <Section title={s.inviteTitle} small={s.inviteSmall}>
      <div className="pd-card">
        {shownCode && (
          <div className="pd-code-row">
            <span>
              <small>{s.codeLabel}</small>
              <b>{shownCode}</b>
            </span>
            <button type="button" className="pd-mini" onClick={() => { flash("code"); void copyText(shownCode); }}>
              {copied === "code" ? s.copied.replace("!", "") : s.copy}
            </button>
          </div>
        )}
        <button type="button" className="pd-cta" onClick={share}>
          <DzIcon name="people" size={16} />
          {copied === "text" ? s.copied.replace("!", "") : s.inviteFriend}
        </button>
        {/* Only when the server gave a link: a button that copied nothing
            would be worse than no button (#379). */}
        {invite?.link && (
          <button type="button" className="pd-cta" onClick={() => { flash("link"); void copyText(invite.link); }}>
            {copied === "link" ? s.copied.replace("!", "") : s.copyLink}
          </button>
        )}
      </div>
    </Section>
  );
}

// Token wallet. Row 282: a number the server did not state stays null and is
// drawn as a dash, never a zero. The bar is what is left of this period's
// grant, which is the design's picture; when top-ups take the balance above
// the grant there is no "of N" to draw, so neither the fraction nor a bar
// past its end is shown.
function TokensSection() {
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

  // A 404 from the top-up route means this list is out of date, and the
  // honest answer is to re-read it rather than report a failed payment.
  async function loadPackages() {
    try {
      const res = await fetch(`${BASE_URL}/billing/topup-packages`, { headers: authHeaders() });
      const json = await res.json();
      if (Array.isArray(json?.data)) setPackages(json.data as TopupPackage[]);
    } catch {}
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const t = await fetchTokens();
      if (alive && !t) setFailed(true);
      if (alive) await loadPackages();
    })();
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // After checkout the webhook credits tokens within seconds: poll every 2s,
  // up to 30s, until the balance grows.
  useEffect(() => {
    const off = onCheckoutCompleted(() => {
      const startBalance = balanceRef.current ?? 0;
      let ticks = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        ticks++;
        const t = await fetchTokens();
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
  if (!tokens && !failed) return null; // loading: no empty box

  const balance = tokens?.balance != null ? Math.max(0, tokens.balance) : null;
  const granted = tokens?.grantedThisPeriod ?? 0;
  const spent = tokens?.spentThisPeriod != null ? Math.max(0, tokens.spentThisPeriod) : 0;
  const isTrial = isTrialTokens(tokens);
  const showTopup = !!tokens && !isTrial && packages.length > 0;

  // The header line: what is added, and when, both the server's (2047 item
  // 9: the plan's own allowance; 0 means nothing is added, so no promise).
  let small: string | null = null;
  if (tokens && granted > 0) {
    const per = tokens.allowancePerPeriod === undefined ? granted : tokens.allowancePerPeriod;
    if (per > 0) {
      const at = tokens.resetsAt ? new Date(tokens.resetsAt) : null;
      const valid = at && !isNaN(at.getTime()) ? at : null;
      small = tokens.window === "calendar_month"
        ? s.tokensMonth(valid ? fmtDateLoc(valid.toISOString(), { day: "numeric", month: "long" }) : null, fmtTokens(per))
        : s.tokensWeek(valid ? s.weekdays[valid.getDay()] : null, fmtTokens(per));
    }
  }

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

  const within = balance != null && granted > 0 && balance <= granted;

  return (
    <Section title={s.tokens} small={small}>
      {toast && (
        <div className="toast" role="status" aria-live="polite"><span style={{ marginRight: 4 }}>✓</span>{toast}</div>
      )}
      <div className="pd-token">
        {failed || !tokens || balance == null ? (
          <p className="pd-meta">-</p>
        ) : (
          <>
            <div className="pd-bal">
              <span>
                <b>{fmtTokens(balance)}</b>
                <small>{s.left}</small>
              </span>
              {within && <strong>{s.of(fmtTokens(granted))}</strong>}
            </div>
            {within && (
              <div className="pd-track"><i style={{ width: `${Math.round((balance / granted) * 100)}%` }} /></div>
            )}
            {granted > 0 && (
              <div className="pd-meta">
                <span>{s.used(fmtTokens(spent))}</span>
                <span>{Math.round((spent / granted) * 100)}%</span>
              </div>
            )}
          </>
        )}
      </div>
      {showTopup && (
        <div className="pd-packs" aria-label={s.addTokens}>
          {packages.map((pkg) => {
            const price = priceFromLabel(pkg.label);
            return (
              <button key={pkg.id} type="button" className="pd-pack" onClick={() => buy(pkg)}>
                <span>
                  <b>{fmtTokens(pkg.tokens)}</b>
                  <small>{s.tokenUnit}</small>
                </span>
                {price && <strong>{price}</strong>}
              </button>
            );
          })}
        </div>
      )}
      {isTrial && <span className="pd-note">{s.trialBalance}</span>}
      {/* 4294: the newest credit, amount and date both the server's. */}
      {tokens?.lastTopUp && (
        <span className="pd-note">{s.lastTopUp(fmtTokens(tokens.lastTopUp.amount), fmtDateLoc(tokens.lastTopUp.at))}</span>
      )}
    </Section>
  );
}

// What the plan card says under the plan's name: the same states the
// subscription panel always told apart, now as one line.
function planLine(s: ReturnType<typeof useStrings>, profile: Profile): { title: string; line: string | null; warn: boolean } {
  const { subscription_status, subscription_tier, trial_ends_at, current_period_ends_at, cancels_at } = profile;
  const tier = TIER_LABELS[subscription_tier] ?? subscription_tier;
  if (subscription_status === "trialing" && trial_ends_at) {
    return { title: s.trialLabel(tier), line: `${s.daysLeft(daysUntil(trial_ends_at))} · ${s.autoCharge(fmtDateLoc(trial_ends_at))}`, warn: false };
  }
  if (subscription_status === "active") {
    // Row 248: a scheduled stop is still active, and must not read "next payment".
    if (cancels_at) return { title: tier, line: s.endsOn(fmtDateLoc(cancels_at)), warn: true };
    return { title: tier, line: current_period_ends_at ? s.nextPayment(fmtDateLoc(current_period_ends_at)) : null, warn: false };
  }
  if (subscription_status === "past_due") return { title: s.paymentIssue, line: s.paymentFailedBody, warn: true };
  if (subscription_status === "canceled" && current_period_ends_at) {
    return { title: s.canceled, line: s.continuesUntil(tier, fmtDateLoc(current_period_ends_at)), warn: true };
  }
  return { title: s.freePlan, line: s.tapChoose, warn: false };
}

export default function ProfilePage() {
  const s = useStrings();
  const router = useRouter();
  const { setInput: setPhotoInput, ...photo } = usePhoto();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);
  const [showPortal, setShowPortal] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // #497: cancelling and resuming the paid plan without the Stripe page.
  const [askCancel, setAskCancel] = useState(false);
  const [planBusy, setPlanBusy] = useState(false);
  // Set only after the server has said this plan was granted by the team.
  const [granted, setGranted] = useState(false);
  // #508. The flag lives in this browser, read as an external store.
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

  // Stripe (6 Sept): same-tab redirect to the portal. 404 = no Stripe
  // customer yet, so no button at all.
  async function openPortal() {
    setPortalLoading(true);
    setError(null);
    const out = await openStripePortal();
    if (out === "redirected") return;
    setPortalLoading(false);
    if (out === "none") setShowPortal(false);
    else setError(portalErrorText());
  }

  // 11 Oct: the only sign-out, so it also takes this device's push
  // subscription off the account.
  async function signOut() {
    const endpoint = localStorage.getItem("push_endpoint");
    if (localStorage.getItem("token") && endpoint) {
      try {
        await fetch(`${BASE_URL}/notifications/subscribe`, {
          method: "DELETE",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      localStorage.removeItem("push_endpoint");
    }
    clearUserName();
    clearSessionToken();
    router.replace("/login");
  }

  const status = profile?.subscription_status ?? "";
  const isPastDue = status === "past_due";
  const isFreeOrInactive = !(status === "trialing" || status === "active" || isPastDue);
  // Only a plan that renews can be stopped from renewing; past_due's next
  // step is a working card, not a cancel button beside "payment failed".
  const isPaidPlan = status === "trialing" || status === "active";

  const name = profile?.name ?? "";
  const plan = profile ? planLine(s, profile) : null;

  return (
    <div className="pd">
      {/* #7987 (Giorgi G-184, 27 Oct): the way home is the page's top corner,
          not a part of the title row. With setup steps above the title, the
          row and its X sat halfway down the page and read as missing. The
          holder takes no height, so the X sits where the title row's was
          and stays there while the page scrolls. */}
      <div className="pd-close">
        <Link href="/chat" className="nx-icon" aria-label={s.close} title={s.close}>
          <DzIcon name="x" size={16} />
        </Link>
      </div>
      {/* #6701 (Giorgi, retested 21 Oct): the setup steps not done yet come
          first of all, above the profile's own title. */}
      {profile && (
        <div className="pd-body pd-top-steps">
          <ProfileSetupSteps />
        </div>
      )}
      <div className="pd-head">
        <div className="pd-head-row">
          <div className="pd-identity">
            {profile ? (
              <>
                <button
                  type="button"
                  className="pd-avatar"
                  disabled={photo.busy}
                  onClick={photo.pick}
                  aria-label={s.changePhoto}
                  title={s.changePhoto}
                >
                  {photo.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photo.photoUrl} alt={name} />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                </button>
                <input ref={setPhotoInput} type="file" accept="image/*" className="hidden" onChange={photo.onPick} />
              </>
            ) : (
              <span className="pd-avatar" />
            )}
            <span>
              <b>{name || " "}</b>
              <small>{s.personal}</small>
            </span>
          </div>
        </div>
      </div>

      <div className="pd-body">
        {error && (
          <p role="alert" className="pd-msg" style={{ color: "var(--danger)", marginTop: 12 }}>{error}</p>
        )}

        {loading && (
          <div className="flex flex-col gap-3 py-4">
            <span className="sk-bar" style={{ width: "40%", height: 18 }} />
            <span className="sk-bar" style={{ width: "100%", height: 120, borderRadius: 14 }} />
            <span className="sk-bar" style={{ width: "100%", height: 90, borderRadius: 14 }} />
          </div>
        )}

        {profile && (
          <>
            {/* #4597 (Tornike, Misho's yes): the one long scroll, grouped
                under four headings, so a person who came for one thing finds
                it without reading the rest. */}
            <h2 className="pd-group">{s.grpMine}</h2>
            {/* #6799 (D858): below the setup steps, in this order: personal
                information, invite friends, add contacts, current plan,
                tokens. Everything after them keeps its old order. */}
            <ProfileFields
              profile={profile}
              photo={photo}
              onSaved={(p) => setProfile((prev) => (prev ? { ...prev, ...p } : prev))}
            />
            <InviteSection code={profile.referral_code ?? null} />

            <nav className="pd-nav" aria-label={s.syncNav}>
              <Link href="/onboarding/contacts?from=profile">
                <span>
                  {s.syncNav}
                  <LastImportLine />
                </span>
                <DzIcon name="right" size={16} />
              </Link>
            </nav>

            {plan && (
              <Section title={s.planTitle}>
                <div className="pd-card pd-plan">
                  <div className="pd-plan-id">
                    <span className="pd-badge">{(TIER_LABELS[profile.subscription_tier] ?? profile.subscription_tier).toUpperCase()}</span>
                    <b style={plan.warn ? { color: isPastDue ? "var(--danger)" : "var(--request-accent)" } : undefined}>{plan.title}</b>
                    {plan.line && <small>{plan.line}</small>}
                  </div>
                  <div className="pd-plan-actions">
                    {isFreeOrInactive ? (
                      <Link href="/pricing" className="pd-mini" style={{ display: "inline-flex", alignItems: "center" }}>{s.choosePlan}</Link>
                    ) : showPortal ? (
                      <button type="button" className="pd-mini" disabled={portalLoading} onClick={openPortal}>
                        {portalLoading ? "…" : isPastDue ? s.changeCard : s.manage}
                      </button>
                    ) : null}
                    {/* #497: stopping the plan happens here, not on Stripe's
                        page. A team-granted plan has nothing to cancel, and
                        says so rather than showing a failure. */}
                    {!granted && isPaidPlan && (
                      profile.cancels_at ? (
                        <button type="button" className="pd-mini" disabled={planBusy} onClick={doResume}>{s.resumePlan}</button>
                      ) : (
                        <button type="button" className="pd-mini" disabled={planBusy} onClick={() => setAskCancel(true)}>{s.cancelShort}</button>
                      )
                    )}
                  </div>
                </div>
                {granted && <p className="pd-msg" style={{ color: "var(--ink-2)" }}>{s.grantedPlan}</p>}
              </Section>
            )}

            <TokensSection />

            {profile.assistant_name !== undefined && (
              <AssistantNameSection
                profile={profile}
                onSaved={(p) => setProfile((prev) => (prev ? { ...prev, ...p } : prev))}
              />
            )}

            <nav className="pd-nav" aria-label={s.grpMine}>
              <Link href="/setup">{s.setupNav}<DzIcon name="right" size={16} /></Link>
              <Link href="/profile/connector">{s.claudeNav}<DzIcon name="right" size={16} /></Link>
              <Link href="/profile/questions">{s.questionsNav}<DzIcon name="right" size={16} /></Link>
            </nav>

            <h2 className="pd-group">{s.grpMoney}</h2>
            <nav className="pd-nav" aria-label={s.grpMoney}>
              <Link href="/profile/earnings">{s.earningsNav}<DzIcon name="right" size={16} /></Link>
            </nav>

            <h2 className="pd-group">{s.grpContacts}</h2>
            <nav className="pd-nav" aria-label={s.grpContacts}>
              <Link href="/profile/contacts">{s.myContacts}<DzIcon name="right" size={16} /></Link>
              <MonthlyReminderRow />
              <Link href="/profile/requests">{s.requestsNav}<DzIcon name="right" size={16} /></Link>
              <Link href="/profile/people">{s.peopleNav}<DzIcon name="right" size={16} /></Link>
              <Link href="/profile/blocked">{s.blocked}<DzIcon name="right" size={16} /></Link>
              {/* 4126: linked on Misho's go-ahead of 20 Oct. */}
              <Link href="/profile/facts">{s.factsNav}<DzIcon name="right" size={16} /></Link>
            </nav>

            <h2 className="pd-group">{s.grpSettings}</h2>
            <section className="pd-section">
              <NotificationsCard />
              <WhatsAppRow />
            </section>

            <Section title={s.langTitle} small={s.langSmall}>
              <LanguageCard />
            </Section>

            <nav className="pd-nav" aria-label={s.grpSettings}>
              <Link href="/profile/data">{s.dataRights}<DzIcon name="right" size={16} /></Link>
              {/* #1920 (Ninia): the download had no name of its own on the
                  profile, so nobody found it under „data and privacy". It
                  opens the same page, whose first card holds the button. */}
              <Link href="/profile/data">{s.exportNav}<DzIcon name="right" size={16} /></Link>
            </nav>

            {/* Row 6 / #508: diagnostics only for a browser switched on with
                /profile?diag=1, with the way out next to them. */}
            {showDiagnostics && (
              <div className="flex flex-col gap-3" style={{ marginTop: 20 }}>
                <PushDiagnostics />
                <MicDiagnostics />
                <p style={{ fontSize: "12px", color: "var(--meta)" }}>{s.diagOff}</p>
              </div>
            )}

            <div className="pd-foot">
              <button type="button" className="pd-signout" onClick={signOut}>{s.signOut}</button>
            </div>
          </>
        )}
      </div>

      {/* #497: the question names the date the plan actually runs until. */}
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
