// Fixes from the Phase 3 review (24 Nov 2026), findings 1, 2 and 6.
import { describe, expect, it } from 'vitest';
import { maxPlanWeight, startSuperset, workoutProblems } from '@/rules/planner';
import { decisionMessage } from '@/rules/inbox';

const row = (id: string, sets: number, superset: string | null = null) => ({ id, sets, superset });

describe('finding 1: a new superset can be made from scratch', () => {
  it('pairs the row with the next exercise, which takes its sets, and the result saves', () => {
    const res = startSuperset([row('a', 4), row('b', 3), row('c', 2)], 0);
    expect(res.problem).toBeNull();
    expect(res.rows.map((r) => [r.superset, r.sets])).toEqual([['A', 4], ['A', 4], [null, 2]]);
    expect(workoutProblems(res.rows)).toEqual([]);
  });
  it('on the last row, pairs with the one before; skips rows already in a superset', () => {
    expect(startSuperset([row('a', 3), row('b', 3)], 1).rows.map((r) => r.superset)).toEqual(['A', 'A']);
    const r = startSuperset([row('a', 3, 'A'), row('b', 3, 'A'), row('c', 5), row('d', 2)], 2).rows;
    expect(r.map((x) => [x.superset, x.sets])).toEqual([['A', 3], ['A', 3], ['B', 5], ['B', 5]]);
  });
  it('says plainly when there is no free partner', () => {
    expect(startSuperset([row('a', 3)], 0).problem).toMatch(/second exercise/);
  });
});

describe('finding 2: the card never says Accepted when the account refused', () => {
  it('shows the account\'s own reason for a refusal', () => {
    expect(decisionMessage({ ok: false, code: 'already_decided', message: 'This card was already decided.' }, true, 'Legs'))
      .toEqual({ ok: false, text: 'Not accepted. This card was already decided.' });
    expect(decisionMessage(null, false, 'Legs').ok).toBe(false);
  });
  it('confirms a real Accept or Dismiss', () => {
    expect(decisionMessage({ ok: true, status: 'accepted' }, true, 'Legs').text).toMatch(/^Accepted\. Legs is today's workout/);
    expect(decisionMessage({ ok: true, status: 'rejected' }, false, 'Legs').text).toBe('Dismissed. Nothing changed.');
  });
});

describe('finding 6: one weight limit', () => {
  it('is 2000 lb, the same as the account checks on Accept, shown in the view unit', () => {
    expect(maxPlanWeight('lb')).toBe(2000);
    expect(maxPlanWeight('kg')).toBe(907);
  });
});
