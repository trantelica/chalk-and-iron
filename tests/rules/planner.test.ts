// The browser planner's rules (spec Sections 5 and 10).
import { describe, expect, it } from 'vitest';
import {
  activationNeedsConfirm, campaignEndDate, campaignIsOver, checkExerciseName, copyName, dateOfCampaignDay, effectiveRows, moveRow, nearDuplicateGroups,
  nextBlankWeek, nextSupersetLetter, overrideChange, planFromRows, removeRow, rowBudget, setRowSets, setRowSuperset, setsToDelete, typedToPounds, viewWeight,
  workoutProblems, type OverrideRow, type WorkoutRow,
} from '@/rules/planner';
import { campaignPosition } from '@/rules/days';
import { canDeleteTerm, nameTaken, termUsage } from '@/rules/vocabulary';

const lib = [
  { id: 'e1', name: 'Incline Dumbbell Press', archived: false },
  { id: 'e2', name: 'Barbell Curl', archived: false },
  { id: 'e3', name: 'Old Press', archived: true },
];

describe('exercise names', () => {
  it('warns about a near-duplicate but lets it be saved', () => {
    const c = checkExerciseName('DB Incline Presses', lib);
    expect(c.error).toBeNull();
    expect(c.warning).toContain('Incline Dumbbell Press');
  });
  it('refuses an empty name or the exact name of a live exercise, ignoring capitals', () => {
    expect(checkExerciseName('  ', lib).error).toBeTruthy();
    expect(checkExerciseName('barbell curl', lib).error).toContain('already in your library');
  });
  it('lets an exercise keep its own name on a rename, and ignores archived ones', () => {
    expect(checkExerciseName('Barbell Curl', lib, 'e2')).toEqual({ error: null, warning: null });
    expect(checkExerciseName('Old Press', lib)).toEqual({ error: null, warning: null });
  });
  it('finds near-duplicate pairs among live exercises', () => {
    const g = nearDuplicateGroups([...lib, { id: 'e4', name: 'Dumbbell Incline Press', archived: false }]);
    expect(g.get('e1')).toEqual(['Dumbbell Incline Press']);
    expect(g.has('e2')).toBe(false);
  });
});

const rows = (): WorkoutRow[] => [
  { id: 'a', exerciseId: 'e1', sets: 3, reps: 8, rest: null, superset: 'A' },
  { id: 'b', exerciseId: 'e2', sets: 3, reps: 12, rest: 90, superset: 'A' },
  { id: 'c', exerciseId: 'e3', sets: 4, reps: 10, rest: null, superset: null },
];

describe('workout rows: supersets stay paired and equal', () => {
  it('changing one member\'s sets changes every member, and no other row', () => {
    const next = setRowSets(rows(), 0, 5);
    expect(next.map((r) => r.sets)).toEqual([5, 5, 4]);
    expect(setRowSets(rows(), 2, 6).map((r) => r.sets)).toEqual([3, 3, 6]);
  });
  it('a row joining a superset takes its set count', () => {
    const res = setRowSuperset(rows(), 2, 'A');
    expect(res.problem).toBeNull();
    expect(res.rows.map((r) => r.sets)).toEqual([3, 3, 3]);
    expect(workoutProblems(res.rows)).toEqual([]);
  });
  it('refuses a fourth member', () => {
    const three = setRowSuperset(rows(), 2, 'A').rows;
    const res = setRowSuperset([...three, { id: 'd', exerciseId: 'e1', sets: 2, reps: 5, rest: null, superset: null }], 3, 'A');
    expect(res.problem).toMatch(/two or three/);
  });
  it('leaving a superset changes nothing else; a one-member superset is a problem', () => {
    expect(setRowSuperset(rows(), 1, null).rows[1].superset).toBeNull();
    expect(workoutProblems(setRowSuperset(rows(), 1, null).rows)[0]).toMatch(/Superset A has 1 exercise/);
  });
  it('removing a member of a pair frees the partner; removing from a trio keeps the pair', () => {
    expect(removeRow(rows(), 0).map((r) => r.superset)).toEqual([null, null]);
    const trio = setRowSuperset(rows(), 2, 'A').rows;
    expect(removeRow(trio, 0).map((r) => r.superset)).toEqual(['A', 'A']);
  });
  it('offers the next unused letter, and reorders', () => {
    expect(nextSupersetLetter(rows())).toBe('B');
    expect(moveRow(rows(), 0, 1).map((r) => r.id)).toEqual(['b', 'a', 'c']);
    expect(moveRow(rows(), 0, -1).map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('names copies', () => {
    expect(copyName('Push A', ['Push A'])).toBe('Push A (copy)');
    expect(copyName('Push A (copy)', ['Push A', 'Push A (copy)'])).toBe('Push A (copy 2)');
  });
  it('shows a row\'s budget by the single and superset rules', () => {
    const exercise = (id: string) => ({ e1: { work: 45, rest: 120 }, e2: { work: 40, rest: 90 }, e3: { work: 50, rest: 150 } } as Record<string, { work: number; rest: number }>)[id];
    expect(rowBudget(rows(), 2, exercise)).toBe(4 * 50 + 3 * 150);
    // superset: 3 rounds x (45 + 40) + 2 x the first member's rest (120)
    expect(rowBudget(rows(), 0, exercise)).toBe(3 * 85 + 2 * 120);
  });
});

const ovr = (p: Partial<OverrideRow>): OverrideRow => ({ campaignDayId: 'd1', workoutItemId: 'c', exerciseId: null, sets: null, reps: null, weightLb: null, weightValue: null, weightUnit: null, rest: null, ...p });

describe('day overrides', () => {
  it('overriding reps on one day leaves the library rows alone and shows the library value beside it', () => {
    const [upsert] = overrideChange(rows(), [], 'd1', 'c', 'reps', 12);
    const eff = effectiveRows(rows(), [upsert]);
    expect(eff[2].reps).toBe(12);
    expect(eff[2].library.reps).toBe(10);
    expect(rows()[2].reps).toBe(10);
    expect(eff[0].library).toEqual({});
  });
  it('a value equal to the library\'s clears the override', () => {
    const [u] = overrideChange(rows(), [ovr({ reps: 12 })], 'd1', 'c', 'reps', 10);
    expect(u.reps).toBeNull();
    expect(effectiveRows(rows(), [u])[2].library).toEqual({});
  });
  it('a sets override on one superset member goes to every member, in one write', () => {
    const ups = overrideChange(rows(), [], 'd1', 'a', 'sets', 5);
    expect(ups.map((u) => [u.workoutItemId, u.sets])).toEqual([['a', 5], ['b', 5]]);
    expect(effectiveRows(rows(), ups).map((r) => r.sets)).toEqual([5, 5, 4]);
  });
  it('overrides the exercise, rest and weight', () => {
    const e = effectiveRows(rows(), [
      ...overrideChange(rows(), [], 'd1', 'c', 'exerciseId', 'e2'),
      ...overrideChange(rows(), [], 'd1', 'a', 'rest', 60),
      ...overrideChange(rows(), [], 'd1', 'b', 'weight', { lb: 60.627, value: 27.5, unit: 'kg' }),
    ]);
    expect(e[2].exerciseId).toBe('e2');
    expect(e[2].library.exerciseId).toBe('e3');
    expect(e[0].rest).toBe(60);
    expect(e[1].weightLb).toBe(60.627);
    expect(e[1].library.weight).toBe(true);
  });
  it('builds the plan a phone starts from, with overrides applied', () => {
    const ups = overrideChange(rows(), [], 'd1', 'c', 'reps', 12);
    expect(planFromRows(effectiveRows(rows(), ups))).toEqual([
      { exercise_id: 'e1', sets: 3, reps: 8, superset_letter: 'A' },
      { exercise_id: 'e2', sets: 3, reps: 12, rest_seconds: 90, superset_letter: 'A' },
      { exercise_id: 'e3', sets: 4, reps: 12 },
    ]);
  });
});

describe('campaigns', () => {
  it('works out the last day, with shifted weeks', () => {
    expect(campaignEndDate('2026-11-18', 4)).toBe('2026-12-13');
    expect(campaignEndDate('2026-11-18', 4, ['2026-11-30'])).toBe('2026-12-20');
    expect(campaignIsOver('2026-12-14', '2026-11-18', 4)).toBe(true);
    expect(campaignIsOver('2026-12-13', '2026-11-18', 4)).toBe(false);
  });
  it('a shift leaves the current week blank, and stacks', () => {
    expect(nextBlankWeek('2026-11-19', '2026-11-16', [])).toBe('2026-11-16');
    expect(nextBlankWeek('2026-11-19', '2026-11-16', ['2026-11-16'])).toBe('2026-11-23');
    expect(nextBlankWeek('2026-11-01', '2026-11-16', [])).toBe('2026-11-16');
  });
  it('dates of a campaign day agree with where the app places a date in the campaign', () => {
    const blank = ['2026-11-30'];
    for (const [week, weekday] of [[1, 1], [2, 3], [3, 7], [4, 1]] as const) {
      const date = dateOfCampaignDay('2026-11-16', week, weekday, blank);
      expect(campaignPosition(date, '2026-11-16', 4, blank)).toEqual({ week, weekday });
    }
    expect(dateOfCampaignDay('2026-11-16', 3, 1, blank)).toBe('2026-12-07');
  });
  it('activating asks for confirmation only when another campaign is active', () => {
    const cs = [{ id: 'x', name: 'Block 1', status: 'active' }, { id: 'y', name: 'Block 2', status: 'draft' }];
    expect(activationNeedsConfirm(cs, 'y')).toBe('Block 1');
    expect(activationNeedsConfirm(cs, 'x')).toBeNull();
    expect(activationNeedsConfirm([{ id: 'y', name: 'Block 2', status: 'draft' }], 'y')).toBeNull();
  });
});

describe('the pounds or kilograms view toggle', () => {
  it('converts stored pounds for display, to one decimal, and back', () => {
    expect(viewWeight(60, 'kg')).toBe('27.2 kg');
    expect(viewWeight(60, 'lb')).toBe('60 lb');
    expect(viewWeight(100, 'kg')).toBe('45.4 kg');
    expect(typedToPounds(27.5, 'kg')).toBe(60.627);
    expect(typedToPounds(60, 'lb')).toBe(60);
  });
});

describe('deleting a logged set in History', () => {
  const sets: Record<string, { id: string; setNumber: number }[]> = {
    s1: [{ id: 'a1', setNumber: 1 }, { id: 'a2', setNumber: 2 }],
    s2: [{ id: 'b1', setNumber: 1 }, { id: 'b2', setNumber: 2 }],
    s3: [{ id: 'c1', setNumber: 1 }],
  };
  const block = (id: string) => (id === 's3' ? { block: 'x', members: ['s3'] } : { block: 'ss', members: ['s1', 's2'] });
  it('in a superset deletes the whole round for every member', () => {
    expect(setsToDelete({ id: 'a2', sessionExerciseId: 's1', setNumber: 2 }, block, (id) => sets[id])).toEqual(['a2', 'b2']);
  });
  it('outside a superset deletes only that set', () => {
    expect(setsToDelete({ id: 'c1', sessionExerciseId: 's3', setNumber: 1 }, block, (id) => sets[id])).toEqual(['c1']);
  });
});

describe('vocabulary', () => {
  const ex = [
    { muscle_group_id: 'chest', focus_id: 'upper', equipment_id: 'bb' },
    { muscle_group_id: 'chest', focus_id: null, equipment_id: 'db' },
  ];
  const terms = [{ id: 'chest', parent_id: null }, { id: 'upper', parent_id: 'chest' }, { id: 'lower', parent_id: 'chest' }, { id: 'bb', parent_id: null }, { id: 'cable', parent_id: null }];
  it('counts what uses each value, and only an unused value can be deleted', () => {
    const use = termUsage(ex);
    expect(use.get('chest')).toBe(2);
    expect(canDeleteTerm({ id: 'upper', kind: 'focus' }, terms, use)).toBe(false);
    expect(canDeleteTerm({ id: 'lower', kind: 'focus' }, terms, use)).toBe(true);
    expect(canDeleteTerm({ id: 'cable', kind: 'equipment' }, terms, use)).toBe(true);
    expect(canDeleteTerm({ id: 'chest', kind: 'muscle_group' }, terms, use)).toBe(false);
  });
  it('spots a name already in the list', () => {
    expect(nameTaken(' Cable ', [{ id: '1', name: 'cable' }])).toBe(true);
    expect(nameTaken('cable', [{ id: '1', name: 'cable' }], '1')).toBe(false);
  });
});
