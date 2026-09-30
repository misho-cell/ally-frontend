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

// One share mechanism for every caller. It must be called INSIDE the tap:
// `navigator.share` requires user activation and an await before it loses
// that activation on iOS Safari, which is why the text is fetched ahead of
// the tap and passed in here already composed.
export async function shareInvite(text: string): Promise<"shared" | "copied" | "cancelled"> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ text });
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
