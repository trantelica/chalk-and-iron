import type { SupabaseClient } from '@supabase/supabase-js';
import type { SetFacts } from '@/rules/workout';

// Reads logged sets for the planner's graph, records and History, with the
// person's own sign-in. Sets deleted from History are kept as markers by the
// database (deleted_at) and left out here.

export interface LoggedSet {
  id: string; sessionExerciseId: string; sessionId: string; exerciseId: string; setNumber: number;
  lb: number | null; enteredValue: number; enteredUnit: 'lb' | 'kg' | 'bw'; reps: number;
  type: 'warm_up' | 'working' | 'drop'; rpe: number | null; loggedAt: string; records: string[];
  day: string; startedAt: string;
}

const chunks = <T,>(list: T[], n = 80): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** Every live logged set of one exercise, oldest first. */
export async function loadExerciseSets(sb: SupabaseClient, exerciseId: string): Promise<LoggedSet[]> {
  const se = await sb.from('session_exercises').select('id, session_id').eq('exercise_id', exerciseId);
  const exRows = (se.data ?? []) as { id: string; session_id: string }[];
  if (!exRows.length) return [];
  const sessionIds = [...new Set(exRows.map((x) => x.session_id))];
  const [sess, sets] = await Promise.all([
    Promise.all(chunks(sessionIds).map((c) => sb.from('sessions').select('id, local_date, started_at').in('id', c))),
    Promise.all(chunks(exRows.map((x) => x.id)).map((c) => sb.from('set_logs')
      .select('id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, rpe, logged_at, record_types')
      .in('session_exercise_id', c).is('deleted_at', null))),
  ]);
  const sessionOf = new Map(sess.flatMap((r) => (r.data ?? []) as { id: string; local_date: string; started_at: string }[]).map((s) => [s.id, s]));
  const seSession = new Map(exRows.map((x) => [x.id, x.session_id]));
  const out: LoggedSet[] = [];
  for (const r of sets) for (const l of (r.data ?? []) as Record<string, unknown>[]) {
    const sid = seSession.get(l.session_exercise_id as string)!;
    const s = sessionOf.get(sid);
    if (!s) continue;
    out.push({
      id: l.id as string, sessionExerciseId: l.session_exercise_id as string, sessionId: sid, exerciseId,
      setNumber: l.set_number as number, lb: l.weight_lb === null ? null : Number(l.weight_lb),
      enteredValue: Number(l.entered_value), enteredUnit: l.entered_unit as LoggedSet['enteredUnit'], reps: l.reps as number,
      type: l.set_type as LoggedSet['type'], rpe: l.rpe === null ? null : Number(l.rpe), loggedAt: l.logged_at as string,
      records: (l.record_types as string[]) ?? [], day: s.local_date.slice(0, 10), startedAt: s.started_at,
    });
  }
  return out.sort((a, b) => (a.startedAt === b.startedAt ? a.setNumber - b.setNumber : a.startedAt < b.startedAt ? -1 : 1));
}

export const toFacts = (sets: LoggedSet[]): SetFacts[] =>
  sets.map((s, i) => ({ id: s.id, lb: s.lb, reps: s.reps, type: s.type, day: s.day, order: i }));

/** Sessions of one exercise for the graph, oldest first, each as its sets in order. */
export function sessionsOf(sets: LoggedSet[]): { key: string; day: string; sets: { lb: number | null; reps: number; type: LoggedSet['type'] }[] }[] {
  const by = new Map<string, { key: string; day: string; startedAt: string; sets: LoggedSet[] }>();
  for (const s of sets) {
    const g = by.get(s.sessionId) ?? { key: s.sessionId, day: s.day, startedAt: s.startedAt, sets: [] };
    g.sets.push(s);
    by.set(s.sessionId, g);
  }
  return [...by.values()].sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1))
    .map((g) => ({ key: g.key, day: g.day, sets: g.sets.sort((a, b) => a.setNumber - b.setNumber).map((x) => ({ lb: x.lb, reps: x.reps, type: x.type })) }));
}

// ---------------------------------------------------------------- sessions

export interface SessionRowH {
  id: string; local_date: string; workout_name: string; started_at: string; ended_at: string | null; status: string;
  finish_reason: string | null; clock_banked_seconds: number; source_kind: string;
}
export interface BlockRowH {
  id: string; session_id: string; position: number; superset_letter: string | null; time_budget_seconds: number; clock_started_at: string | null;
  clock_banked_seconds: number; broken_at: string | null; broken_from_block_id: string | null; sets_done_at_break: number | null; sets_planned_at_break: number | null;
}
export interface SeRowH {
  id: string; session_id: string; block_id: string; exercise_id: string; exercise_name_then: string; position_in_block: number;
  planned: number; state: string; sets_before_break: number | null;
}
export interface SessionData { session: SessionRowH; blocks: BlockRowH[]; exercises: SeRowH[]; sets: LoggedSet[] }

/** Every workout name the person has sessions for, for History's filter. */
export async function loadWorkoutNames(sb: SupabaseClient): Promise<string[]> {
  const r = await sb.from('sessions').select('workout_name');
  return [...new Set(((r.data ?? []) as { workout_name: string }[]).map((x) => x.workout_name))].sort();
}

/**
 * One page of sessions, newest first, with their blocks, exercises and live
 * sets. History asks for the next page as "Show 10 more" is pressed, so every
 * session can be reached (review finding 4, 23 Nov); the workout filter is
 * applied by the account, not to the page already loaded.
 */
export async function loadSessions(sb: SupabaseClient, opts: { offset?: number; limit?: number; workout?: string } = {}): Promise<SessionData[]> {
  const from = opts.offset ?? 0;
  let q = sb.from('sessions')
    .select('id, local_date, workout_name, started_at, ended_at, status, finish_reason, clock_banked_seconds, source_kind')
    .order('started_at', { ascending: false });
  if (opts.workout) q = q.eq('workout_name', opts.workout);
  const ss = await q.range(from, from + (opts.limit ?? 10) - 1);
  const sessions = ((ss.data ?? []) as Record<string, unknown>[]).map((r) => ({ ...r, local_date: String(r.local_date).slice(0, 10), clock_banked_seconds: Number(r.clock_banked_seconds) })) as SessionRowH[];
  return loadSessionDetails(sb, sessions);
}

/** The blocks, exercises and live sets of sessions already read. The coach connector reads sessions through this too, so it sees what History shows. */
export async function loadSessionDetails(sb: SupabaseClient, sessions: SessionRowH[]): Promise<SessionData[]> {
  if (!sessions.length) return [];
  const ids = sessions.map((x) => x.id);
  const [bl, se] = await Promise.all([
    Promise.all(chunks(ids).map((c) => sb.from('session_blocks').select('id, session_id, position, superset_letter, time_budget_seconds, clock_started_at, clock_banked_seconds, broken_at, broken_from_block_id, sets_done_at_break, sets_planned_at_break').in('session_id', c))),
    Promise.all(chunks(ids).map((c) => sb.from('session_exercises').select('id, session_id, block_id, exercise_id, exercise_name_then, position_in_block, planned_set_types, state, sets_before_break').in('session_id', c))),
  ]);
  const blocks = bl.flatMap((r) => (r.data ?? []) as Record<string, unknown>[]).map((b) => ({ ...b, clock_banked_seconds: Number(b.clock_banked_seconds) })) as unknown as BlockRowH[];
  const exercises = se.flatMap((r) => (r.data ?? []) as Record<string, unknown>[]).map((e) => ({
    id: e.id, session_id: e.session_id, block_id: e.block_id, exercise_id: e.exercise_id, exercise_name_then: e.exercise_name_then,
    position_in_block: e.position_in_block, planned: ((e.planned_set_types as string[]) ?? []).length, state: e.state, sets_before_break: e.sets_before_break,
  })) as unknown as SeRowH[];
  const seIds = exercises.map((e) => e.id);
  const sl = await Promise.all(chunks(seIds).map((c) => sb.from('set_logs')
    .select('id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, rpe, logged_at, record_types').in('session_exercise_id', c).is('deleted_at', null)));
  const bySession = new Map(sessions.map((x) => [x.id, x]));
  const seInfo = new Map(exercises.map((e) => [e.id, e]));
  const sets: LoggedSet[] = [];
  for (const r of sl) for (const l of (r.data ?? []) as Record<string, unknown>[]) {
    const e = seInfo.get(l.session_exercise_id as string)!;
    const s = bySession.get(e.session_id)!;
    sets.push({
      id: l.id as string, sessionExerciseId: e.id, sessionId: s.id, exerciseId: e.exercise_id, setNumber: l.set_number as number,
      lb: l.weight_lb === null ? null : Number(l.weight_lb), enteredValue: Number(l.entered_value), enteredUnit: l.entered_unit as LoggedSet['enteredUnit'],
      reps: l.reps as number, type: l.set_type as LoggedSet['type'], rpe: l.rpe === null ? null : Number(l.rpe), loggedAt: l.logged_at as string,
      records: (l.record_types as string[]) ?? [], day: s.local_date, startedAt: s.started_at,
    });
  }
  return sessions.map((s) => ({
    session: s,
    blocks: blocks.filter((b) => b.session_id === s.id).sort((a, b) => a.position - b.position),
    exercises: exercises.filter((e) => e.session_id === s.id),
    sets: sets.filter((x) => x.sessionId === s.id),
  }));
}
