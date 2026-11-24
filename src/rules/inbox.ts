// When the phone's Home looks at the inbox again (Nate, 23 Nov: a card sent
// from the planner did not show until he left Home and came back).

/** How often an open screen looks again, in milliseconds. */
export const INBOX_CHECK_MS = 30_000;

/** True when the waiting cards are not the same set as before, so the page (Today) should be read again. */
export function cardsChanged(before: string[] | null, after: string[]): boolean {
  if (before === null) return false; // the first look is not a change
  if (before.length !== after.length) return true;
  const a = new Set(before);
  return after.some((id) => !a.has(id));
}
