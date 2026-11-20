import { describe, expect, it } from 'vitest';
import { efficiencyOf, finishSession, startExercise, startSession, type PlanItem } from '@/rules/session';
import { exerciseState, sessionFromRows, sessionRows, wasReplaced } from '@/rules/sync';
import { planItems, planName, todayView, type TodayInput } from '@/rules/today';

// A workout replaced by a day sent from the planner (spec Section 10,
// "Proposals"): exercises not reached are Replaced and left out of
// efficiency; the replaced workout never counts as today's being done.

const item = (exerciseId: string, name: string): PlanItem => ({
  exerciseId, name, muscle: '', equipment: '', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 90, sets: 3, reps: 8, alternates: [],
});
const T = Date.parse('2026-11-20T17:00:00Z');

describe('an exercise marked Replaced in the account', () => {
  const s0 = startExercise(startSession('Push A', '2026-11-20', [item('bench', 'Bench'), item('curl', 'Curl')], {}, T, (_i, n) => Array(n).fill(null)), T + 1000);
  const s = finishSession(s0, T + 61000, 'replaced');
  const rows = sessionRows(s);

  const readBack = (state: string) => {
    const exercises = rows.exercises.map((x, i) => (i === 0 ? { ...x, state } : x));
    return sessionFromRows(rows.session, rows.blocks, exercises, [], () => undefined);
  };

  it('is left out of efficiency, even when it was started before the workout was replaced', () => {
    // Bench was started (its clock ran a minute) but no set was logged.
    expect(efficiencyOf(readBack('replaced'), T + 61000)).toBeNull();
    // Read as an open exercise instead, its minute would count against the workout.
    expect(efficiencyOf(readBack('open'), T + 61000)).toBe(0);
  });

  it('stays Replaced when the phone writes it back, and shows as not done', () => {
    const back = readBack('replaced');
    const bench = Object.values(back.exercises).find((e) => e.exerciseId === 'bench')!;
    expect(bench).toMatchObject({ replaced: true, skipped: true });
    expect(exerciseState(back, bench)).toBe('replaced');
    expect(sessionRows(back).exercises.find((x) => x.exercise_id === 'bench')!.state).toBe('replaced');
    expect(sessionRows(back).session.finish_reason).toBe('replaced');
  });
});

describe("the account's answer", () => {
  it('names the replaced workouts, and an older answer without the list names none', () => {
    expect(wasReplaced({ replaced: ['s1'] }, 's1')).toBe(true);
    expect(wasReplaced({ replaced: ['s1'] }, 's2')).toBe(false);
    expect(wasReplaced({}, 's1')).toBe(false);
    expect(wasReplaced({ replaced: ['s1'] }, null)).toBe(false);
  });
});

describe('Today, after a day sent from the planner is accepted mid-workout', () => {
  const base: TodayInput = {
    date: '2026-11-20', campaigns: [], days: [], shifts: [], overrides: [], workouts: [], items: [],
    todayPlans: [{
      id: 'tp1', local_date: '2026-11-20', workout_id: null, campaign_day_id: null, consumed_at: null, created_at: '2026-11-20T17:05:00Z',
      plan: { items: [{ exercise_id: 'row', sets: 4, reps: 8 }], name: 'Pull B' },
    }],
    sessions: [],
  };

  it("shows the sent day by its own name, with the plan's exercises", () => {
    const v = todayView(base);
    expect(v.workout).toMatchObject({ name: 'Pull B', todayPlanId: 'tp1' });
    expect(v.workout?.items).toEqual(planItems(base.todayPlans[0].plan));
    expect(planName([{ exercise_id: 'row' }])).toBeNull();
  });

  it('is not marked done by the replaced workout, even with the same name', () => {
    const replaced = { id: 's1', local_date: '2026-11-20', status: 'finished', campaign_day_id: null, workout_name: 'Pull B', finish_reason: 'replaced' };
    expect(todayView({ ...base, sessions: [replaced] }).doneToday).toBe(false);
    expect(todayView({ ...base, sessions: [{ ...replaced, finish_reason: 'user' }] }).doneToday).toBe(true);
  });
});
