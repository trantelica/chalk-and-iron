// The rules that apply a coach's change to today (stage 4D): today's plan
// before the workout starts, the ids new rows take, and the replay a phone
// makes of a change accepted elsewhere.
import { describe, expect, it } from 'vitest';
import { applyToPlan, idsFrom, replayAccepted, type ExerciseFacts } from '@/rules/today-change';
import { startSession, type PlanItem } from '@/rules/session';
import type { TodayItem } from '@/rules/today';

const lib: Record<string, ExerciseFacts> = Object.fromEntries(['bench', 'row', 'curl', 'raise', 'dips', 'old'].map((id) => [id, {
  id, name: id[0].toUpperCase() + id.slice(1), muscle: '', equipment: '', unit: id === 'dips' ? 'bw' : 'lb', assisted: false, loadCount: 1,
  alternates: [], work: 45, rest: 90, archived: id === 'old',
} as ExerciseFacts]));
const facts = (id: string) => lib[id];
const item = (exerciseId: string, superset: string | null = null, sets = 3): TodayItem => ({ exerciseId, sets, reps: 8, rest: null, superset, weightLb: null });

describe("today's plan", () => {
  const plan = [item('bench'), item('row', 'A'), item('curl', 'A'), item('dips')];

  it('reorders by place, a superset moving as one', () => {
    const r = applyToPlan(plan, [{ action: 'reorder', exercise_id: 'curl', position: 1 }], facts);
    expect(r.ok && r.items.map((i) => i.exerciseId)).toEqual(['row', 'curl', 'bench', 'dips']);
  });

  it('a superset left with one member is no longer a superset', () => {
    const r = applyToPlan(plan, [{ action: 'remove', exercise_id: 'row' }], facts);
    expect(r.ok && r.items.map((i) => [i.exerciseId, i.superset])).toEqual([['bench', null], ['curl', null], ['dips', null]]);
  });

  it('sets for a superset member change every member', () => {
    const r = applyToPlan(plan, [{ action: 'set_sets', exercise_id: 'row', sets: 5 }], facts);
    expect(r.ok && r.items.map((i) => i.sets)).toEqual([3, 5, 5, 3]);
  });

  it('refuses all of it when one change does not fit: an archived exercise, a weight on bodyweight, an exercise not there', () => {
    expect(applyToPlan(plan, [{ action: 'set_reps', exercise_id: 'bench', reps: 5 }, { action: 'swap', exercise_id: 'curl', to_exercise_id: 'old' }], facts))
      .toMatchObject({ ok: false, final: true });
    expect(applyToPlan(plan, [{ action: 'set_weight', exercise_id: 'dips', weight_lb: 20 }], facts)).toMatchObject({ ok: false });
    expect(applyToPlan(plan, [{ action: 'remove', exercise_id: 'raise' }], facts)).toMatchObject({ ok: false });
  });
});

describe('ids for new rows', () => {
  it('are the same for the same proposal, different for another, and valid ids', () => {
    const a = idsFrom('6f1c2a7e-0b1d-4c3e-9a55-1e2f3a4b5c6d');
    const b = idsFrom('6f1c2a7e-0b1d-4c3e-9a55-1e2f3a4b5c6d');
    const c = idsFrom('11111111-2222-3333-4444-555555555555');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(new Set(xs).size).toBe(3);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) expect(x).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe('the phone replaying an accepted change', () => {
  const p = (id: string): PlanItem => ({ ...lib[id], exerciseId: id, sets: 3, reps: 8 });
  const s0 = startSession('Push', '2026-11-26', [p('bench'), p('curl')], {}, 0, (_, n) => Array.from({ length: n }, () => null));

  it('applies each revision it does not have, once, and passes over a change that no longer fits', () => {
    const accepted = [
      { proposalId: '6f1c2a7e-0b1d-4c3e-9a55-1e2f3a4b5c6d', revision: 1, changes: [{ action: 'add' as const, exercise_id: 'raise', sets: 2, reps: 15 }] },
      { proposalId: '11111111-2222-3333-4444-555555555555', revision: 2, changes: [{ action: 'remove' as const, exercise_id: 'dips' }, { action: 'set_reps' as const, exercise_id: 'curl', reps: 12 }] },
    ];
    const s1 = replayAccepted(s0, accepted, facts, (_, n) => Array.from({ length: n }, () => null), 1000);
    expect(s1.planRevision).toBe(2);
    expect(Object.values(s1.exercises).map((e) => [e.exerciseId, e.plannedReps])).toEqual([['bench', 8], ['curl', 12], ['raise', 15]]);
    // Again: nothing more happens.
    expect(replayAccepted(s1, accepted, facts, () => [], 2000)).toEqual(s1);
  });
});
