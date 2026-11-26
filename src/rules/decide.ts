// Working out a coach's change to today before Accept (stage 4D, 26 Nov 2026).
//
// The account's `proposal_context` reads everything a card for today needs in
// one go; this turns it into what `decide_proposal` applies (its p_today):
// the running workout with the change made, or today's plan with the change
// made, or "out of date" when the change no longer fits. Plain functions, so
// the database tests run exactly what the app runs.

import { realSessions } from './session';
import { historyFromMemory, sessionFromRows, sessionRows, type MemoryRow } from './sync';
import { todayView, type TodayInput } from './today';
import { applyToPlan, applyToSession, planRows, type ExerciseFacts, type Facts, type TodayChange } from './today-change';
import { seedWeights } from './workout';

type Row = Record<string, unknown>;

/** A library exercise as proposal_context gives it. */
export interface ContextExercise {
  id: string; name: string; muscle: string; equipment: string; unit: 'lb' | 'kg' | 'bw'; assisted: boolean; load_count: number;
  work_seconds: number; rest_seconds: number; archived: boolean; alternates: ExerciseFacts['alternates'];
}

/** What `proposal_context` answers. */
export interface ProposalContext {
  proposal: null | { id: string; kind: string; status: string; source: string; payload: { local_date?: string; changes?: TodayChange[] } & Row };
  date: string;
  session: Row | null;
  mark: string | null;
  blocks: Row[];
  exercises: Row[];
  sets: Row[];
  plan: Omit<TodayInput, 'date' | 'todayPlans'> & { today_plans: TodayInput['todayPlans'] };
  library: ContextExercise[];
  memory: MemoryRow[];
}

/** What `decide_proposal` takes for a card for today. */
export type TodayParam =
  | { mode: 'session'; session_id: string; mark: string | null; rows: { session: Row; blocks: Row[]; exercises: Row[] } }
  | { mode: 'plan'; based_on: string | null; workout_id: string | null; campaign_day_id: string | null; name: string | null; items: ReturnType<typeof planRows> }
  | { mode: 'out_of_date'; message: string };

export function factsFrom(library: ContextExercise[]): Facts {
  const by = new Map(library.map((e) => [e.id, e]));
  return (id) => {
    const e = by.get(id);
    return e && {
      id: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, unit: e.unit, assisted: e.assisted, loadCount: e.load_count,
      alternates: e.alternates ?? [], work: e.work_seconds, rest: e.rest_seconds, archived: e.archived,
    };
  };
}

/** Starting weights from the last session of an exercise, as the phone seeds them. */
export function seedFromMemory(memory: MemoryRow[]) {
  const history = historyFromMemory(memory);
  return (id: string, sets: number, assisted: boolean) => {
    const last = realSessions(history, id).at(-1);
    return seedWeights(last ? last.sets.map((x) => x.lb) : [], sets, assisted);
  };
}

/**
 * The change to today, worked out. `wait` is a refusal that may pass soon
 * (a superset part-way through a round): nothing is sent, and the card stays.
 */
export function todayDecision(ctx: ProposalContext, now: number): { send: TodayParam } | { wait: string } {
  const p = ctx.proposal!;
  const changes = p.payload.changes ?? [];
  const facts = factsFrom(ctx.library);
  if (ctx.session) {
    const s = sessionFromRows(ctx.session, ctx.blocks, ctx.exercises, ctx.sets, facts);
    const r = applyToSession(s, changes, facts, seedFromMemory(ctx.memory), now, p.id);
    if (!r.ok) return r.final ? { send: { mode: 'out_of_date', message: r.message } } : { wait: r.message };
    const rows = sessionRows(r.session);
    return { send: { mode: 'session', session_id: String(ctx.session.id), mark: ctx.mark, rows: { session: rows.session, blocks: rows.blocks, exercises: rows.exercises } } };
  }
  const view = todayView({
    date: ctx.date, campaigns: ctx.plan.campaigns, days: ctx.plan.days, shifts: ctx.plan.shifts, overrides: ctx.plan.overrides,
    workouts: ctx.plan.workouts, items: ctx.plan.items, todayPlans: ctx.plan.today_plans, sessions: ctx.plan.sessions,
  });
  if (!view.workout) return { send: { mode: 'out_of_date', message: 'There is no workout today for this card to change.' } };
  if (view.doneToday) return { send: { mode: 'out_of_date', message: 'Today\'s workout is already finished, so this card no longer fits it.' } };
  const r = applyToPlan(view.workout.items, changes, facts);
  if (!r.ok) return { send: { mode: 'out_of_date', message: r.message } };
  return {
    send: {
      mode: 'plan', based_on: view.workout.todayPlanId, workout_id: view.workout.workoutId, campaign_day_id: view.workout.campaignDayId,
      name: view.workout.name, items: planRows(r.items),
    },
  };
}
