// #68 (3 Oct, Misho's word). Every set of buttons now ends with an „other"
// option the server appends — „სხვა, მე დავწერ" and its three translations —
// unless the set already ended in one of its own.
//
// That button is not an answer. Sending it as one costs a turn: the assistant
// reads it as „let me type", asks again, and the person answers the same
// question twice. Tapping it should do the one thing it names — put the
// cursor in the composer and wait.
//
// The server now says WHICH button it is: `other_choice_index`, beside every
// set of choices (3 Oct, 07:28:40Z). That number is the answer whenever it is
// present — it is the server's own intent rather than a reading of its prose,
// and it distinguishes the appended button from a model-made „სხვა", which is
// an ordinary answer and must still be sent.
//
// The text match below stays as the fallback, for a message read from a
// deployment older than that contract. It is written out in full and matched
// exactly, never by looking for the word „other" inside a sentence, and only
// in the last position, which is where the server appended it. A label that
// drifts stops matching and the button goes back to being sent, which is
// what it did before any of this existed: the way this fails is a wasted
// turn, not a wrong answer.
const WRITE_MY_OWN: readonly string[] = [
  "სხვა, მე დავწერ",
  "Other, I'll write it",
  "Другое, напишу сам",
  "Otro, lo escribo yo",
];

export function isWriteMyOwn(
  choice: string,
  index: number,
  choices: readonly string[],
  otherIndex: number | null | undefined,
): boolean {
  // The number wins outright when it is there, including when it points at a
  // label this file has never seen — a fifth language, a rewording — which is
  // the whole reason for asking for it.
  if (typeof otherIndex === "number") return index === otherIndex;
  if (choices.length === 0) return false;
  if (index !== choices.length - 1) return false;
  return WRITE_MY_OWN.includes(choice.trim());
}
