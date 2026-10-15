// 5052 (Giorgi): a case reads in at most five words in the list and in the
// chat header. The server writes short_title for that; while it has none,
// the full title is cut to its first five words, without an ellipsis, so a
// cut title reads as a name and not as a sentence that broke off.
export const SHORT_TITLE_WORDS = 5;

export function shortTitle(short: string | null | undefined, full: string): string {
  if (typeof short === "string" && short.trim()) return short.trim();
  const words = full.trim().split(/\s+/);
  if (words.length <= SHORT_TITLE_WORDS) return full.trim() || full;
  return words.slice(0, SHORT_TITLE_WORDS).join(" ").replace(/[\s,.;:!?…-]+$/u, "") || full;
}
