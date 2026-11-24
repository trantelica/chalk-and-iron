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
