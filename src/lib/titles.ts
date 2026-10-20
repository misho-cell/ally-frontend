// 5052 (Giorgi): a case reads in at most five words in the list and in the
// chat header. The server writes short_title for that; while it has none,
// the full title is cut to its first five words, without an ellipsis, so a
// cut title reads as a name and not as a sentence that broke off.
export const SHORT_TITLE_WORDS = 5;

// #5052 / #4919 (20 Oct): the cap holds for the server's short_title too, so
// no case title on any screen runs past five words or ends in an ellipsis.
export function shortTitle(short: string | null | undefined, full: string, n = SHORT_TITLE_WORDS): string {
  const base = typeof short === "string" && short.trim() ? short : full;
  const words = base.trim().split(/\s+/);
  if (words.length <= n) return base.trim().replace(/\s*(…|\.\.\.)$/u, "") || base;
  return words.slice(0, n).join(" ").replace(/[\s,.;:!?…-]+$/u, "") || base;
}

// 1688 (15 Oct): a list row shows one line of the last message. Where the
// message has paragraphs, the row shows the first one only: an incoming
// question is followed by a blank line and the asker's assistant line, and
// collapsed into one line the two read as one run-on sentence.
export function previewLine(text: string | null | undefined): string {
  if (typeof text !== "string") return "";
  const first = text.trim().split(/\n[ \t]*\n/)[0] ?? "";
  return first.replace(/\s+/g, " ").trim();
}
