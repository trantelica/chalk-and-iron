import { describe, expect, it } from 'vitest';
import { todayView, type TodayInput } from '@/rules/today';
import { sessionRows } from '@/rules/sync';
import { startSession } from '@/rules/session';

// The Home screen's Today panel (spec Section 5 "Phone: new screens", Section
// 10 "Days and weeks").
const base = (over: Partial<TodayInput> = {}): TodayInput => ({
  date: '2026-11-19', // a Thursday
  campaigns: [{ id: 'c1', name: 'Base Block', start_date: '2026-11-16', week_count: 4, status: 'active' }],
  days: [
    { id: 'd-mon', campaign_id: 'c1', week: 1, weekday: 1, workout_id: 'w-push' },
    { id: 'd-tue', campaign_id: 'c1', week: 1, weekday: 2, workout_id: 'w-pull' },
    { id: 'd-thu', campaign_id: 'c1', week: 1, weekday: 4, workout_id: 'w-push' },
    { id: 'd-sat', campaign_id: 'c1', week: 1, weekday: 6, workout_id: 'w-pull' },
  ],
  shifts: [],
  overrides: [],
  workouts: [{ id: 'w-push', name: 'Push' }, { id: 'w-pull', name: 'Pull' }],
  items: [
    { id: 'i1', workout_id: 'w-push', position: 0, exercise_id: 'bench', sets: 3, reps: 8, rest_seconds: null, superset_letter: null },
    { id: 'i2', workout_id: 'w-push', position: 1, exercise_id: 'fly', sets: 3, reps: 12, rest_seconds: 60, superset_letter: 'A' },
    { id: 'i3', workout_id: 'w-push', position: 2, exercise_id: 'dip', sets: 3, reps: 10, rest_seconds: null, superset_letter: 'A' },
    { id: 'i4', workout_id: 'w-pull', position: 0, exercise_id: 'row', sets: 4, reps: 8, rest_seconds: null, superset_letter: null },
  ],
  todayPlans: [],
  sessions: [],
  ...over,
});

describe("today's workout", () => {
  it("is the active campaign's day for today, in the workout's order", () => {
    const v = todayView(base());
    expect(v.workout?.name).toBe('Push');
    expect(v.workout?.campaignDayId).toBe('d-thu');
    expect(v.workout?.items.map((i) => i.exerciseId)).toEqual(['bench', 'fly', 'dip']);
    expect(v.workout?.items[1]).toMatchObject({ rest: 60, superset: 'A' });
  });

  it("carries that day's overrides, and only that day's", () => {
    const v = todayView(base({ overrides: [
      { campaign_day_id: 'd-thu', workout_item_id: 'i1', exercise_id: 'incline', sets: 5, reps: 5, weight_lb: '185', rest_seconds: 180 },
      { campaign_day_id: 'd-mon', workout_item_id: 'i2', exercise_id: null, sets: 6, reps: null, weight_lb: null, rest_seconds: null },
    ] }));
    expect(v.workout?.items[0]).toEqual({ exerciseId: 'incline', sets: 5, reps: 5, rest: 180, superset: null, weightLb: 185 });
    expect(v.workout?.items[1].sets).toBe(3);
  });

  it('a plan sent to the phone for today wins over the campaign day', () => {
    const v = todayView(base({ todayPlans: [{
      id: 'tp1', local_date: '2026-11-19', workout_id: 'w-pull', campaign_day_id: null, consumed_at: null, created_at: '2026-11-19T08:00:00Z',
      plan: [{ exercise_id: 'row', sets: 5, reps: 5, weight_lb: 135 }],
    }] }));
    expect(v.workout).toMatchObject({ name: 'Pull', todayPlanId: 'tp1', campaignDayId: null });
    expect(v.workout?.items).toEqual([{ exerciseId: 'row', sets: 5, reps: 5, rest: null, superset: null, weightLb: 135 }]);
  });

  it('a used plan, or one for another day, is passed over', () => {
    const v = todayView(base({ todayPlans: [
      { id: 'tp1', local_date: '2026-11-19', workout_id: 'w-pull', campaign_day_id: null, consumed_at: '2026-11-19T09:00:00Z', created_at: '2026-11-19T08:00:00Z', plan: [] },
      { id: 'tp2', local_date: '2026-11-18', workout_id: 'w-pull', campaign_day_id: null, consumed_at: null, created_at: '2026-11-18T08:00:00Z', plan: [{ exercise_id: 'row' }] },
    ] }));
    expect(v.workout?.name).toBe('Push');
  });

  it('is nothing on a rest day, with no active campaign, or outside the campaign', () => {
    expect(todayView(base({ date: '2026-11-20' })).workout).toBeNull(); // Friday: rest
    expect(todayView(base({ campaigns: [] })).workout).toBeNull();
    expect(todayView(base({ date: '2026-12-17' })).workout).toBeNull(); // after week 4
  });

  it('a shifted week pushes the days back a week', () => {
    // The week of 16 Nov made blank: the campaign's week 1 runs the next week.
    const v = todayView(base({ shifts: [{ campaign_id: 'c1', blank_week_starts_on: '2026-11-16' }], date: '2026-11-26' }));
    expect(v.workout?.campaignDayId).toBe('d-thu');
    expect(todayView(base({ shifts: [{ campaign_id: 'c1', blank_week_starts_on: '2026-11-16' }] })).workout).toBeNull();
  });

  it('shows as done once a session from it is finished today', () => {
    const v = todayView(base({ sessions: [{ id: 's1', local_date: '2026-11-19', status: 'finished', campaign_day_id: 'd-thu', workout_name: 'Push' }] }));
    expect(v.doneToday).toBe(true);
    expect(todayView(base({ sessions: [{ id: 's1', local_date: '2026-11-19', status: 'active', campaign_day_id: 'd-thu', workout_name: 'Push' }] })).doneToday).toBe(false);
  });
});

describe('the campaign week at a glance', () => {
  it('runs Monday to Sunday with each day done, missed, today, upcoming or rest', () => {
    const v = todayView(base({ sessions: [{ id: 's1', local_date: '2026-11-16', status: 'finished', campaign_day_id: 'd-mon', workout_name: 'Push' }] }));
    expect(v.campaign).toMatchObject({ name: 'Base Block', week: 1, weekCount: 4 });
    expect(v.campaign!.days.map((d) => [d.label, d.workout, d.state])).toEqual([
      ['Mon', 'Push', 'done'], ['Tue', 'Pull', 'missed'], ['Wed', null, 'rest'], ['Thu', 'Push', 'today'],
      ['Fri', null, 'rest'], ['Sat', 'Pull', 'upcoming'], ['Sun', null, 'rest'],
    ]);
  });

  it('a day done on a later day counts as done', () => {
    const v = todayView(base({ sessions: [{ id: 's1', local_date: '2026-11-18', status: 'finished', campaign_day_id: 'd-tue', workout_name: 'Pull' }] }));
    expect(v.campaign!.days[1].state).toBe('done');
  });

  it('days before the campaign starts are not part of it', () => {
    const v = todayView(base({ campaigns: [{ id: 'c1', name: 'Base Block', start_date: '2026-11-18', week_count: 4, status: 'active' }] }));
    expect(v.campaign!.days.slice(0, 2).map((d) => d.state)).toEqual(['off', 'off']);
  });

  it('there is none without an active campaign', () => {
    expect(todayView(base({ campaigns: [{ id: 'c1', name: 'Draft', start_date: '2026-11-16', week_count: 4, status: 'draft' }] })).campaign).toBeNull();
  });
});

describe('a workout started from the Today panel', () => {
  it('is saved as the campaign day it came from, and names the prepared plan it used', () => {
    const s0 = startSession('Push', '2026-11-19', [{ exerciseId: 'bench', name: 'Bench', muscle: '', equipment: '', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 120, sets: 3, reps: 8, alternates: [] }], {}, 1000, (_i, n) => Array(n).fill(null));
    const rows = sessionRows({ ...s0, campaignDayId: 'd-thu', todayPlanId: 'tp1' });
    expect(rows.session).toMatchObject({ source_kind: 'campaign_day', campaign_day_id: 'd-thu' });
    expect(rows.today_plan_id).toBe('tp1');
    expect(sessionRows(s0).session).toMatchObject({ source_kind: 'ad_hoc', campaign_day_id: null });
  });
});
