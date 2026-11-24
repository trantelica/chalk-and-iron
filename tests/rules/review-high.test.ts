// Fixes from the Phase 3 review at high effort (23 Nov).
import { describe, expect, it } from 'vitest';
import { daySetsForSupersets } from '@/rules/planner';
import { sendWaitingFirst, UNSAVED_BEFORE_ACCEPT } from '@/rules/inbox';

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
