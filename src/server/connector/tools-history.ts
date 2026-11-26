import { z } from 'zod';
import { trainingDay } from '@/rules/days';
import { currentRecords, estimatedOneRepMax, RECORD_LABEL, type RecordType } from '@/rules/workout';
import type { Caller } from './auth';
import { nextInput, page, PAGE_SIZE, readNext, writeNext } from './limits';
import {
  bodyweightOut, dateInput, dateRange, daysBefore, exerciseRef, failed, findExercise, kindOf, limitInput, loadExercises,
  poundsOut, totalOut, weightOut,
} from './read';
import { factsOf, loadAndShape, loadGymNames, loadRuns, loadSessionRows, runVolume } from './sessions';
import type { ToolDef } from './tools';

// The history read tools (design Section 3, "Read tools"): get_exercise_history,
// get_records, list_sessions and list_cardio.

const today = (c: Caller) => trainingDay(new Date(), c.me.time_zone);

// ---------------------------------------------------------------- get_exercise_history

const historyInput = z.object({
  exercise: exerciseRef,
  from: dateInput('First day to include, like 2026-09-01. Default: 12 weeks ago.'),
  to: dateInput('Last day to include. Default: today.'),
  limit: limitInput(20, 100),
}).strict();

async function getExerciseHistory(c: Caller, a: z.infer<typeof historyInput>) {
  const exercise = findExercise(await loadExercises(c.db), a.exercise);
  const now = today(c);
  const { from, to } = dateRange(a.from, a.to, { from: daysBefore(now, 84), to: now });
  const kind = kindOf(exercise);
  const runs = (await loadRuns(c.db, { exerciseId: exercise.id, from, to })).get(exercise.id) ?? [];
  const newest = [...runs].reverse();
  const limit = a.limit ?? 20;
  const shown = newest.slice(0, limit);
  const unit = exercise.default_unit;
  const e1rm = estimatedOneRepMax(factsOf(shown.slice().reverse()), kind);
  return {
    exercise: { id: exercise.id, name: exercise.name, unit, assisted: exercise.assisted, archived: !!exercise.archived_at },
    from, to,
    sessions_in_range: runs.length,
    // More sessions in the range than were returned: ask for a shorter range, or a larger limit.
    more_in_range: newest.length > shown.length,
    estimated_one_rep_max: e1rm === null ? null : poundsOut(e1rm, unit),
    sessions: shown.map((r) => {
      const v = runVolume(r, kind);
      return {
        date: r.day,
        workout: r.workoutName,
        ...(r.inProgress ? { in_progress: true } : {}),
        // done, skipped (no sets), or replaced (swapped for another exercise).
        state: r.state,
        skipped: r.state === 'skipped',
        sets: r.sets.map((s) => ({
          number: s.setNumber, weight: weightOut(s.lb, { value: s.enteredValue, unit: s.enteredUnit }, unit),
          reps: s.reps, type: s.type, rpe: s.rpe, records: s.records,
        })),
        volume: totalOut(v.lb, c.me.totals_unit),
        bodyweight_volume: bodyweightOut(v.bw),
      };
    }),
  };
}

// ---------------------------------------------------------------- get_records

const recordsInput = z.object({
  exercise: exerciseRef.optional().describe('An exercise id or exact name. Leave out for every exercise that has records.'),
  next: nextInput,
}).strict();

async function getRecords(c: Caller, a: z.infer<typeof recordsInput>) {
  const exercises = await loadExercises(c.db);
  const one = a.exercise === undefined ? null : findExercise(exercises, a.exercise);
  const offset = readNext(a.next);
  const runsBy = await loadRuns(c.db, { exerciseId: one?.id });
  const rows = exercises
    .filter((e) => (one ? e.id === one.id : runsBy.has(e.id)))
    .sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id))
    .map((e) => {
      const runs = runsBy.get(e.id) ?? [];
      const sets = new Map(runs.flatMap((r) => r.sets).map((s) => [s.id, s]));
      const recs = currentRecords(factsOf(runs), kindOf(e));
      const records = Object.fromEntries((Object.entries(recs) as Array<[RecordType, NonNullable<(typeof recs)[RecordType]>]>).map(([type, r]) => {
        const s = sets.get(r.setId)!;
        return [type, {
          name: RECORD_LABEL[type],
          ...(type === 'most_reps' ? {} : { weight: weightOut(s.lb, { value: s.enteredValue, unit: s.enteredUnit }, e.default_unit) }),
          reps: r.reps,
          date: r.day,
        }];
      }));
      return { exercise: e.name, id: e.id, unit: e.default_unit, assisted: e.assisted, records };
    })
    // An exercise asked for by name is shown even with none; "all" lists only those that have some.
    .filter((r) => one || Object.keys(r.records).length > 0);
  const { items, next } = page(rows.slice(offset, offset + PAGE_SIZE + 1), offset);
  return { exercises: items, next };
}

// ---------------------------------------------------------------- list_sessions

const listSessionsInput = z.object({
  from: dateInput('First day to include. Default: no limit.'),
  to: dateInput('Last day to include. Default: today.'),
  limit: limitInput(20, PAGE_SIZE),
  next: nextInput,
}).strict();

async function listSessions(c: Caller, a: z.infer<typeof listSessionsInput>) {
  const offset = readNext(a.next);
  const limit = a.limit ?? 20;
  if (a.from && a.to && a.from > a.to) dateRange(a.from, a.to, { from: a.from, to: a.to });
  const rows = await loadSessionRows(c.db, { from: a.from, to: a.to, offset, limit: limit + 1 });
  const more = rows.length > limit;
  const [exercises, gyms] = await Promise.all([loadExercises(c.db), loadGymNames(c.db)]);
  const sessions = await loadAndShape(c.db, rows.slice(0, limit), {
    exercises: new Map(exercises.map((e) => [e.id, e])), gyms, totalsUnit: c.me.totals_unit, now: Date.now(),
  });
  return { sessions, next: more ? writeNext(offset + limit) : null };
}

// ---------------------------------------------------------------- list_cardio

const cardioInput = z.object({
  from: dateInput('First day to include. Default: 12 weeks ago.'),
  to: dateInput('Last day to include. Default: today.'),
  limit: limitInput(20, 100),
  next: nextInput,
}).strict();

export interface CardioRow { id: string; local_date: string; type: string; duration_seconds: number; distance: number | string | null; distance_unit: string | null; notes: string }

export const cardioOut = (r: CardioRow) => ({
  id: r.id,
  date: String(r.local_date).slice(0, 10),
  type: r.type,
  duration_seconds: r.duration_seconds,
  distance: r.distance === null ? null : { value: Number(r.distance), unit: r.distance_unit },
  notes: r.notes ?? '',
});

async function listCardio(c: Caller, a: z.infer<typeof cardioInput>) {
  const now = today(c);
  const { from, to } = dateRange(a.from, a.to, { from: daysBefore(now, 84), to: now });
  const offset = readNext(a.next);
  const limit = a.limit ?? 20;
  const { data, error } = await c.db.from('cardio_logs')
    .select('id, local_date, type, duration_seconds, distance, distance_unit, notes')
    .gte('local_date', from).lte('local_date', to)
    .order('local_date', { ascending: false }).order('created_at', { ascending: false }).order('id')
    .range(offset, offset + limit);
  if (error) failed('cardio read', error);
  const rows = (data ?? []) as CardioRow[];
  return {
    from, to,
    cardio: rows.slice(0, limit).map(cardioOut),
    next: rows.length > limit ? writeNext(offset + limit) : null,
  };
}

export const HISTORY_TOOLS: ToolDef[] = [
  { name: 'get_exercise_history', input: historyInput, readOnly: true, run: (c, a) => getExerciseHistory(c, a) },
  { name: 'get_records', input: recordsInput, readOnly: true, run: (c, a) => getRecords(c, a) },
  { name: 'list_sessions', input: listSessionsInput, readOnly: true, run: (c, a) => listSessions(c, a) },
  { name: 'list_cardio', input: cardioInput, readOnly: true, run: (c, a) => listCardio(c, a) },
];
