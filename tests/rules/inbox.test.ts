// The phone's Home looks at the inbox again and reads the page when a card comes or goes (Nate, 23 Nov).
import { describe, expect, it } from 'vitest';
import { cardsChanged, INBOX_CHECK_MS } from '@/rules/inbox';

describe('when the inbox changed', () => {
  it('the first look is not a change; a new, removed or swapped card is', () => {
    expect(cardsChanged(null, ['a'])).toBe(false);
    expect(cardsChanged([], ['a'])).toBe(true);
    expect(cardsChanged(['a'], [])).toBe(true);
    expect(cardsChanged(['a'], ['b'])).toBe(true);
    expect(cardsChanged(['a', 'b'], ['b', 'a'])).toBe(false);
  });
  it('an open screen looks again every 30 seconds', () => {
    expect(INBOX_CHECK_MS).toBe(30000);
  });
});

import { appliesToText, bannerFor, cleanReason, endedNote, REASON_MAX, shownStatus, waitingCards } from '@/rules/inbox';

describe("the coach's cards in the inbox (stage 4F)", () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  it('a waiting card past its end shows as expired and is not counted', () => {
    const cards = [
      { status: 'pending' as const, expires_at: null },
      { status: 'pending' as const, expires_at: '2026-11-27T13:00:00Z' },
      { status: 'pending' as const, expires_at: '2026-11-27T11:00:00Z' },
      { status: 'out_of_date' as const, expires_at: null },
      { status: 'accepted' as const, expires_at: null },
    ];
    expect(shownStatus(cards[2], now)).toBe('expired');
    expect(shownStatus(cards[3], now)).toBe('out_of_date');
    expect(waitingCards(cards, now)).toHaveLength(2);
  });
  it('a decline reason is one line of up to 300 characters, and optional', () => {
    expect(cleanReason('')).toEqual({ ok: true, reason: null });
    expect(cleanReason('   \n ')).toEqual({ ok: true, reason: null });
    expect(cleanReason('too much\nvolume   today')).toEqual({ ok: true, reason: 'too much volume today' });
    expect(cleanReason('x'.repeat(REASON_MAX))).toEqual({ ok: true, reason: 'x'.repeat(REASON_MAX) });
    expect(cleanReason('x'.repeat(REASON_MAX + 1)).ok).toBe(false);
  });
  it("the banner uses the account's sentence, and a refusal never reads as done", () => {
    expect(bannerFor({ ok: true, message: 'Accepted. Bench is updated in your library. Workouts already done are unchanged.' }, true))
      .toEqual({ ok: true, text: 'Accepted. Bench is updated in your library. Workouts already done are unchanged.' });
    expect(bannerFor({ ok: false, code: 'out_of_date', message: 'Something this card would change was edited.' }, true))
      .toEqual({ ok: false, text: 'Not accepted. Something this card would change was edited.' });
    expect(bannerFor({ ok: false, message: 'Not accepted yet. Finish the round first.' }, true).text).toBe('Not accepted yet. Finish the round first.');
    expect(bannerFor(null, false).ok).toBe(false);
  });
  it('says what each card applies to, and why an ended card ended', () => {
    expect(appliesToText({ source: 'ChatGPT', applies_to: 'today', kind: 'today_change' })).toMatch(/today only.*not changed/);
    expect(appliesToText({ source: 'ChatGPT', applies_to: 'campaign', kind: 'campaign' })).toMatch(/draft/);
    expect(appliesToText({ source: 'ChatGPT', applies_to: 'library', kind: 'workout' })).toMatch(/library/);
    expect(endedNote({ status: 'rejected', expires_at: null, decline_reason: 'too much volume' }, now)).toBe('Declined. Your reason: too much volume');
    expect(endedNote({ status: 'out_of_date', expires_at: null, decline_reason: null }, now)).toMatch(/cannot be accepted/);
    expect(endedNote({ status: 'pending', expires_at: '2026-11-27T11:00:00Z', decline_reason: null }, now)).toMatch(/expired/);
  });
});
