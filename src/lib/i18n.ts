// Locale-based UI strings. Phone locale decides the language: Georgian for
// ka-*, English otherwise. Georgian copy follows the package rules: no
// em-dashes, never italic, Section 30 term choices. Phase 2: all user-visible
// task wording is მიზანი/goal (internal names unchanged).

export type Locale = "ka" | "en";

export function getLocale(): Locale {
  // 23 Aug #2: an account-level override (set from the profile phone) beats
  // the browser language — the product language is the app's, not Chrome's.
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("netai_locale");
      if (stored === "ka" || stored === "en") return stored;
    } catch {}
  }
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("ka") ? "ka" : "en";
}

// Dates shown to the user follow the UI locale (ticket 6 #11, task 22 b).
// Georgian month names are spelled out by hand — some devices ship without
// ka ICU data and silently fall back to English via toLocaleDateString.
const KA_MONTHS = ["იანვარი", "თებერვალი", "მარტი", "აპრილი", "მაისი", "ივნისი", "ივლისი", "აგვისტო", "სექტემბერი", "ოქტომბერი", "ნოემბერი", "დეკემბერი"];
const KA_MONTHS_SHORT = ["იან", "თებ", "მარ", "აპრ", "მაი", "ივნ", "ივლ", "აგვ", "სექ", "ოქტ", "ნოე", "დეკ"];

export function fmtDateLoc(
  input: Date | string,
  opts: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric" }
): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  if (getLocale() === "ka") {
    const month = opts.month === "short" ? KA_MONTHS_SHORT[d.getMonth()] : KA_MONTHS[d.getMonth()];
    return `${d.getDate()} ${month}, ${d.getFullYear()}`;
  }
  try {
    return d.toLocaleDateString("en-US", opts);
  } catch {
    return d.toDateString();
  }
}

// Steps render as ✓ + text only — strip emoji the backend may include.
export function stripEmoji(s: string): string {
  try {
    return s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
  } catch {
    return s;
  }
}

// Founder rule: phone numbers in assistant messages are tappable. Turns bare
// international numbers into markdown links — the number dials (tel:), the
// small WhatsApp link opens a chat. Runs on the markdown SOURCE before
// rendering, and skips numbers that are already inside a link.
// NOTE: the markdown renderer must allow the tel: protocol via urlTransform,
// otherwise the anchor renders with a null href (ticket 6 #3).
export function linkifyPhones(text: string): string {
  return text.replace(
    /(^|[^\d(\[/+])(\+\d{1,3}[\s\-]?\d(?:[\s\-]?\d){6,12})(?!\d)/g,
    (_, lead: string, num: string) => {
      const digits = num.replace(/[^\d]/g, "");
      return `${lead}[${num.trim()}](tel:+${digits}) [↗︎WhatsApp](https://wa.me/${digits})`;
    }
  );
}

// Markdown renderers swallow single newlines (task 22 j). Convert a lone \n
// into a markdown hard break (two trailing spaces) so list-like assistant
// replies keep their line structure. Blank lines (paragraphs) stay untouched.
export function preserveLineBreaks(text: string): string {
  return text.replace(/([^\n])\n(?!\n)/g, "$1  \n");
}

const en = {
  newTask: "New goal",
  presenceWorking: "working on {n} of your goals",
  presenceReady: "your assistant",
  requestsLabel: "Requests",
  asksLabel: "Questions for you",
  askBadge: "question",
  inProgress: "In progress",
  finishedLabel: "Finished",
  viewAll: "View all",
  legacyChats: "Old conversations ›",
  homePlaceholder: "What are you working on right now?",
  searchGoals: "Search goals",
  noTasksYet: "No goals yet",
  requestsHint: "Requests from your circle appear here.",
  threadsHint: "No goals yet — your first ask starts one.",
  noMatches: "Nothing matches your search.",
  signOut: "Sign out",
  selectThread: "Pick a goal or give me a new one.",
  emptyHome: "Nothing on my desk yet. Set a goal, I'll handle the rest.",
  taskFallback: "New goal",
  threadFallback: "Goal",
  hiIntro: "Hi, I'm Netai",
  giveTaskEmpty: "Give me a goal — I'll work through your network and get it done.",
  composerPlaceholder: "Set a goal for Netai…",
  listening: "Listening…",
  outOfTokens: "Out of tokens",
  rateLimitedPlaceholder: "Too many requests — please wait…",
  rateLimitedToast: "Too many requests. Please try again later.",
  workingOnIt: "Working on it…",
  jumpToBottom: "Jump to latest",
  retry: "Retry",
  stepsToggle: "Steps ({n})",
  takingLonger: "Taking longer than usual…",
  stillOnIt: "Still on it — this one is a heavy one.",
  loadFailed: "Couldn't load this goal.",
  share: "Share",
  linkCopied: "Link copied",
  tokensAdded: "Tokens added",
  tokensLow: "Tokens running low",
  tokensAlmostGone: "Tokens almost gone — {n} left",
  trialUsedUp: "Trial tokens used up",
  monthlyUsedUp: "Monthly tokens used up",
  subscribeToContinue: "Subscribe to Netai to continue.",
  renewsOn: "Renews {date}.",
  renewsOrTopup: "Renews {date} — or add tokens now:",
  subscribe: "Subscribe",
  micNotAllowed: "Microphone access is not allowed",
  netRequired: "Internet connection required",
  paymentWindowFailed: "Couldn't open the payment window",
  genericError: "Something went wrong. Please try again.",
  lowSuffix: "low",
  stWorking: "working",
  stWaiting: "waiting on a reply",
  stNeedsYou: "needs you",
  stDone: "done",
  stFailed: "stuck",
  stopGoal: "Stop",
  stopFailed: "Couldn't stop — try again",
  renameGoal: "Rename",
  renamePrompt: "New name for this goal:",
  renameFailed: "Couldn't rename — try again",
  deleteGoal: "Delete",
  deleteConfirm: "Delete this goal? Any open work on it will be stopped.",
  deleteFailed: "Couldn't delete — try again",
  modalRenameTitle: "Rename goal",
  modalDeleteTitle: "Delete goal",
  cancel: "Cancel",
  save: "Save",
  meFallback: "Me",
  send: "Send",
  voiceStart: "Start voice input",
  voiceStop: "Stop recording",
  backLabel: "Back",
  profileLink: "Profile",
  reqAsksIntro: "asks for an intro through you",
  reqAccept: "Accept",
  reqDeny: "Decline",
  reqLater: "Remind me later",
  reqAccepted: "Accepted ✓ they'll be notified",
  reqDenied: "Declined — they'll be told gently",
  reqSnoozed: "Snoozed — I'll remind you tomorrow",
  reqSendFailed: "Couldn't send — try again",
  introRequestLabel: "INTRO REQUEST",
  resultLabel: "RESULT",
  resultFollowup: "Anything else on this?",
  rWho: "Who",
  rWhen: "When",
  rWhere: "Where",
  rTopic: "Topic",
  reqAcceptMsg: "Yes, I accept — go ahead with the intro.",
  reqDenyMsg: "No, I'd rather not — please decline politely.",
  reqLaterMsg: "Remind me about this later.",
};

const ka: typeof en = {
  newTask: "ახალი მიზანი",
  presenceWorking: "მუშაობს შენს {n} მიზანზე",
  presenceReady: "შენი ასისტენტი",
  requestsLabel: "მოთხოვნები",
  asksLabel: "შეკითხვები შენთვის",
  askBadge: "შეკითხვა",
  inProgress: "მიმდინარე",
  finishedLabel: "დასრულებული",
  viewAll: "ყველას ნახვა",
  legacyChats: "ძველი მიმოწერა ›",
  homePlaceholder: "რაზე მუშაობ ახლა?",
  searchGoals: "მოძებნე მიზნებში",
  noTasksYet: "მიზნები ჯერ არ არის",
  requestsHint: "შენი წრიდან თხოვნები აქ გამოჩნდება.",
  threadsHint: "მიზნები ჯერ არ არის, პირველი თხოვნა დაიწყებს ახალს.",
  noMatches: "ძიებას არაფერი ემთხვევა.",
  signOut: "გასვლა",
  selectThread: "აირჩიე მიზანი ან მომეცი ახალი.",
  emptyHome: "ჯერ არაფერი მაქვს სამუშაო. განმისაზღვრე მიზანი, დანარჩენს მე მივხედავ.",
  taskFallback: "ახალი მიზანი",
  threadFallback: "მიზანი",
  hiIntro: "გამარჯობა, მე Netai ვარ",
  giveTaskEmpty: "განმისაზღვრე მიზანი, შენი ქსელის დახმარებით ვიმუშავებ და მოვაგვარებ.",
  composerPlaceholder: "განუსაზღვრე Netai-ს მიზანი…",
  listening: "გისმენ…",
  outOfTokens: "ტოკენები ამოიწურა",
  rateLimitedPlaceholder: "ძალიან ბევრი მოთხოვნაა, ცოტა მოიცადე…",
  rateLimitedToast: "ძალიან ბევრი მოთხოვნაა. სცადე მოგვიანებით.",
  workingOnIt: "ვმუშაობ…",
  jumpToBottom: "ბოლოში ჩასვლა",
  retry: "თავიდან სცადე",
  stepsToggle: "ნაბიჯები ({n})",
  takingLonger: "ჩვეულებრივზე მეტ დროს იღებს…",
  stillOnIt: "ისევ ვმუშაობ, ეს მძიმე მიზანია.",
  loadFailed: "მიზანი ვერ ჩაიტვირთა.",
  share: "გაზიარება",
  linkCopied: "ლინკი დაკოპირდა",
  tokensAdded: "ტოკენები დაემატა",
  tokensLow: "ტოკენები იწურება",
  tokensAlmostGone: "ტოკენები თითქმის ამოიწურა, დარჩა {n}",
  trialUsedUp: "საცდელი ტოკენები ამოიწურა",
  monthlyUsedUp: "თვის ტოკენები ამოიწურა",
  subscribeToContinue: "გასაგრძელებლად გამოიწერე Netai.",
  renewsOn: "განახლდება: {date}.",
  renewsOrTopup: "განახლდება: {date}. ან დაამატე ტოკენები ახლავე:",
  subscribe: "გამოწერა",
  micNotAllowed: "მიკროფონზე წვდომა არ არის დაშვებული",
  netRequired: "საჭიროა ინტერნეტთან კავშირი",
  paymentWindowFailed: "გადახდის ფანჯარა ვერ გაიხსნა",
  genericError: "რაღაც შეცდომა მოხდა. სცადე თავიდან.",
  lowSuffix: "ცოტაღა დარჩა",
  stWorking: "მუშაობს",
  stWaiting: "ველოდები პასუხს",
  stNeedsYou: "საჭიროა შენი პასუხი",
  stDone: "დასრულდა",
  stFailed: "ვერ მოხერხდა",
  stopGoal: "გაჩერება",
  stopFailed: "ვერ გაჩერდა, სცადე თავიდან",
  renameGoal: "გადარქმევა",
  renamePrompt: "მიზნის ახალი სახელი:",
  renameFailed: "გადარქმევა ვერ მოხერხდა, სცადე თავიდან",
  deleteGoal: "წაშლა",
  deleteConfirm: "წავშალო ეს მიზანი? მასზე მიმდინარე სამუშაო შეჩერდება.",
  deleteFailed: "წაშლა ვერ მოხერხდა, სცადე თავიდან",
  modalRenameTitle: "მიზნის გადარქმევა",
  modalDeleteTitle: "მიზნის წაშლა",
  cancel: "გაუქმება",
  save: "შენახვა",
  meFallback: "მე",
  send: "გაგზავნა",
  voiceStart: "ხმით ჩაწერა",
  voiceStop: "ჩაწერის გაჩერება",
  backLabel: "უკან",
  profileLink: "პროფილი",
  reqAsksIntro: "გაცნობას ითხოვს შენი დახმარებით",
  reqAccept: "მიიღე",
  reqDeny: "უარი",
  reqLater: "მოგვიანებით შემახსენე",
  reqAccepted: "მიღებულია ✓ მთხოვნელს ეცნობება",
  reqDenied: "უარია, მთხოვნელს რბილად ეცნობება",
  reqSnoozed: "გადაიდო, ხვალ შეგახსენებ",
  reqSendFailed: "ვერ გაიგზავნა, კიდევ სცადე",
  introRequestLabel: "გაცნობის თხოვნა",
  resultLabel: "შედეგი",
  resultFollowup: "კიდევ რამე ამ თემაზე?",
  rWho: "ვინ",
  rWhen: "როდის",
  rWhere: "სად",
  rTopic: "თემა",
  reqAcceptMsg: "კი, თანახმა ვარ, გააგრძელე გაცნობა.",
  reqDenyMsg: "არა, არ მინდა, რბილად უთხარი უარი.",
  reqLaterMsg: "მოგვიანებით შემახსენე ამაზე.",
};

const STRINGS: Record<Locale, typeof en> = { en, ka };

export type StringKey = keyof typeof en;

export function t(key: StringKey): string {
  return STRINGS[getLocale()][key] ?? en[key];
}

export function tf(key: StringKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
