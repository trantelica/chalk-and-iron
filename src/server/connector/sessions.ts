import type { SupabaseClient } from '@supabase/supabase-js';
import { loadSessionDetails, type SessionData, type SessionRowH } from '@/app/planner/history-data';
import { summarizeSession } from '@/rules/planner';
import { setVolume, type SetFacts } from '@/rules/workout';
import { bodyweightOut, failed, fetchAll, inChunks, kindOf, totalOut, weightOut, type ExerciseRow } from './read';

// Sessions as the coach reads them (list_sessions, get_today's live session,
// get_weekly_summary). They are read the way History reads them
// (history-data.ts), and their time, volume, records and efficiency come from
// the same rule History uses, so the coach sees what the user sees.

export interface SessionRowC extends SessionRowH {
  gym_id: string | null;
  campaign_day_id: string | null;
  current_session_exercise_id: string | null;
  clock_running_since: string | null;
}

const SESSION_COLUMNS = 'id, local_date, workout_name, started_at, ended_at, status, finish_reason, clock_banked_seconds, source_kind, gym_id, campaign_day_id, current_session_exercise_id, clock_running_since';

/** Sessions on training days from `from` to `to`, newest first, as many as a page holds. */
export async function loadSessionRows(db: SupabaseClient, opts: { from?: string; to?: string; offset?: number; limit?: number; all?: boolean; activeOnly?: boolean }): Promise<SessionRowC[]> {
  const make = (a: number, b: number) => {
    let q = db.from('sessions').select(SESSION_COLUMNS).order('started_at', { ascending: false }).order('id');
    if (opts.from) q = q.gte('local_date', opts.from);
    if (opts.to) q = q.lte('local_date', opts.to);
    if (opts.activeOnly) q = q.eq('status', 'active');
    return q.range(a, b);
  };
  const raw = opts.all
    ? await fetchAll<Record<string, unknown>>('sessions read', (a, b) => make(a, b) as never)
    : await (async () => {
      const from = opts.offset ?? 0;
      const { data, error } = await make(from, from + (opts.limit ?? 20) - 1);
      if (error) failed('sessions read', error);
      return (data ?? []) as Record<string, unknown>[];
    })();
  return raw.map((r) => ({ ...r, local_date: String(r.local_date).slice(0, 10), clock_banked_seconds: Number(r.clock_banked_seconds) })) as unknown as SessionRowC[];
}

export async function loadGymNames(db: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await db.from('gyms').select('id, name');
  if (error) failed('gyms read', error);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((g) => [g.id, g.name]));
}

export interface Ctx {
  exercises: Map<string, ExerciseRow>;
  gyms: Map<string, string>;
  totalsUnit: 'lb' | 'kg';
  now: number;
}

/** One session with its exercises and sets, and its time, volume, records and efficiency. */
export function shapeSession(sd: SessionData, row: SessionRowC, ctx: Ctx, live = false) {
  const kind = (id: string) => kindOf(ctx.exercises.get(id));
  // A block's clock that is running right now has not been banked yet.
  const runningExtra = new Map<string, number>();
  if (live) for (const b of sd.blocks as Array<SessionData['blocks'][number] & { clock_running_since?: string | null }>) {
    if (b.clock_running_since) runningExtra.set(b.id, Math.max(0, Math.round((ctx.now - Date.parse(b.clock_running_since)) / 1000)));
  }
  const sum = summarizeSession({
    clockBanked: row.clock_banked_seconds + (live && row.clock_running_since ? Math.max(0, Math.round((ctx.now - Date.parse(row.clock_running_since)) / 1000)) : 0),
    blocks: sd.blocks.map((b) => ({ ...b, clock_banked_seconds: b.clock_banked_seconds + (runningExtra.get(b.id) ?? 0) })),
    exercises: sd.exercises.map((e) => ({ id: e.id, block_id: e.block_id, exercise_id: e.exercise_id, state: e.state, planned: e.planned, sets_before_break: e.sets_before_break })),
    sets: sd.sets.map((s) => ({ id: s.id, session_exercise_id: s.sessionExerciseId, lb: s.lb, reps: s.reps, type: s.type, records: s.records })),
    kind,
  });
  const blockOf = new Map(sd.blocks.map((b) => [b.id, b]));
  const ordered = [...sd.exercises].sort((a, b) =>
    (blockOf.get(a.block_id)?.position ?? 0) - (blockOf.get(b.block_id)?.position ?? 0) || a.position_in_block - b.position_in_block);
  const exercises = ordered.map((e) => {
    const unit = ctx.exercises.get(e.exercise_id)?.default_unit ?? 'lb';
    const block = blockOf.get(e.block_id);
    return {
      exercise: e.exercise_name_then,
      exercise_id: e.exercise_id,
      // open: not finished; done; skipped; replaced (swapped for another exercise).
      state: e.state,
      planned_sets: e.planned,
      superset: block?.superset_letter ?? null,
      ...(block && (block.broken_at || block.broken_from_block_id) ? { broken_out_of_superset: true } : {}),
      sets: sd.sets.filter((s) => s.sessionExerciseId === e.id).sort((a, b) => a.setNumber - b.setNumber).map((s) => ({
        number: s.setNumber,
        weight: weightOut(s.lb, { value: s.enteredValue, unit: s.enteredUnit }, unit),
        reps: s.reps,
        type: s.type,
        rpe: s.rpe,
        records: s.records,
      })),
    };
  });
  return {
    id: row.id,
    date: row.local_date,
    workout_name: row.workout_name,
    source: row.source_kind === 'campaign_day' ? 'campaign' : 'ad_hoc',
    gym: row.gym_id ? ctx.gyms.get(row.gym_id) ?? null : null,
    status: row.status === 'active' ? 'in_progress' : 'finished',
    ...(row.finish_reason === 'replaced' ? { replaced: true } : {}),
    duration_seconds: sum.elapsed,
    volume: totalOut(sum.volumeLb, ctx.totalsUnit),
    bodyweight_volume: bodyweightOut(sum.volumeBw),
    efficiency_percent: sum.efficiency,
    records_set: sum.records,
    ...(live ? { elapsed_seconds: sum.elapsed, current_exercise: sd.exercises.find((e) => e.id === row.current_session_exercise_id)?.exercise_name_then ?? null } : {}),
    exercises,
  };
}

export type ShapedSession = ReturnType<typeof shapeSession>;

export async function loadAndShape(db: SupabaseClient, rows: SessionRowC[], ctx: Ctx, live = false): Promise<ShapedSession[]> {
  const details = await loadSessionDetails(db, rows);
  if (live) {
    // The connector's History reading leaves out the running clock of each block; ask for it for the live session only.
    const ids = details.map((d) => d.session.id);
    const { data } = ids.length ? await db.from('session_blocks').select('id, clock_running_since').in('session_id', ids) : { data: [] };
    const running = new Map(((data ?? []) as Array<{ id: string; clock_running_since: string | null }>).map((b) => [b.id, b.clock_running_since]));
    for (const d of details) for (const b of d.blocks) (b as { clock_running_since?: string | null }).clock_running_since = running.get(b.id) ?? null;
  }
  const byId = new Map(rows.map((r) => [r.id, r]));
  return details.map((d) => shapeSession(d, byId.get(d.session.id)!, ctx, live));
}

// ---------------------------------------------------------------- one exercise across sessions

export interface ExerciseSet {
  id: string; day: string; startedAt: string; sessionId: string; workoutName: string; setNumber: number;
  lb: number | null; enteredValue: number; enteredUnit: 'lb' | 'kg' | 'bw'; reps: number; type: SetFacts['type']; rpe: number | null; records: string[];
}

export interface ExerciseRun { sessionId: string; day: string; startedAt: string; workoutName: string; inProgress: boolean; state: string; sets: ExerciseSet[] }

interface SeRow { id: string; session_id: string; exercise_id: string; state: string }
interface SessRow { id: string; local_date: string; started_at: string; workout_name: string; status: string }
interface SetRow {
  id: string; session_exercise_id: string; set_number: number; weight_lb: number | string | null; entered_value: number | string; entered_unit: 'lb' | 'kg' | 'bw';
  reps: number; set_type: SetFacts['type']; rpe: number | string | null; record_types: string[] | null;
}

/**
 * Every run of exercises across sessions, grouped by exercise, oldest first.
 * With `exerciseId`, one exercise; otherwise all. `from` and `to` narrow the
 * training days. A deleted set is left out; a skipped exercise stays, with no sets.
 */
export async function loadRuns(db: SupabaseClient, opts: { exerciseId?: string; from?: string; to?: string }): Promise<Map<string, ExerciseRun[]>> {
  const sessions = await fetchAll<SessRow>('sessions read', (a, b) => {
    let q = db.from('sessions').select('id, local_date, started_at, workout_name, status').order('id');
    if (opts.from) q = q.gte('local_date', opts.from);
    if (opts.to) q = q.lte('local_date', opts.to);
    return q.range(a, b) as never;
  });
  const sessionOf = new Map(sessions.map((s) => [s.id, { ...s, local_date: String(s.local_date).slice(0, 10) }]));
  const seAll = await fetchAll<SeRow>('session exercises read', (a, b) => {
    let q = db.from('session_exercises').select('id, session_id, exercise_id, state').order('id');
    if (opts.exerciseId) q = q.eq('exercise_id', opts.exerciseId);
    return q.range(a, b) as never;
  });
  const ses = seAll.filter((e) => sessionOf.has(e.session_id));
  const setRows: SetRow[] = [];
  const cols = 'id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, rpe, record_types';
  if (opts.exerciseId || opts.from || opts.to) {
    setRows.push(...await inChunks<SetRow>('sets read', ses.map((e) => e.id), (c) => db.from('set_logs').select(cols).in('session_exercise_id', c).is('deleted_at', null) as never));
  } else {
    const known = new Set(ses.map((e) => e.id));
    const all = await fetchAll<SetRow>('sets read', (a, b) => db.from('set_logs').select(cols).is('deleted_at', null).order('id').range(a, b) as never);
    setRows.push(...all.filter((s) => known.has(s.session_exercise_id)));
  }
  const seOf = new Map(ses.map((e) => [e.id, e]));
  const out = new Map<string, ExerciseRun[]>();
  const runOf = new Map<string, ExerciseRun>();
  for (const e of ses) {
    const s = sessionOf.get(e.session_id)!;
    const run: ExerciseRun = { sessionId: s.id, day: s.local_date, startedAt: s.started_at, workoutName: s.workout_name, inProgress: s.status === 'active', state: e.state, sets: [] };
    // A superset or a swap can give one session the same exercise twice; each is its own run.
    runOf.set(e.id, run);
    out.set(e.exercise_id, [...(out.get(e.exercise_id) ?? []), run]);
  }
  for (const r of setRows) {
    const e = seOf.get(r.session_exercise_id);
    const run = e ? runOf.get(e.id) : undefined;
    if (!run) continue;
    run.sets.push({
      id: r.id, day: run.day, startedAt: run.startedAt, sessionId: run.sessionId, workoutName: run.workoutName, setNumber: r.set_number,
      lb: r.weight_lb === null ? null : Number(r.weight_lb), enteredValue: Number(r.entered_value), enteredUnit: r.entered_unit, reps: r.reps,
      type: r.set_type, rpe: r.rpe === null ? null : Number(r.rpe), records: r.record_types ?? [],
    });
  }
  for (const [id, runs] of out) {
    for (const r of runs) r.sets.sort((a, b) => a.setNumber - b.setNumber);
    out.set(id, runs.sort((a, b) => (a.startedAt === b.startedAt ? 0 : a.startedAt < b.startedAt ? -1 : 1)));
  }
  return out;
}

/** The sets of a list of runs as the rules want them: in order, so a tie goes to the newer set. */
export function factsOf(runs: ExerciseRun[]): SetFacts[] {
  let order = 0;
  return runs.flatMap((r) => r.sets.map((s) => ({ id: s.id, lb: s.lb, reps: s.reps, type: s.type, day: s.day, order: order++ })));
}

/** Volume of one run, in pounds, and in reps for a bodyweight or assisted exercise. */
export function runVolume(run: ExerciseRun, kind: ReturnType<typeof kindOf>) {
  let lb = 0;
  let bw = 0;
  for (const s of run.sets) {
    const v = setVolume({ id: s.id, lb: s.lb, reps: s.reps, type: s.type, day: s.day, order: 0 }, kind);
    if (kind.unit === 'bw' || kind.assisted || s.lb === null) bw += v; else lb += v;
  }
  return { lb, bw };
}
