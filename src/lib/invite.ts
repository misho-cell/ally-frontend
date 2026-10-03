import { apiFetch, ApiError } from "./api";
import { authHeaders } from "./deviceId";
import { isRecord, unwrapData } from "./payload";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Row 320 (30 Sept). Asking the assistant for your own invite link used to
// cost a model run: the founder's own link cost three of them and a task.
// The link is not a thought, it is a row in a table, so GET /profile/invite-link
// hands it over without a run.
//
// `null` means the server has nothing to give — the invite_link_ready flag is
// off (404) or the call failed. That is not the same as an empty link, and
// the caller must not render a button that would share nothing: absent and
// empty are different facts and the person can tell the difference the moment
// the share sheet opens blank.
export type Invite = { link: string; code: string | null; share_text: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export async function fetchInvite(): Promise<Invite | null> {
  try {
    const res = await apiFetch<unknown>("/profile/invite-link");
    const body = unwrapData(res);
    if (!isRecord(body)) return null;
    const link = str(body.link);
    const shareText = str(body.share_text);
    // The share text is composed by the server, in the language this person
    // chose (X-Locale). Without it there is nothing to put in the sheet, and
    // rebuilding it here would send a paraphrase out in the person's own name.
    if (!link || !shareText) return null;
    return { link, code: str(body.code), share_text: shareText };
  } catch (err) {
    // 404 is the flag being off, not a fault. Anything else is a fault we
    // also cannot act on, and either way the button stays away.
    if (err instanceof ApiError) return null;
    return null;
  }
}

// Issued (we handed the link over) and sent (the person actually shared it)
// are separate points in the funnel. This is the second one, and it is
// recorded only on a real share or copy, never on merely opening the screen.
//
// Deliberately not apiFetch: a failure here must not redirect anybody or
// surface an error. The share already happened; the count is ours to lose.
export async function recordShared(): Promise<void> {
  try {
    await fetch(`${API_BASE}/auth/referral/shared`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({}),
    });
  } catch {}
}

// #379 (3 Oct). A share of plain text alone gives iOS a very short sheet —
// testers saw iMessage and little else — because the sheet is built from the
// kinds of thing being shared, and text is the poorest of them. A share that
// also declares a `url` is offered to everything that takes a link.
//
// Task 39 refused to pass the url for a good reason: the composed text
// already contains it, and a second field would send it twice. That reason
// only holds while the link sits INSIDE a sentence. When the text ends with
// the link, it lifts out cleanly and the message reads the same.
//
// So: the link is moved to `url` only when the text ends with it. Anywhere
// else the text goes alone, unchanged — the person's own words are not worth
// a longer share sheet. The copy-link button covers that case instead, and it
// needs no sheet at all.
function splitShare(text: string, link: string | null): { text: string; url?: string } {
  if (!link) return { text };
  const body = text.trimEnd();
  if (body.endsWith(link)) {
    const head = body.slice(0, body.length - link.length).trimEnd();
    if (head) return { text: head, url: link };
    return { text: link };
  }
  if (!body.includes(link)) return { text: body, url: link };
  return { text };
}

// One share mechanism for every caller. It must be called INSIDE the tap:
// `navigator.share` requires user activation and an await before it loses
// that activation on iOS Safari, which is why the text is fetched ahead of
// the tap and passed in here already composed.
export async function shareInvite(
  text: string,
  link: string | null = null,
): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(splitShare(text, link));
    } catch {
      return "cancelled"; // the person closed the sheet — not an error
    }
    void recordShared();
    return "shared";
  }
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    return "cancelled";
  }
  void recordShared();
  return "copied";
}

// The link on its own, for the copy button (#379). Copying the whole invitation
// is a different act from copying the address: one is a message to send, the
// other is something to paste into a browser bar or a chat the sheet never
// offered. They are kept apart on purpose.
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // The async clipboard is blocked in some embedded browsers; the old
    // selection trick still works there.
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
