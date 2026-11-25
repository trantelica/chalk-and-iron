// Fixes from the Phase 3 review at high effort (23 Nov).
import { describe, expect, it } from 'vitest';
import { daySetsForSupersets } from '@/rules/planner';
import { acceptRefusal, NO_USER_BEFORE_ACCEPT, sendWaitingFirst, UNSAVED_BEFORE_ACCEPT } from '@/rules/inbox';
import { idsToAskReplaced } from '@/rules/sync';

const row = (id: string, sets: number, superset: string | null) => ({ id, sets, superset });
const ov = (item: string, sets: number | null, day = 'd1') => ({ campaignDayId: day, workoutItemId: item, sets });

describe('day overrides that keep supersets even when a workout changes', () => {
  const before = [row('x', 3, 'A'), row('y', 3, 'A'), row('z', 3, null)];
  const joined = [row('x', 3, 'A'), row('y', 3, 'A'), row('z', 3, 'A')];

  it('needs nothing when no day overrides the sets', () => {
    expect(daySetsForSupersets(before, joined, ['d1'], [], 'z')).toEqual([]);
  });
  it('a joining row with a day override of its own takes the superset\'s count on that day', () => {
    expect(daySetsForSupersets(before, joined, ['d1'], [ov('z', 5)], 'z')).toEqual([{ campaignDayId: 'd1', workoutItemId: 'z', sets: null }]);
  });
  it('a joining row takes a day\'s overridden superset count', () => {
    expect(daySetsForSupersets(before, joined, ['d1', 'd2'], [ov('x', 5), ov('y', 5)], 'z')).toEqual([{ campaignDayId: 'd1', workoutItemId: 'z', sets: 5 }]);
  });
  it('a new superset takes the count of the row that started it, on each day', () => {
    const b = [row('p', 3, null), row('q', 4, null)];
    const a = [row('p', 3, 'B'), row('q', 3, 'B')];
    expect(daySetsForSupersets(b, a, ['d1'], [ov('p', 6)], 'p')).toEqual([{ campaignDayId: 'd1', workoutItemId: 'q', sets: 6 }]);
    expect(daySetsForSupersets(b, a, ['d1'], [ov('q', 6)], 'p')).toEqual([{ campaignDayId: 'd1', workoutItemId: 'q', sets: null }]);
  });
  it('a day already even is left alone', () => {
    expect(daySetsForSupersets(before, before, ['d1'], [ov('x', 5), ov('y', 5), ov('z', 2)])).toEqual([]);
  });
});

describe('Accept sends what this phone has waiting first', () => {
  it('goes ahead at once when nothing is waiting, or with no outbox', async () => {
    expect(await sendWaitingFirst(null)).toBe(true);
    expect(await sendWaitingFirst({ count: 0, flush: () => Promise.reject(new Error('not called')) })).toBe(true);
  });
  it('goes ahead once the waiting changes are saved', async () => {
    const box = { count: 2, flush: async () => { box.count = 0; } };
    expect(await sendWaitingFirst(box)).toBe(true);
  });
  it('stops when the changes cannot be sent (no connection), and when sending stalls', async () => {
    expect(await sendWaitingFirst({ count: 2, flush: () => Promise.reject(new Error('offline')) })).toBe(false);
    expect(await sendWaitingFirst({ count: 1, flush: () => new Promise<void>(() => {}) }, 20)).toBe(false);
    expect(UNSAVED_BEFORE_ACCEPT).toMatch(/^Not accepted\./);
  });
});

// Fix check of pull request 47 (24 Nov), findings 2 and 4.
describe('Accept with no one known to be signed in on this device', () => {
  const never = () => { throw new Error('the outbox is not looked at'); };
  it('is refused, rather than going ahead with changes unsent', async () => {
    expect(await acceptRefusal(null, never)).toBe(NO_USER_BEFORE_ACCEPT);
    expect(NO_USER_BEFORE_ACCEPT).toMatch(/^Not accepted\./);
  });
  it('goes ahead for the person signed in once nothing waits, and is refused while changes cannot be sent', async () => {
    expect(await acceptRefusal('u1', () => ({ count: 0, flush: async () => {} }))).toBeNull();
    expect(await acceptRefusal('u1', () => ({ count: 1, flush: () => Promise.reject(new Error('offline')) }))).toBe(UNSAVED_BEFORE_ACCEPT);
  });
});

describe('asking the account whether a workout was replaced', () => {
  it('leaves out a workout whose own copy is still waiting to be sent', () => {
    const waiting = [{ kind: 'session.put' as const, key: 'session:s1' }, { kind: 'set.put' as const, key: 'set:x' }];
    expect(idsToAskReplaced(['s1', 's2', null, undefined, 's2'], waiting)).toEqual(['s2']);
  });
  it('asks about every workout once nothing waits', () => {
    expect(idsToAskReplaced(['s1', 's2'], [])).toEqual(['s1', 's2']);
  });
});
