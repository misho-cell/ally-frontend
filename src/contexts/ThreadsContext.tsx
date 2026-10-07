"use client";
import { createContext, useContext, type Dispatch, type SetStateAction } from "react";

// Page size for both lists. The backend caps limit at 200.
export const PAGE_SIZE = 30;

export type Thread = {
  id: number;
  // incoming_ask (v68): another user's assistant asking THIS user a question.
  // Plain chat — no accept/decline UI; the backend picks up the first reply.
  // campaign_invite (T8, 26 Aug): same shape as incoming_ask (is_task/status/
  // status_line) — no dedicated branch needed, it just isn't incoming_request/
  // incoming_ask so it renders through the regular goal/legacy thread list.
  type: "regular" | "incoming_request" | "outgoing_request" | "incoming_ask" | "campaign_invite";
  title: string;
  last_message?: string;
  updated_at: string;
  status?: TaskStatus;
  status_line?: string | null;
  is_task?: boolean;
  request_ref?: string | null;
  // 20 Sept: the owner stopped this goal; it did not finish. Both land on
  // status "done", so without this field the app tells someone their goal
  // completed when they are the one who halted it. May be absent on older
  // deployments, which is why only an explicit true is treated as stopped.
  goal_stopped?: boolean;
  // #1919 (6 Oct). Stopped, and the owner has not closed it yet. Such a goal
  // stays among the current ones with Resume and Close, instead of dropping
  // into finished the moment Stop is pressed. Absent on older deployments,
  // so only an explicit true keeps a stopped goal in the current list.
  goal_stopped_open?: boolean;
  // #2080 (D703, 6 Oct). The owner flagged this conversation to come back to.
  // A flagged row stays at the top of the list on every device until the
  // owner clears it. Absent on older deployments: only an explicit true lifts.
  followed?: boolean;
  // Time of the last MESSAGE, as distinct from updated_at, which also moves
  // when only the status changed.
  last_message_at?: string | null;
  // #894 (4 Oct). The GOAL this conversation carries, which is a different
  // number from the conversation's own id. Keeping them apart is not
  // pedantry: /tasks/:id/stop read a thread id as a goal id and could stop
  // somebody's other goal. null when the conversation is not a goal.
  goal_id?: number | string | null;
  // True only when that goal has a worked list to download. Without it the
  // only way to find out would be to press a button and be told, which
  // teaches people the button is unreliable.
  has_list?: boolean;
  // #1817 (6 Oct). When the owner last had this conversation open, kept by
  // the server so it holds on every device. Three states, and they mean
  // different things: absent = the server does not track it yet (behave as
  // before), null = never opened, a time = opened then.
  seen_at?: string | null;
};

export type TaskStatus = "working" | "waiting" | "needs_you" | "done" | "failed";

const KNOWN_STATUSES: readonly string[] = ["working", "waiting", "needs_you", "done", "failed"];

export type ResultData = { who?: string; when?: string; where?: string; topic?: string };

// One row as the server sends it (GET /threads/:id/messages).
export type ServerMessage = {
  id?: string | number;
  created_at?: string;
  role: string;
  content: string;
  kind?: string;
  run_id?: string | null;
  // Task 98: "pending" rows carry their own buttons.
  choices?: string[] | null;
  // Task 39: filled only on the row that requested an invite link.
  share_text?: string | null;
  // #375 (2 Oct): the steps of this reply's run, newest deployments only.
  steps?: unknown;
  // Row 306 (30 Sept): { "<button label>": "<one sentence>" }, present only
  // where a button does something its label does not admit. Today that is the
  // plan-approval button alone, because approving is what writes to real
  // people in the owner's name. Absent everywhere else on purpose: a note
  // under every button teaches people to stop reading them.
  choice_notes?: Record<string, string> | null;
  // #68 (3 Oct): the index, within `choices`, of the server's „other, I'll
  // write it" button. Absent when the set has no such button — including a
  // model-made „სხვა", which is an ordinary answer and must still be sent.
  // Today it is always the last index; it is read as a number anyway,
  // because the server asked for that and because "last" is a coincidence.
  other_choice_index?: number | null;
};

export type ChatMessage = {
  // Local React key. Stable for the lifetime of the item, including optimistic
  // messages that have no server row yet.
  id: string;
  // Server row id + timestamp — the (created_at, id) pair is the paging cursor.
  serverId?: string | number;
  createdAt?: string;
  role: "user" | "assistant";
  content: string;
  // Row 322a (30 Sept), widened 1 Oct. "appended" is a bubble the SERVER wrote
  // into the thread on its own rather than a model's reply to a run: the
  // answers to a goal's asks (kind 'answers'), the opening line of a request
  // that continues an existing conversation (kind 'request', row 305b), and
  // whatever is named next.
  //
  // It renders exactly like a message. The distinction exists for one reason:
  // such a bubble can carry a runId belonging to no run this client started,
  // and since row 312 a reply CLAIMS the steps of its run. Mistaken for a
  // reply, it would take those steps and the real reply would show none —
  // silently, because a reply with no steps looks exactly like a run that had
  // none to report.
  //
  // It is a catch-all rather than a list of known names on purpose. The first
  // version named 'answers' alone, and 'request' arrived the next morning
  // through the same door. An unknown kind treated as appended renders its
  // steps as a loose block, which is visible and wrong in a small way; treated
  // as a reply it steals another run's steps, which is invisible.
  kind: "message" | "step" | "error" | "appended";
  runId: string | null;
  // Written locally (or over SSE), not yet seen in a server fetch. Pending items
  // survive a refetch so nothing the user just saw disappears.
  pending?: boolean;
  // The POST failed — the bubble stays with a "not sent / resend" marker.
  failed?: boolean;
  // Task 98 (11 Sept): per-message buttons. A pending item (an intro that was
  // accepted, a goal question, a debrief) arrives as its OWN assistant
  // message via message_appended, never glued to the reply — and each names
  // its action. Rendered under this bubble, not under the thread's last one.
  choices?: string[];
  // Task 39 (12 Sept): the ready-to-send invite text, link already inside,
  // straight from run_complete.share_text. Shared verbatim — never rebuilt
  // from the reply, never paired with a separate url.
  shareText?: string;
  // #375 (2 Oct). The steps this reply's own run wrote, as the server stores
  // them. Step ROWS are not returned by the messages endpoint — a step is not
  // a message (row 204) — so after a reload a finished conversation had no
  // steps at all, however many it had shown while running. This is how they
  // come back.
  //
  // Live step rows still arrive over the stream and are still preferred while
  // they exist: they are the same steps, and switching source mid-run would
  // make the list flicker between two orderings of the same thing.
  steps?: string[];
  // Row 306: one sentence per button label, for the buttons on THIS message.
  choiceNotes?: Record<string, string>;
  // #68: which of `choices` opens the composer instead of answering.
  otherChoiceIndex?: number;
};

export type Option = { phone: string; name: string };

export type ThreadState = {
  messages: ChatMessage[];
  options: Option[];
  choices: string[];
  // Row 306: notes for the thread-level choices above. Same shape as a
  // message's, and empty far more often than not.
  choiceNotes: Record<string, string>;
  // #68: index into `choices` of the button that opens the composer.
  otherChoiceIndex: number | null;
  loading: boolean;
  runId: string | null;
  error: string | null;
  loaded: boolean;
  streaming: { runId: string | null; text: string } | null;
  // Latest tool_progress line — the "what she is doing right now" line.
  progress: string | null;
  // False once a page of older history came back short — stop the spinner.
  hasMoreOlder: boolean;
  result: ResultData | null;
  // The conversation's language as the SERVER decided it, from the owner's own
  // messages. Null means the server has not said, not English: the caption
  // then falls back to reading the script of the last message, which is the
  // guess that used to flip "ნაბიჯები (14)" to "Steps (14)" on one open page
  // with no reload.
  language: string | null;
};

export const DEFAULT_THREAD_STATE: ThreadState = {
  messages: [],
  options: [],
  choices: [],
  choiceNotes: {},
  otherChoiceIndex: null,
  loading: false,
  runId: null,
  error: null,
  loaded: false,
  streaming: null,
  progress: null,
  hasMoreOlder: true,
  result: null,
  language: null,
};

export function updateThreadState(
  map: Record<string, ThreadState>,
  threadId: string | number,
  fn: (ts: ThreadState) => ThreadState
): Record<string, ThreadState> {
  const key = String(threadId);
  const cur = map[key] ?? DEFAULT_THREAD_STATE;
  return { ...map, [key]: fn(cur) };
}

// The kinds that ARE a model's reply to a run, and so may own its steps.
// Absent counts: the oldest rows carry no kind at all. "pending" is a reply
// with buttons on the same row, so it belongs here too.
const REPLY_KINDS = new Set(["message", "pending", "reply", ""]);

export function appendedKind(raw: unknown): ChatMessage["kind"] {
  return toKind(raw);
}

function toKind(raw: unknown): ChatMessage["kind"] {
  if (raw === "step") return "step";
  if (raw === "error") return "error";
  if (raw == null) return "message";
  return REPLY_KINDS.has(String(raw)) ? "message" : "appended";
}

export function toChatMessages(raw: unknown): ChatMessage[] {
  const rows: ServerMessage[] = Array.isArray(raw) ? raw : [];
  // "event" rows are bookkeeping, never a bubble (Task 98 note from the backend).
  return rows.filter((m) => m.kind !== "event").map((m) => ({
    id: crypto.randomUUID(),
    serverId: m.id ?? undefined,
    createdAt: m.created_at ?? undefined,
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
    // "pending" is a message with its own buttons — same bubble, plus choices.
    kind: toKind(m.kind),
    runId: m.run_id ?? null,
    // Row 160 (21 Sept): buttons on a plan stopped working as soon as any
    // other message arrived, and the plan could no longer be answered at all.
    // The choices were still being sent — they ride on the assistant's own
    // row — but only "pending" rows were allowed to keep them here, so a plan
    // (a plain message with choices on the same row: 171 such rows in a
    // fortnight, against 23 pending ones) had to fall back to the
    // thread-level gate, which hides the buttons the moment the last message
    // is not the assistant's.
    //
    // Any row that carries its own choices now keeps them, whatever its kind.
    // Buttons belong to the message that offered them, not to the end of the
    // conversation.
    ...(Array.isArray(m.choices) && m.choices.length > 0 ? { choices: m.choices } : {}),
    ...(typeof m.other_choice_index === "number" ? { otherChoiceIndex: m.other_choice_index } : {}),
    ...(typeof m.share_text === "string" && m.share_text ? { shareText: m.share_text } : {}),
    ...(m.choice_notes && typeof m.choice_notes === "object"
      ? { choiceNotes: m.choice_notes }
      : {}),
    ...(Array.isArray(m.steps) && m.steps.length > 0
      ? { steps: m.steps.filter((x): x is string => typeof x === "string" && x.trim() !== "") }
      : {}),
  }));
}

const contentKey = (m: ChatMessage) => `${m.role} ${m.kind} ${m.content}`;

// Fold a freshly fetched newest page into what is already on screen.
//
// Two things must survive the fetch:
//   1. older history the user scrolled up to load (it sits ABOVE the page), and
//   2. local/SSE writes the server has not caught up on yet (they sit BELOW).
// Without (2) a fetch landing right after send wipes the user's own bubble;
// without (1) any refetch throws away the history they just pulled in.
export function mergeMessages(fresh: ChatMessage[], existing: ChatMessage[]): ChatMessage[] {
  if (existing.length === 0) return fresh;

  const freshKeys = new Set(fresh.map(contentKey));
  const freshIds = new Set(fresh.filter((m) => m.serverId != null).map((m) => String(m.serverId)));
  const oldestFresh = fresh.find((m) => m.createdAt)?.createdAt;

  const older = oldestFresh
    ? existing.filter(
        (m) =>
          !m.pending &&
          !m.failed &&
          m.serverId != null &&
          !freshIds.has(String(m.serverId)) &&
          m.createdAt != null &&
          m.createdAt < oldestFresh
      )
    : [];

  // #793 (4 Oct, Giorgi's phone). A local copy was kept only when its TEXT
  // was absent from the fetched page. The waiting line arrives live as
  // `message_appended` carrying the id of the very row history returns, so
  // the two are one message — but any difference in the stored text, down to
  // a space, made the content keys disagree and the local copy survived
  // beside its own server row. It then landed in `pending`, which is appended
  // last, so the duplicate reappeared BELOW replies written after it.
  //
  // An id is an identity and text is a guess at one. When the server has sent
  // us a row with this id, that row is the message and ours is a stale copy
  // of it, whatever either of them says.
  const pending = existing.filter(
    (m) =>
      (m.pending || m.failed) &&
      !freshKeys.has(contentKey(m)) &&
      !(m.serverId != null && freshIds.has(String(m.serverId)))
  );

  // SSE-only extras (share text, per-bubble buttons) live on the local copy.
  // When the server row replaces it, carry them across — otherwise the refetch
  // that follows thread_updated drops them a second after they appear.
  //
  // Row 3c (24 Sept): only from a row the server has not spoken about yet.
  // This used to carry from EVERY local row, which meant a server row that
  // deliberately arrived with its choices cleared had them grafted straight
  // back on. That is what left three buttons on a stopped goal in thread
  // 17564, one of them offering to send an invitation on a goal that was over:
  // the stop had cleared every choices row on the server, and the client put
  // them back. `pending` marks a bubble this client invented from the stream
  // and the server has not confirmed; once a fetch has replaced it, the
  // server's word is the only word. An absent choices field and a cleared one
  // are the same sentence from the server, and both of them outrank ours.
  const extras = new Map<string, { shareText?: string; choices?: string[]; choiceNotes?: Record<string, string> }>();
  for (const m of existing) {
    if (!m.pending) continue;
    if (m.shareText || m.choices || m.choiceNotes) extras.set(contentKey(m), { shareText: m.shareText, choices: m.choices, choiceNotes: m.choiceNotes });
  }
  const kept = fresh.map((m) => {
    const extra = extras.get(contentKey(m));
    if (!extra) return m;
    return {
      ...m,
      ...(!m.shareText && extra.shareText ? { shareText: extra.shareText } : {}),
      ...(!m.choices && extra.choices ? { choices: extra.choices } : {}),
      ...(!m.choiceNotes && extra.choiceNotes ? { choiceNotes: extra.choiceNotes } : {}),
    };
  });

  // #793, second half: the tail went on at the end regardless of when it was
  // written, so a live row the fetch had not caught yet sat under replies
  // that came after it. Both sides carry the server's own `createdAt` now, so
  // they are ordered by it — but only when every row in the tail has one.
  // A sort that silently treats "no time" as "the beginning of time" would
  // move bubbles the person is watching.
  if (pending.length > 0 && pending.every((m) => m.createdAt) && kept.every((m) => m.createdAt)) {
    const tail = [...kept, ...pending].sort((a, b) =>
      a.createdAt! < b.createdAt! ? -1 : a.createdAt! > b.createdAt! ? 1 : 0
    );
    return [...older, ...tail];
  }
  return [...older, ...kept, ...pending];
}

// Older page arrived — put it in front, skipping rows we already hold.
export function prependOlder(older: ChatMessage[], existing: ChatMessage[]): ChatMessage[] {
  const have = new Set(existing.filter((m) => m.serverId != null).map((m) => String(m.serverId)));
  const add = older.filter((m) => m.serverId == null || !have.has(String(m.serverId)));
  return add.length > 0 ? [...add, ...existing] : existing;
}

// Row 282: the wallet is parsed, not cast, and a field the server did not
// send stays null instead of turning into a zero somebody reads as "empty".
import type { TokenBalance } from "@/lib/tokens";
export type { TokenBalance };

type Ctx = {
  threads: Thread[];
  setThreads: Dispatch<SetStateAction<Thread[]>>;
  threadsLoaded: boolean;
  threadStates: Record<string, ThreadState>;
  setThreadStates: Dispatch<SetStateAction<Record<string, ThreadState>>>;
  reconnectNonce: number;
  tokens: TokenBalance | null;
  refreshTokens: () => void;
  createThread: () => void;
  createTask: (text: string) => Promise<void>;
  // #1222: a new conversation that starts with a file rather than a line.
  // #2346: a line typed with the file goes in after it, into the same
  // conversation.
  createWithFile: (file: File, text?: string) => Promise<void>;
  titles: Record<string, string>;
  // #2185 / D709 (7 Oct): there is one accept now. The person asked does not
  // choose how; the server connects the two and needs no channel.
  resolveRequest: (threadId: string, action: "accept_direct" | "deny" | "later") => void;
  resolvedRequests: Record<string, { action: string; at: number }>;
  // Bumped per-thread on thread_updated — an open thread refetches its
  // messages so task-engine messages appear without any user action (v68 #5).
  threadBumps: Record<string, number>;
};

export const ThreadsContext = createContext<Ctx>({
  threads: [],
  setThreads: () => {},
  threadsLoaded: false,
  threadStates: {},
  setThreadStates: () => {},
  reconnectNonce: 0,
  tokens: null,
  refreshTokens: () => {},
  createThread: () => {},
  createTask: async () => {},
  createWithFile: async () => {},
  titles: {},
  resolveRequest: () => {},
  resolvedRequests: {},
  threadBumps: {},
});

export const useThreads = () => useContext(ThreadsContext);

// Effective status: the SERVER decides. Unknown future statuses degrade to
// "working" instead of breaking the UI. Live in-flight run overrides until
// thread_updated lands. Returns null for non-goal threads (legacy, asks).
export function taskStatusOf(
  thread: Thread,
  ts: ThreadState | undefined
): TaskStatus | null {
  // FE-2 (4 Sept): campaign_invite carries the same is_task/status/
  // status_line shape as a regular goal (see the Thread type comment above)
  // and was meant to fall through to this same goal/legacy split — but this
  // gate only allowed "regular", so every campaign_invite thread (including
  // ones needing the user's reply) landed in the collapsed legacy bucket
  // instead of the main list.
  if (thread.type !== "regular" && thread.type !== "campaign_invite") return null;
  // #375 (2 Oct), Ninia's test 13: a WORKING conversation vanished from the
  // list. This is how.
  //
  // `loading` means this client has a run in flight on this thread. That test
  // was below the next line, so a plain chat — is_task false, no status yet,
  // which is every chat before the server opens a goal in it — returned null
  // while it was running. Null lands a thread in the legacy bucket, and the
  // legacy section is COLLAPSED by default. So someone sent a message, the
  // run started, and the conversation left the list in front of them.
  //
  // A run in flight is the most certain thing either side knows about a
  // thread: the server may not have written a status yet, but the person is
  // watching it work. It is checked first now. The type gate stays above it,
  // because an ask thread that is running still belongs in its own list and
  // not among the goals.
  if (ts?.loading) return "working";
  if (!thread.is_task && !thread.status) return null;
  const s = thread.status;
  if (s && KNOWN_STATUSES.includes(s)) return s;
  return "working";
}

export function forceLogin() {
  try {
    localStorage.removeItem("token");
    document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax";
  } catch {}
  window.location.href = "/login";
}
