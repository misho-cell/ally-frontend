// Locale-based UI strings. Phone locale decides the language: Georgian for
// ka-*, English otherwise. Georgian copy follows the package rules: no
// em-dashes, never italic, Section 30 term choices. Phase 2: all user-visible
// task wording is მიზანი/goal (internal names unchanged).

export type Locale = "ka" | "en";

export function getLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("ka") ? "ka" : "en";
}

// Steps render as ✓ + text only — strip emoji the backend may include.
export function stripEmoji(s: string): string {
  try {
    return s.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").replace(/\s{2,}/g, " ").trim();
  } catch {
    return s;
  }
}

const en = {
  newTask: "New goal",
  presenceWorking: "working on {n} of your goals",
  presenceReady: "ready to start",
  requestsLabel: "Requests",
  inProgress: "In progress",
  finishedLabel: "Finished",
  viewAll: "View all",
  legacyChats: "Old conversations ›",
  homePlaceholder: "What are you working on right now?",
  noTasksYet: "No goals yet",
  requestsHint: "Requests from your circle appear here.",
  threadsHint: "No goals yet — your first ask starts one.",
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
  // status pills (§4)
  stWorking: "working",
  stWaiting: "waiting on a reply",
  stNeedsYou: "needs you",
  stDone: "done",
  stFailed: "stuck",
  // request actions
  reqAsksIntro: "asks for an intro through you",
  reqAccept: "Accept",
  reqDeny: "Decline",
  reqLater: "Later",
  reqAccepted: "Accepted ✓ they'll be notified",
  reqDenied: "Declined — they'll be told gently",
  reqSnoozed: "Snoozed — I'll remind you tomorrow",
  reqSendFailed: "Couldn't send — try again",
  introRequestLabel: "INTRO REQUEST",
  // structured result
  resultLabel: "RESULT",
  resultFollowup: "Anything else on this?",
  rWho: "Who",
  rWhen: "When",
  rWhere: "Where",
  rTopic: "Topic",
  // one-tap replies sent into the thread (fallback when request_ref is absent)
  reqAcceptMsg: "Yes, I accept — go ahead with the intro.",
  reqDenyMsg: "No, I'd rather not — please decline politely.",
  reqLaterMsg: "Remind me about this later.",
};

const ka: typeof en = {
  newTask: "ახალი მიზანი",
  presenceWorking: "მუშაობს შენს {n} მიზანზე",
  presenceReady: "მზადაა დასაწყებად",
  requestsLabel: "მოთხოვნები",
  inProgress: "მიმდინარე",
  finishedLabel: "დასრულებული",
  viewAll: "ყველას ნახვა",
  legacyChats: "ძველი მიმოწერა ›",
  homePlaceholder: "რაზე მუშაობ ახლა?",
  noTasksYet: "მიზნები ჯერ არ არის",
  requestsHint: "შენი წრიდან თხოვნები აქ გამოჩნდება.",
  threadsHint: "მიზნები ჯერ არ არის, პირველი თხოვნა დაიწყებს ახალს.",
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
  lowSuffix: "low",
  stWorking: "მუშაობს",
  stWaiting: "ველოდები პასუხს",
  stNeedsYou: "საჭიროა შენი პასუხი",
  stDone: "დასრულდა",
  stFailed: "ვერ მოხერხდა",
  reqAsksIntro: "გაცნობას ითხოვს შენი დახმარებით",
  reqAccept: "მიიღე",
  reqDeny: "უარი",
  reqLater: "მერე",
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
