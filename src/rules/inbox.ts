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

/** What decide_planner_proposal and decide_proposal answer (an expected refusal is an answer, not an error). */
export interface DecideAnswer {
  ok?: boolean; status?: string | null; code?: string; message?: string; replaced_session_id?: string | null;
  /** decide_proposal only: the kind of card, and what Accept made (for a running workout, its new plan revision). */
  kind?: string; result?: Record<string, unknown> | null;
}

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

/** What the card says when Accept cannot tell who is signed in on this device (fix check of pull request 47, 24 Nov). */
export const NO_USER_BEFORE_ACCEPT = 'Not accepted. This device could not tell who is signed in. Try again, or sign in again.';

type WaitingBox = { count: number; flush(): Promise<void> };

/**
 * Whether Accept may go ahead: the person signed in on this device is known
 * (read on the device, never over the network), and what this device has
 * waiting has been sent first. Returns the refusal to show, or null to go ahead.
 * Without a person, Accept is refused rather than going ahead with changes unsent.
 */
export async function acceptRefusal(me: string | null, boxFor: (userId: string) => WaitingBox, ms = 8000): Promise<string | null> {
  if (!me) return NO_USER_BEFORE_ACCEPT;
  return (await sendWaitingFirst(boxFor(me), ms)) ? null : UNSAVED_BEFORE_ACCEPT;
}

// ---------------------------------------------------------------------------
// The coach's cards in the inbox (stage 4F, 27 Nov 2026; spec Section 4,
// "Proposals in the app", and Section 5, "Phone: coach inbox").
// ---------------------------------------------------------------------------

export type CardStatus = 'pending' | 'accepted' | 'rejected' | 'out_of_date' | 'expired';

/** A proposal row as the inbox reads it. */
export interface InboxCard {
  id: string; source: string; kind: string; applies_to: string; summary_lines: string[]; status: CardStatus;
  created_at: string; expires_at: string | null; decided_at: string | null; decline_reason: string | null;
  payload: { workout_name?: string };
}

/** The longest reason a person may give when declining (spec Section 4). */
export const REASON_MAX = 300;
/** A card with more lines than this shows the rest behind "Show all". */
export const LINES_SHOWN = 8;
/** How many cards the inbox lists (newest first). */
export const INBOX_LIMIT = 50;

/** The status to show: a waiting card whose day has ended is Expired, even before the account marks it. */
export function shownStatus(c: Pick<InboxCard, 'status' | 'expires_at'>, now: number): CardStatus {
  return c.status === 'pending' && c.expires_at && Date.parse(c.expires_at) <= now ? 'expired' : c.status;
}

/** Cards waiting for a decision now: what the Coach button counts. */
export function waitingCards<T extends Pick<InboxCard, 'status' | 'expires_at'>>(cards: T[], now: number): T[] {
  return cards.filter((c) => shownStatus(c, now) === 'pending');
}

export const STATUS_LABEL: Record<CardStatus, string> = {
  pending: 'Waiting', accepted: 'Accepted', rejected: 'Declined', out_of_date: 'Out of date', expired: 'Expired',
};

const KIND_LABEL: Record<string, string> = {
  exercise: 'An exercise', workout: 'A workout', campaign: 'A campaign', today_change: 'A change to today', profile_update: 'Your profile and gyms',
};

/** The small heading of a card. */
export function cardHeading(c: Pick<InboxCard, 'source' | 'kind'>): string {
  return c.source === 'planner' ? 'Sent from the planner' : `Coach · ${KIND_LABEL[c.kind] ?? 'A proposal'}`;
}

/** What the card applies to, in plain words (spec Section 4: today only, the library, or a campaign). */
export function appliesToText(c: Pick<InboxCard, 'source' | 'applies_to' | 'kind'>): string {
  if (c.source === 'planner') return 'Applies to today only. Your library and campaign are not changed.';
  switch (c.applies_to) {
    case 'today': return 'Applies to today only. Your library and campaign are not changed.';
    case 'library': return 'Changes your library. Workouts already done are unchanged.';
    case 'campaign': return 'Changes a campaign. A new one arrives as a draft, and your active campaign stays as it is.';
    case 'profile': return 'Changes your coach profile or gyms. Your library and campaigns are not changed.';
    default: return '';
  }
}

/** A line under a card that is no longer waiting, saying why. */
export function endedNote(c: Pick<InboxCard, 'status' | 'expires_at' | 'decline_reason'>, now: number): string {
  switch (shownStatus(c, now)) {
    case 'out_of_date': return 'Something this card would change was edited after the coach sent it, so it cannot be accepted. Dismiss it and ask your coach again.';
    case 'expired': return "This card's day ended at 3:00 am, so it expired. Nothing was changed.";
    case 'rejected': return c.decline_reason ? `Declined. Your reason: ${c.decline_reason}` : 'Declined. Nothing was changed.';
    case 'accepted': return 'Accepted.';
    default: return '';
  }
}

/**
 * The reason typed with a Decline: one line, up to 300 characters, optional.
 * Line breaks and runs of spaces become single spaces (as the account does).
 */
export function cleanReason(text: string): { ok: true; reason: string | null } | { ok: false; message: string } {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one.length > REASON_MAX) return { ok: false, message: `Keep the reason to ${REASON_MAX} characters or fewer. It is ${one.length}.` };
  return { ok: true, reason: one === '' ? null : one };
}

/**
 * The banner after Accept or Decline of a coach's card. The account's own
 * sentence says what changed and what did not; a refusal never reads as done.
 */
export function bannerFor(answer: DecideAnswer | null, accept: boolean): { ok: boolean; text: string } {
  const verb = accept ? 'accepted' : 'declined';
  if (!answer) return { ok: false, text: `Not ${verb}. The account did not answer. Try again.` };
  const said = answer.message?.trim();
  if (answer.ok === true) return { ok: true, text: said || (accept ? 'Accepted.' : 'Declined. Nothing was changed.') };
  if (!said) return { ok: false, text: `Not ${verb}. Try again.` };
  return { ok: false, text: /^not (accepted|declined)/i.test(said) ? said : `Not ${verb}. ${said}` };
}

/** Browsers get told when a card is decided, so the Coach button's count drops at once. */
export const INBOX_CHANGED_EVENT = 'chalk-inbox-changed';
