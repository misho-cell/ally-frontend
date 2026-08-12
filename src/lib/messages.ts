import { authHeaders } from "./deviceId";
import { forceLogin, toChatMessages, PAGE_SIZE, type ChatMessage } from "@/contexts/ThreadsContext";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// Paging on GET /threads/:id/messages is newer than the rest of the app. If a
// deployment rejects the params we remember it for the session and fall back to
// the unparameterised response (which still returns the full history), instead
// of showing "couldn't load this goal" on every open.
let pagingSupported = true;

export function isMessagePagingSupported(): boolean {
  return pagingSupported;
}

export type MessagePage = {
  messages: ChatMessage[];
  // false = this is the whole history, not a page — stop asking for older.
  paged: boolean;
};

async function get(url: string): Promise<Response> {
  return fetch(url, { headers: authHeaders() });
}

// Returns null when the session is gone (a redirect to /login is under way).
// Throws on network failure so the caller can show its retry state.
export async function fetchMessagePage(
  threadId: string,
  cursor?: { before: string; beforeId: string }
): Promise<MessagePage | null> {
  const base = `${BASE_URL}/threads/${threadId}/messages`;

  if (cursor) {
    // Older page. Without paging support there is nothing more to fetch — the
    // first call already returned everything.
    if (!pagingSupported) return { messages: [], paged: false };
    const q = new URLSearchParams({
      limit: String(PAGE_SIZE),
      before: cursor.before,
      before_id: cursor.beforeId,
    });
    const res = await get(`${base}?${q.toString()}`);
    if (res.status === 401) {
      forceLogin();
      return null;
    }
    if (!res.ok) {
      pagingSupported = false;
      return { messages: [], paged: false };
    }
    const json = await res.json();
    return { messages: toChatMessages(json.data ?? json), paged: true };
  }

  // Newest page.
  if (pagingSupported) {
    const res = await get(`${base}?limit=${PAGE_SIZE}`);
    if (res.status === 401) {
      forceLogin();
      return null;
    }
    if (res.ok) {
      const json = await res.json();
      return { messages: toChatMessages(json.data ?? json), paged: true };
    }
    pagingSupported = false;
  }

  const res = await get(base);
  if (res.status === 401) {
    forceLogin();
    return null;
  }
  if (!res.ok) throw new Error(String(res.status));
  const json = await res.json();
  return { messages: toChatMessages(json.data ?? json), paged: false };
}
