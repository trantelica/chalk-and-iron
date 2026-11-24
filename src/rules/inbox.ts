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

/** What decide_planner_proposal answers (an expected refusal is an answer, not an error). */
export interface DecideAnswer { ok?: boolean; status?: string; code?: string; message?: string; replaced_session_id?: string | null }

/**
 * The words the card shows after Accept or Dismiss (review finding 2, 23 Nov):
 * a refusal shows the account's own reason, never "Accepted".
 */
export function decisionMessage(answer: DecideAnswer | null, accept: boolean, workoutName: string | undefined): { ok: boolean; text: string } {
  if (!answer || answer.ok !== true) {
    return { ok: false, text: `Not ${accept ? 'accepted' : 'dismissed'}. ${answer?.message ?? 'The account did not answer. Try again.'}` };
  }
  return accept
    ? { ok: true, text: `Accepted. ${workoutName ?? 'The day'} is today's workout. Your library and campaign are unchanged.` }
    : { ok: true, text: 'Dismissed. Nothing changed.' };
}

/** What the card says when this phone still has changes the account has not received (review at high effort, 23 Nov). */
export const UNSAVED_BEFORE_ACCEPT = 'Not accepted. This phone has workout changes not yet saved to your account. Try again when it is back online.';

/**
 * Before Accept, everything this phone has waiting is sent first (design
 * Section 6: "Accept needs a connection, and the outbox is sent first"), so
 * the workout that may be replaced is in the account as the phone has it.
 * Waits at most `ms`. True when nothing is left waiting.
 */
export async function sendWaitingFirst(box: { count: number; flush(): Promise<void> } | null, ms = 8000): Promise<boolean> {
  if (!box || box.count === 0) return true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    box.flush().catch(() => {}),
    new Promise<void>((done) => { timer = setTimeout(done, ms); }),
  ]);
  clearTimeout(timer);
  return box.count === 0;
}
