// Locale-based UI strings. Phone locale decides the language: Georgian for
// ka-*, English otherwise. Georgian copy follows the package rules: no
// em-dashes, never italic, Section 30 term choices.

export type Locale = "ka" | "en";

export function getLocale(): Locale {
  if (typeof navigator === "undefined") return "en";
  return navigator.language?.toLowerCase().startsWith("ka") ? "ka" : "en";
}

const en = {
  newTask: "New task",
  searchTasks: "Search tasks",
  incomingRequests: "Incoming requests",
  myTasks: "My tasks",
  noTasksYet: "No tasks yet",
  requestsHint: "Requests from your circle appear here.",
  threadsHint: "No tasks yet — your first question starts one.",
  signOut: "Sign out",
  selectThread: "Select a task or start a new one",
  waitingRequests: "{n} people are waiting on you in incoming requests.",
  waitingRequestOne: "1 person is waiting on you in incoming requests.",
  nothingYet: "Nothing on the desk yet.",
  firstRunBody: "Name your problem in ქართული or English — Netai finds the person through your circle.",
  taskFallback: "New task",
  threadFallback: "Task",
  hiIntro: "Hi, I'm Netai",
  giveTaskEmpty: "Give me a task — I'll work your network to get it done.",
  composerPlaceholder: "Give Netai a task…",
  listening: "Listening…",
  outOfTokens: "Out of tokens",
  rateLimitedPlaceholder: "Too many requests — please wait…",
  rateLimitedToast: "Too many requests. Please try again later.",
  workingOnIt: "Working on it…",
  retry: "Retry",
  hideSteps: "Hide steps",
  showSteps: "Show steps ({n})",
  takingLonger: "Taking longer than usual…",
  stillOnIt: "Still on it — this thread is a heavy one.",
  loadFailed: "Couldn't load this task.",
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
};

const ka: typeof en = {
  newTask: "ახალი დავალება",
  searchTasks: "მოძებნე დავალებებში",
  incomingRequests: "შემოსული თხოვნები",
  myTasks: "ჩემი დავალებები",
  noTasksYet: "დავალებები ჯერ არ არის",
  requestsHint: "შენი წრიდან თხოვნები აქ გამოჩნდება.",
  threadsHint: "დავალებები ჯერ არ არის, პირველი შეკითხვა დაიწყებს ახალს.",
  signOut: "გასვლა",
  selectThread: "აირჩიე დავალება ან დაიწყე ახალი",
  waitingRequests: "{n} ადამიანი გელოდება შემოსულ თხოვნებში.",
  waitingRequestOne: "1 ადამიანი გელოდება შემოსულ თხოვნებში.",
  nothingYet: "მაგიდაზე ჯერ არაფერია.",
  firstRunBody: "დაწერე შენი საკითხი ქართულად ან ინგლისურად და Netai შენს წრეში იპოვის საჭირო ადამიანს.",
  taskFallback: "ახალი დავალება",
  threadFallback: "დავალება",
  hiIntro: "გამარჯობა, მე Netai ვარ",
  giveTaskEmpty: "მომეცი დავალება და შენი ქსელის დახმარებით მოვაგვარებ.",
  composerPlaceholder: "დაავალე Netai-ს…",
  listening: "გისმენ…",
  outOfTokens: "ტოკენები ამოიწურა",
  rateLimitedPlaceholder: "ძალიან ბევრი მოთხოვნაა, ცოტა მოიცადე…",
  rateLimitedToast: "ძალიან ბევრი მოთხოვნაა. სცადე მოგვიანებით.",
  workingOnIt: "ვმუშაობ…",
  retry: "თავიდან სცადე",
  hideSteps: "ნაბიჯების დამალვა",
  showSteps: "ნაბიჯების ჩვენება ({n})",
  takingLonger: "ჩვეულებრივზე მეტ დროს იღებს…",
  stillOnIt: "ისევ ვმუშაობ, ეს დავალება მძიმეა.",
  loadFailed: "დავალება ვერ ჩაიტვირთა.",
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
};

const STRINGS: Record<Locale, typeof en> = { en, ka };

export type StringKey = keyof typeof en;

export function t(key: StringKey): string {
  return STRINGS[getLocale()][key] ?? en[key];
}

export function tf(key: StringKey, vars: Record<string, string | number>): string {
  return t(key).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}
