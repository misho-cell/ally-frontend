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
  | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export async function uploadThreadFile(
  threadId: string,
  file: File,
  fallbackError: string,
): Promise<UploadResult> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/thread-files/${encodeURIComponent(threadId)}`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
  } catch {
    return { ok: false, error: fallbackError };
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const said = isRecord(body) ? str(body.error) : null;
    return { ok: false, error: said ?? fallbackError };
  }

  const data = unwrapData(body);
  if (!isRecord(data)) return { ok: false, error: fallbackError };

  // A 201 with no summary is a reply we did not understand. Treating it as
  // success would put an empty bubble in the conversation and tell the owner
  // their list was read when we cannot show that it was.
  const summary = str(data.summary);
  if (!summary) return { ok: false, error: fallbackError };

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
  let res: Response;
  try {
    res = await fetch(
      `${BASE_URL}/thread-files/goals/${encodeURIComponent(taskId)}/list.xlsx`,
      { headers: authHeaders() },
    );
  } catch {
    return { ok: false, error: fallbackError, missing: false };
  }

  if (!res.ok) {
    // A 404 here means this goal has no list, which is a fact about the goal
    // and not a failure. The caller shows the button only where there is
    // one, so reaching this is either a race or a goal that lost its list;
    // either way the server's sentence is the honest thing to show.
    let said: string | null = null;
    try {
      const body: unknown = await res.json();
      said = isRecord(body) ? str(body.error) : null;
    } catch {
      said = null;
    }
    return { ok: false, error: said ?? fallbackError, missing: res.status === 404 };
  }

  const blob = await res.blob();
  // The server names the file, and the name carries the goal's number. Taken
  // from the header when it is readable, because a name we invent would be
  // a worse one, and the header is where the server put the real one.
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const filename = match ? decodeURIComponent(match[1].replace(/"$/, "")) : `netai-list-${taskId}.xlsx`;
  return { ok: true, filename, blob };
}
