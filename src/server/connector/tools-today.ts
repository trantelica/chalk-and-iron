import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, mondayOf, trainingDay } from '@/rules/days';
import { checkInsInARow } from '@/rules/checkins';
import { loadToday } from '@/server/today-load';
import type { Caller } from './auth';
import { ConnectorError } from './errors';
import { nextInput, readNext, writeNext } from './limits';
import { bodyweightOut, dateInput, dateRange, failed, fetchAll, inChunks, limitInput, loadExercises, totalOut, weightOut } from './read';
import { cardioOut, type CardioRow } from './tools-history';
import { campaignDates } from './tools-library';
import { loadAndShape, loadGymNames, loadSessionRows, type Ctx } from './sessions';
import type { ToolDef } from './tools';

// get_today, the proposal readers and get_weekly_summary (design Section 3, "Read tools").

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const none = z.object({}).strict();

async function context(c: Caller): Promise<Ctx> {
  const [exercises, gyms] = await Promise.all([loadExercises(c.db), loadGymNames(c.db)]);
  return { exercises: new Map(exercises.map((e) => [e.id, e])), gyms, totalsUnit: c.me.totals_unit, now: Date.now() };
}

// ---------------------------------------------------------------- proposals

const STATUSES = ['pending', 'accepted', 'rejected', 'out_of_date', 'expired'] as const;
const KINDS = ['exercise', 'workout', 'campaign', 'today_change', 'profile_update'] as const;

interface ProposalRow {
  id: string; source: string; kind: string; applies_to: string; summary_lines: string[]; status: string;
  expires_at: string | null; created_at: string; decided_at: string | null; decline_reason: string | null;
}
const PROPOSAL_COLUMNS = 'id, source, kind, applies_to, summary_lines, status, expires_at, created_at, decided_at, decline_reason';

/** A pending proposal past its expiry no longer waits for a decision: the coach is told it expired. */
const statusNow = (p: ProposalRow, now: number) => (p.status === 'pending' && p.expires_at && Date.parse(p.expires_at) <= now ? 'expired' : p.status);

export function proposalOut(p: ProposalRow, now = Date.now()) {
  return {
    id: p.id,
    // The coach app that made it ("ChatGPT", "Claude"), or "planner" for a day the user sent from the planner.
    source: p.source,
    kind: p.kind,
    applies_to: p.applies_to,
    summary_lines: p.summary_lines,
    // rejected means the user declined it. out_of_date: something it changed was edited before the user decided.
    status: statusNow(p, now),
    created_at: p.created_at,
    decided_at: p.decided_at,
    expires_at: p.expires_at,
    decline_reason: p.decline_reason ? p.decline_reason : null,
  };
}

const statusInput = z.object({ proposal_id: z.string().trim().regex(UUID, 'A proposal id looks like 3f2b1c9e-0000-4000-8000-000000000000.') }).strict();

async function getProposalStatus(c: Caller, a: z.infer<typeof statusInput>) {
  const { data, error } = await c.db.from('proposals').select(PROPOSAL_COLUMNS).eq('id', a.proposal_id.toLowerCase()).maybeSingle();
  if (error) failed('proposal read', error);
  if (!data) {
    throw new ConnectorError('not_found', 'No proposal has that id for this user. Use list_proposals to see the ids of recent proposals.', {
      problems: [{ field: 'proposal_id', problem: 'Not a proposal id for this user.' }],
    });
  }
  return { proposal: proposalOut(data as unknown as ProposalRow) };
}

const listProposalsInput = z.object({
  status: z.enum(STATUSES).optional().describe('Only proposals in this state.'),
  kind: z.enum(KINDS).optional().describe('Only this kind of proposal.'),
  from: dateInput('Only proposals made on or after this day.'),
  to: dateInput('Only proposals made on or before this day.'),
  limit: limitInput(20, 100),
  next: nextInput,
}).strict();

async function listProposals(c: Caller, a: z.infer<typeof listProposalsInput>) {
  if (a.from && a.to) dateRange(a.from, a.to, { from: a.from, to: a.to });
  const offset = readNext(a.next);
  const limit = a.limit ?? 20;
  const now = Date.now();
  const rows = await fetchAll<ProposalRow>('proposals read', (x, y) => {
    let q = c.db.from('proposals').select(PROPOSAL_COLUMNS).order('created_at', { ascending: false }).order('id');
    if (a.kind) q = q.eq('kind', a.kind);
    return q.range(x, y) as never;
  });
  const day = (p: ProposalRow) => trainingDay(new Date(p.created_at), c.me.time_zone);
  const wanted = rows.filter((p) => (!a.status || statusNow(p, now) === a.status) && (!a.from || day(p) >= a.from) && (!a.to || day(p) <= a.to));
  const shown = wanted.slice(offset, offset + limit);
  return {
    proposals: shown.map((p) => proposalOut(p, now)),
    total: wanted.length,
    next: wanted.length > offset + limit ? writeNext(offset + limit) : null,
  };
}

// ---------------------------------------------------------------- get_today

interface SetRowT { session_exercise_id: string; set_number: number; weight_lb: number | string | null; entered_value: number | string; entered_unit: 'lb' | 'kg' | 'bw'; reps: number; set_type: string; rpe: number | string | null }

/** Each exercise's most recent finished session before today, with its sets. */
async function lastNumbers(db: SupabaseClient, exerciseIds: string[], before: string) {
  if (!exerciseIds.length) return new Map<string, { date: string; sets: SetRowT[] }>();
  const se = await fetchAll<{ id: string; session_id: string; exercise_id: string }>('session exercises read', (x, y) =>
    db.from('session_exercises').select('id, session_id, exercise_id').in('exercise_id', exerciseIds).order('id').range(x, y) as never);
  const sessions = await fetchAll<{ id: string; local_date: string; started_at: string }>('sessions read', (x, y) =>
    db.from('sessions').select('id, local_date, started_at').lt('local_date', before).eq('status', 'finished').order('id').range(x, y) as never);
  const sess = new Map(sessions.map((s) => [s.id, s]));
  const newest = new Map<string, { id: string; day: string; started: string }>();
  for (const e of se) {
    const s = sess.get(e.session_id);
    if (!s) continue;
    const cur = newest.get(e.exercise_id);
    if (!cur || s.started_at > cur.started) newest.set(e.exercise_id, { id: e.id, day: String(s.local_date).slice(0, 10), started: s.started_at });
  }
  const sets = await inChunks<SetRowT>('sets read', [...newest.values()].map((n) => n.id), (ids) =>
    db.from('set_logs').select('session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, rpe').in('session_exercise_id', ids).is('deleted_at', null) as never);
  return new Map([...newest].map(([exerciseId, n]) => [exerciseId, {
    date: n.day,
    sets: sets.filter((s) => s.session_exercise_id === n.id).sort((x, y) => x.set_number - y.set_number),
  }]));
}

async function getToday(c: Caller) {
  const date = trainingDay(new Date(), c.me.time_zone);
  const ctx = await context(c);
  const [view, pending, activeRows] = await Promise.all([
    loadToday(c.db, date),
    c.db.from('proposals').select(PROPOSAL_COLUMNS).eq('status', 'pending').eq('applies_to', 'today').order('created_at', { ascending: false }),
    loadSessionRows(c.db, { activeOnly: true, all: true }),
  ]);
  if (pending.error) failed('proposals read', pending.error);
  const plan = view.workout;
  const last = await lastNumbers(c.db, plan ? [...new Set(plan.items.map((i) => i.exerciseId))] : [], date);
  const live = (await loadAndShape(c.db, activeRows.slice(0, 1), ctx, true))[0] ?? null;
  const now = Date.now();
  return {
    date,
    planned: plan ? {
      name: plan.name,
      // A day sent from the planner, or a coach proposal accepted before the session began, is "prepared"; otherwise it is the campaign's day.
      source: plan.todayPlanId ? 'prepared_for_today' : 'campaign_day',
      done_today: view.doneToday,
      items: plan.items.map((i) => {
        const ex = ctx.exercises.get(i.exerciseId);
        const unit = ex?.default_unit ?? 'lb';
        const prev = last.get(i.exerciseId);
        return {
          exercise: ex?.name ?? null,
          exercise_id: i.exerciseId,
          sets: i.sets,
          reps: i.reps,
          rest_seconds: i.rest ?? ex?.rest_seconds ?? null,
          superset: i.superset,
          // The weight set for today (a day's override or a prepared plan); null means the app fills it from the last session.
          planned_weight: i.weightLb === null ? null : weightOut(i.weightLb, { value: i.weightLb, unit: 'lb' }, unit),
          last_session: prev ? {
            date: prev.date,
            sets: prev.sets.map((s) => ({
              number: s.set_number, weight: weightOut(s.weight_lb === null ? null : Number(s.weight_lb), { value: Number(s.entered_value), unit: s.entered_unit }, unit),
              reps: s.reps, type: s.set_type, rpe: s.rpe === null ? null : Number(s.rpe),
            })),
          } : null,
        };
      }),
    } : null,
    // Planned days of this week that passed without a session. A missed workout can still be done on a later day.
    missed_workouts_available: (view.campaign?.days ?? []).filter((d) => d.state === 'missed').map((d) => ({ date: d.date, workout: d.workout })),
    campaign: view.campaign ? { name: view.campaign.name, week: view.campaign.week, week_count: view.campaign.weekCount } : null,
    live_session: live,
    pending_today_proposals: ((pending.data ?? []) as unknown as ProposalRow[]).filter((p) => statusNow(p, now) === 'pending').map((p) => proposalOut(p, now)),
  };
}

// ---------------------------------------------------------------- get_weekly_summary

const weeklyInput = z.object({
  week_of: dateInput('Any date in the week wanted (weeks run Monday to Sunday). Leave out for the most recent full week.'),
}).strict();

async function getWeeklySummary(c: Caller, a: z.infer<typeof weeklyInput>) {
  const today = trainingDay(new Date(), c.me.time_zone);
  const thisMonday = mondayOf(today);
  const monday = a.week_of ? mondayOf(a.week_of) : addDays(thisMonday, -7);
  if (monday > thisMonday) {
    throw new ConnectorError('invalid_input', `That week has not started yet. Ask for a week up to the one holding ${today}, or leave week_of out for the last full week.`, {
      problems: [{ field: 'week_of', problem: 'It must be a date in this week or an earlier one.' }],
    });
  }
  const sunday = addDays(monday, 6);

  // The count of check-ins in a row is taken before this read is recorded.
  const marks = await fetchAll<{ week_start: string }>('check-ins read', (x, y) => c.db.from('weekly_checkins').select('week_start').order('week_start').range(x, y) as never);
  const inARow = checkInsInARow(marks.map((m) => m.week_start), today);
  const recorded = await c.db.rpc('record_weekly_checkin', { p_week_of: monday });
  if (recorded.error) console.error('CONNECTOR_CHECKIN_FAILED', recorded.error.message.slice(0, 200));
  const added = !recorded.error && (recorded.data as { added?: boolean } | null)?.added === true;

  const ctx = await context(c);
  const rows = (await loadSessionRows(c.db, { from: monday, to: sunday, all: true })).filter((s) => s.finish_reason !== 'replaced');
  const sessions = (await loadAndShape(c.db, rows, ctx)).sort((x, y) => (x.date === y.date ? 0 : x.date < y.date ? -1 : 1));

  // Planned days: every day of a campaign that has run (active or finished) falling in this week.
  const camps = await c.db.from('campaigns').select('id, name, start_date, week_count, status').neq('status', 'draft');
  if (camps.error) failed('campaigns read', camps.error);
  const planned: Array<{ date: string; workout: string | null; done: boolean; missed: boolean }> = [];
  for (const camp of (camps.data ?? []) as Array<{ id: string; name: string; start_date: string; week_count: number; status: string }>) {
    const [days, shifts] = await Promise.all([
      c.db.from('campaign_days').select('id, week, weekday, workout_id').eq('campaign_id', camp.id),
      c.db.from('campaign_shifts').select('blank_week_starts_on').eq('campaign_id', camp.id),
    ]);
    if (days.error) failed('campaign days read', days.error);
    const blank = ((shifts.data ?? []) as Array<{ blank_week_starts_on: string }>).map((s) => s.blank_week_starts_on.slice(0, 10));
    const inWeek = campaignDates(camp, (days.data ?? []) as Array<{ id: string; week: number; weekday: number; workout_id: string }>, blank).dates
      .filter((d) => d.date >= monday && d.date <= sunday);
    if (!inWeek.length) continue;
    const start = camp.start_date.slice(0, 10);
    const [done, names] = await Promise.all([
      inChunks<{ campaign_day_id: string }>('sessions read', inWeek.map((d) => d.dayId), (ids) =>
        c.db.from('sessions').select('campaign_day_id').in('campaign_day_id', ids).eq('status', 'finished').gte('local_date', start) as never),
      inChunks<{ id: string; name: string }>('workouts read', [...new Set(inWeek.map((d) => d.workoutId))], (ids) => c.db.from('workouts').select('id, name').in('id', ids) as never),
    ]);
    const isDone = new Set(done.map((s) => s.campaign_day_id));
    for (const d of inWeek) {
      const was = isDone.has(d.dayId);
      planned.push({ date: d.date, workout: names.find((n) => n.id === d.workoutId)?.name ?? null, done: was, missed: !was && d.date < today });
    }
  }
  planned.sort((x, y) => (x.date < y.date ? -1 : 1));

  const cardio = await c.db.from('cardio_logs').select('id, local_date, type, duration_seconds, distance, distance_unit, notes')
    .gte('local_date', monday).lte('local_date', sunday).order('local_date').order('created_at');
  if (cardio.error) failed('cardio read', cardio.error);

  const finished = sessions.filter((s) => s.status === 'finished');
  const efficiencies = sessions.map((s) => s.efficiency_percent).filter((e): e is number => e !== null);
  return {
    week: { starts: monday, ends: sunday, is_current_week: monday === thisMonday },
    sessions_done: finished.length,
    sessions,
    planned_days: planned,
    planned_days_missed: planned.filter((p) => p.missed).map((p) => ({ date: p.date, workout: p.workout })),
    total_volume: totalOut(sessions.reduce((n, s) => n + s.volume.value, 0), c.me.totals_unit),
    total_bodyweight_volume: bodyweightOut(sessions.reduce((n, s) => n + s.bodyweight_volume.value, 0)),
    records_set: sessions.reduce((n, s) => n + s.records_set, 0),
    records: sessions.flatMap((s) => s.exercises.flatMap((e) => e.sets.filter((x) => x.records.length).map((x) => ({
      date: s.date, exercise: e.exercise, weight: x.weight, reps: x.reps, records: x.records,
    })))),
    // The average of the sessions' own efficiency; null when none has one.
    average_efficiency_percent: efficiencies.length ? Math.round(efficiencies.reduce((x, y) => x + y, 0) / efficiencies.length) : null,
    cardio: ((cardio.data ?? []) as CardioRow[]).map(cardioOut),
    check_ins_in_a_row: inARow,
    check_in: { week_starts: monday, recorded_by_this_read: added, recorded: !recorded.error },
  };
}

export const TODAY_TOOLS: ToolDef[] = [
  { name: 'get_today', input: none, readOnly: true, run: (c) => getToday(c) },
  { name: 'get_proposal_status', input: statusInput, readOnly: true, run: (c, a) => getProposalStatus(c, a) },
  { name: 'list_proposals', input: listProposalsInput, readOnly: true, run: (c, a) => listProposals(c, a) },
  { name: 'get_weekly_summary', input: weeklyInput, readOnly: true, run: (c, a) => getWeeklySummary(c, a) },
];
