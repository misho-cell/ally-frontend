// #68 (3 Oct, Misho's word). Every set of buttons now ends with an „other"
// option the server appends — „სხვა, მე დავწერ" and its three translations —
// unless the set already ended in one of its own.
//
// That button is not an answer. Sending it as one costs a turn: the assistant
// reads it as „let me type", asks again, and the person answers the same
// question twice. Tapping it should do the one thing it names — put the
// cursor in the composer and wait.
//
// It is recognised by its exact text, which is the only thing the payload
// carries: there is no flag on a choice today. That makes this list a
// contract with the server rather than a guess, so it is written out in full
// and matched exactly, never by looking for the word „other" inside a
// sentence. A label that drifts stops matching and the button goes back to
// being sent, which is the behaviour it had before this existed: the way
// this fails is a wasted turn, not a wrong answer.
const WRITE_MY_OWN: readonly string[] = [
  "სხვა, მე დავწერ",
  "Other, I'll write it",
  "Другое, напишу сам",
  "Otro, lo escribo yo",
];

// Only the LAST button can be this one, because that is where the server
// appends it. A set whose own wording happens to match earlier in the list is
// the author's choice and is sent like any other answer.
export function isWriteMyOwn(choice: string, choices: readonly string[]): boolean {
  if (choices.length === 0) return false;
  if (choices[choices.length - 1] !== choice) return false;
  return WRITE_MY_OWN.includes(choice.trim());
}
