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
