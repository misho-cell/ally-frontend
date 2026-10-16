import { authHeaders } from "./deviceId";
import { isRecord, unwrapData } from "./payload";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// #892 (4 Oct). The owner attaches a list — companies, people, whatever they
// already keep in a spreadsheet — and asks Netai to find a way into each row.
//
// The server reads the file and keeps what it read, not the bytes. Two rows
// land in the conversation: the owner's „📎 filename" line and Netai's
// summary of what it understood. Only the second comes back with an id, so
// only the second can be matched against history later.
//
// Not apiFetch: that sets Content-Type: application/json and stringifies the
// body. A multipart upload needs the browser to set the header itself,
// because the boundary is part of it and only the browser knows the one it
// used.

// The server's limits, repeated here only to refuse a file without a round
// trip. The server decides; this just avoids making somebody wait on a 2 MB
// upload to be told it was 2 MB.
export const FILE_MAX_BYTES = 2 * 1024 * 1024;
// #2378 (7 Oct, Lika): Word and PDF are offered too, although the server
// does not read them yet. Greyed out in the picker, they gave no reason at
// all; chosen, the server answers with its own sentence naming the formats it
// reads, and that sentence is shown as it comes. The MIME types are there for
// iPhone, whose picker goes by type rather than by extension.
export const FILE_ACCEPT = [
  ".xlsx", ".csv", ".txt", ".md", ".doc", ".docx", ".pdf",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
].join(",");

export type UploadResult =
  | {
      ok: true;
      fileId: number | null;
      filename: string;
      summary: string;
      messageId: string | null;
      createdAt: string | null;
    }
  // `error` is the server's own sentence, in the conversation's language,
  // and it already says why. It is shown as it is rather than mapped to one
  // of ours: the server knows whether the file was too big, the wrong kind,
  // empty, damaged or locked, and a sentence of ours would be a guess at
  // which.
  | { ok: false; error: string; kind: UploadFailure };

// 5121 (Lika, 15 Oct): three different facts that used to read the same.
// "unreadable": this device could not read the file it was given, so nothing
// left it. "network": the request broke before the server answered, so the
// server never saw the file. "server": the server answered and refused it,
// and `error` is its own sentence.
export type UploadFailure = "unreadable" | "network" | "server";

// 5121: the file is read into memory before anything is sent. On an iPhone a
// picked file can be a promise of one (a file kept in iCloud, say), and if it
// cannot be read while the request is streaming it, Safari drops the
// connection mid-upload: the server logs an aborted request and the person
// is told the file could not be read, with no way to tell which side failed.
// Read first, the failure happens here, before a byte is sent, and an upload
// that starts has its whole body. The server's limit is 2 MB, so holding it
// costs nothing.
export async function readFileBytes(file: File): Promise<Blob | null> {
  try {
    const buf = await file.arrayBuffer();
    if (buf.byteLength === 0 && file.size > 0) return null;
    return new Blob([buf], { type: file.type || "application/octet-stream" });
  } catch {
    return null;
  }
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export async function uploadThreadFile(
  threadId: string,
  file: File,
  fallbackError: string,
  bytes?: Blob,
): Promise<UploadResult> {
  const body0 = bytes ?? (await readFileBytes(file));
  if (!body0) return { ok: false, error: fallbackError, kind: "unreadable" };
  const form = new FormData();
  form.append("file", body0, file.name);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/thread-files/${encodeURIComponent(threadId)}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    return { ok: false, error: fallbackError, kind: "network" };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const said = isRecord(body) ? str(body.error) : null;
    return { ok: false, error: said ?? fallbackError, kind: "server" };
  }

  const data = unwrapData(body);
  if (!isRecord(data)) return { ok: false, error: fallbackError, kind: "server" };

  // A 201 with no summary is a reply we did not understand. Treating it as
  // success would put an empty bubble in the conversation and tell the owner
  // their list was read when we cannot show that it was.
  const summary = str(data.summary);
  if (!summary) return { ok: false, error: fallbackError, kind: "server" };

  return {
    ok: true,
    fileId: typeof data.fileId === "number" ? data.fileId : null,
    filename: str(data.filename) ?? file.name,
    summary,
    messageId: data.messageId != null ? String(data.messageId) : null,
    createdAt: str(data.createdAt),
  };
}

// #894. The worked list comes back as a spreadsheet: the owner's own columns
// first, then Netai's three. It needs the JWT, so a plain link cannot fetch
// it — the file is pulled as a blob and saved the same way the conversation
// export is.
export type ListDownload =
  | { ok: true; filename: string; blob: Blob }
  | { ok: false; error: string; missing: boolean };

export async function fetchGoalList(
  taskId: string,
  fallbackError: string,
): Promise<ListDownload> {
  return fetchXlsx(
    `${BASE_URL}/thread-files/goals/${encodeURIComponent(taskId)}/list.xlsx`,
    `netai-list-${taskId}.xlsx`,
    fallbackError,
  );
}

// #2347 (16 Oct). A reply that lists something, as a spreadsheet: a
// Markdown table row by row, or else a numbered or bulleted list item by
// item. The route takes the conversation's id and the reply's own server
// id, never its text.
export async function fetchReplyTable(
  threadId: string,
  messageId: string,
  fallbackError: string,
): Promise<ListDownload> {
  return fetchXlsx(
    `${BASE_URL}/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/table.xlsx`,
    `netai-${threadId}.xlsx`,
    fallbackError,
    // The server's fixed sentence for a reply with nothing to list. Its
    // not-found for an unknown route has the same shape and a different
    // sentence (backend, 16 Oct 18:10Z), so only this text means „no list".
    "No list in this message",
  );
}

// Whether a reply looks like it holds something the table route can turn
// into rows: a Markdown table, or two or more list lines. Only decides
// whether to offer the action; the server decides what the rows are.
export function replyHasList(text: string): boolean {
  if (/^\s*\|.*\|\s*$/m.test(text) && /^\s*\|?\s*:?-{3,}/m.test(text)) return true;
  return (text.match(/^\s*(?:\d+[.)]|[-*\u2022])\s+\S/gm) ?? []).length >= 2;
}

async function fetchXlsx(
  url: string,
  fallbackName: string,
  fallbackError: string,
  missingText?: string,
): Promise<ListDownload> {
  let res: Response;
  try {
    res = await fetch(url, { headers: authHeaders() });
  } catch {
    return { ok: false, error: fallbackError, missing: false };
  }

  if (!res.ok) {
    // A 404 here means there is no list to give, which is a fact about the
    // goal or the reply and not a failure. Where the route names its own
    // sentence for that, only that sentence counts; any other 404 (an
    // unknown route answers in the same shape) is a failure, so „no list"
    // is never said when we do not know.
    let said: string | null = null;
    let own = false;
    try {
      const body: unknown = await res.json();
      own = isRecord(body) && body.success === false;
      said = isRecord(body) ? str(body.error) : null;
    } catch {
      said = null;
    }
    const meant = missingText ? said === missingText : own;
    return { ok: false, error: said ?? fallbackError, missing: res.status === 404 && meant };
  }

  const blob = await res.blob();
  // The server names the file. Taken from the header when it is readable,
  // because a name we invent would be a worse one.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1].replace(/"$/, "")) : fallbackName;
  return { ok: true, filename, blob };
}

// The sentence to show for a failed upload: the server's own when it
// answered, ours when it never saw the file.
export function uploadFailureText(
  out: { error: string; kind: UploadFailure },
  unreadable: string,
  network: string,
): string {
  if (out.kind === "unreadable") return unreadable;
  if (out.kind === "network") return network;
  return out.error;
}
