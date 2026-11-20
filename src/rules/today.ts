// The Home screen's Today panel (spec Section 5, "Phone: new screens"; Section
// 10, "Days and weeks"): what is planned for today, and the campaign week at a
// glance. Plain functions over the account's rows, so the tests can run them.
//
// Today's workout is, in order:
//   1. a prepared plan for today (today_plans), made when a day is sent from
//      the planner or a today proposal is accepted before the session starts;
//   2. otherwise the active campaign's day for today, with that day's
//      overrides applied (the library workout itself is never changed);
//   3. otherwise nothing: a rest day, or no active campaign.

import { addDays, campaignPosition, mondayOf } from './days';

export interface TodayItem {
  exerciseId: string; sets: number; reps: number; rest: number | null; superset: string | null; weightLb: number | null;
}

export interface TodayWorkout {
  name: string;
  workoutId: string | null;
  campaignDayId: string | null;
  todayPlanId: string | null;
  items: TodayItem[];
}

export interface CampaignRow { id: string; name: string; start_date: string; week_count: number; status: string }
export interface CampaignDayRow { id: string; campaign_id: string; week: number; weekday: number; workout_id: string }
export interface ShiftRow { campaign_id: string; blank_week_starts_on: string }
export interface OverrideRow {
  campaign_day_id: string; workout_item_id: string; exercise_id: string | null; sets: number | null; reps: number | null;
  weight_lb: number | string | null; rest_seconds: number | null;
}
export interface WorkoutRow { id: string; name: string; archived_at?: string | null }
export interface WorkoutItemRow {
  id: string; workout_id: string; position: number; exercise_id: string; sets: number; reps: number;
  rest_seconds: number | null; superset_letter: string | null;
}
export interface TodayPlanRow { id: string; local_date: string; workout_id: string | null; campaign_day_id: string | null; plan: unknown; consumed_at: string | null; created_at: string }
export interface SessionRow { id: string; local_date: string; status: string; campaign_day_id: string | null; workout_name: string }

export interface TodayInput {
  date: string;
  campaigns: CampaignRow[];
  days: CampaignDayRow[];
  shifts: ShiftRow[];
  overrides: OverrideRow[];
  workouts: WorkoutRow[];
  items: WorkoutItemRow[];
  todayPlans: TodayPlanRow[];
  sessions: SessionRow[];
}

export type DayState = 'done' | 'missed' | 'today' | 'upcoming' | 'rest' | 'off';

export interface WeekDay { date: string; weekday: number; label: string; workout: string | null; state: DayState }

export interface TodayView {
  workout: TodayWorkout | null;
  /** A session from today's plan already finished today. */
  doneToday: boolean;
  campaign: null | { name: string; week: number | null; weekCount: number; days: WeekDay[] };
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const DAY_LABEL = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** A campaign day's workout, with that day's overrides on top. */
export function dayWorkout(day: CampaignDayRow, input: Pick<TodayInput, 'workouts' | 'items' | 'overrides'>): TodayWorkout | null {
  const w = input.workouts.find((x) => x.id === day.workout_id);
  if (!w) return null;
  const items = input.items.filter((i) => i.workout_id === w.id).sort((a, b) => a.position - b.position).map((i): TodayItem => {
    const o = input.overrides.find((x) => x.campaign_day_id === day.id && x.workout_item_id === i.id);
    return {
      exerciseId: o?.exercise_id ?? i.exercise_id,
      sets: o?.sets ?? i.sets,
      reps: o?.reps ?? i.reps,
      rest: o?.rest_seconds ?? i.rest_seconds,
      superset: i.superset_letter,
      weightLb: num(o?.weight_lb),
    };
  });
  return { name: w.name, workoutId: w.id, campaignDayId: day.id, todayPlanId: null, items };
}

/**
 * A prepared plan's list of exercises. Its format is this build's own choice
 * (nothing writes one before the planner and the coach arrive): a list of
 * { exercise_id, sets, reps, rest_seconds?, superset_letter?, weight_lb? }.
 */
export function planItems(plan: unknown): TodayItem[] {
  const list = Array.isArray(plan) ? plan : Array.isArray((plan as { items?: unknown })?.items) ? (plan as { items: unknown[] }).items : [];
  return list.flatMap((r) => {
    const x = r as Record<string, unknown>;
    if (typeof x.exercise_id !== 'string') return [];
    return [{
      exerciseId: x.exercise_id, sets: Number(x.sets ?? 3), reps: Number(x.reps ?? 10), rest: num(x.rest_seconds),
      superset: typeof x.superset_letter === 'string' ? x.superset_letter : null, weightLb: num(x.weight_lb),
    }];
  });
}

/** The active campaign's day for a date, if it has one. */
function campaignDayOn(date: string, c: CampaignRow, input: TodayInput): CampaignDayRow | null {
  const blank = input.shifts.filter((s) => s.campaign_id === c.id).map((s) => s.blank_week_starts_on.slice(0, 10));
  const pos = campaignPosition(date, c.start_date.slice(0, 10), c.week_count, blank);
  if (!pos) return null;
  return input.days.find((d) => d.campaign_id === c.id && d.week === pos.week && d.weekday === pos.weekday) ?? null;
}

export function todayView(input: TodayInput): TodayView {
  const { date } = input;
  const active = input.campaigns.find((c) => c.status === 'active') ?? null;
  const prepared = input.todayPlans
    .filter((p) => p.local_date.slice(0, 10) === date && !p.consumed_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  let workout: TodayWorkout | null = null;
  if (prepared) {
    const w = prepared.workout_id ? input.workouts.find((x) => x.id === prepared.workout_id) : null;
    const viaDay = prepared.campaign_day_id ? input.days.find((d) => d.id === prepared.campaign_day_id) : null;
    const dayW = viaDay ? input.workouts.find((x) => x.id === viaDay.workout_id) : null;
    workout = {
      name: w?.name ?? dayW?.name ?? "Today's workout",
      workoutId: w?.id ?? dayW?.id ?? null,
      campaignDayId: prepared.campaign_day_id,
      todayPlanId: prepared.id,
      items: planItems(prepared.plan),
    };
  } else if (active) {
    const d = campaignDayOn(date, active, input);
    workout = d ? dayWorkout(d, input) : null;
  }
  if (workout && !workout.items.length) workout = null;

  const finishedToday = input.sessions.filter((s) => s.local_date.slice(0, 10) === date && s.status === 'finished');
  const doneToday = !!workout && finishedToday.some((s) =>
    (workout!.campaignDayId && s.campaign_day_id === workout!.campaignDayId) || (!workout!.campaignDayId && s.workout_name === workout!.name));

  let campaign: TodayView['campaign'] = null;
  if (active) {
    const monday = mondayOf(date);
    const blank = input.shifts.filter((s) => s.campaign_id === active.id).map((s) => s.blank_week_starts_on.slice(0, 10));
    const days: WeekDay[] = DAY_LABEL.map((label, i) => {
      const dt = addDays(monday, i);
      const pos = campaignPosition(dt, active.start_date.slice(0, 10), active.week_count, blank);
      const cd = pos ? input.days.find((d) => d.campaign_id === active.id && d.week === pos.week && d.weekday === pos.weekday) : undefined;
      const name = cd ? input.workouts.find((w) => w.id === cd.workout_id)?.name ?? null : null;
      let state: DayState;
      if (!pos) state = 'off';
      else if (!cd) state = 'rest';
      else if (input.sessions.some((s) => s.campaign_day_id === cd.id && s.status === 'finished')) state = 'done';
      else if (dt === date) state = 'today';
      else state = dt < date ? 'missed' : 'upcoming';
      return { date: dt, weekday: i + 1, label, workout: name, state };
    });
    const pos = campaignPosition(date, active.start_date.slice(0, 10), active.week_count, blank);
    campaign = { name: active.name, week: pos?.week ?? null, weekCount: active.week_count, days };
  }
  return { workout, doneToday, campaign };
}
