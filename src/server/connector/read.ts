import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from '@/rules/days';
import { displayWeight, KG_PER_LB, round3, type ExerciseUnit } from '@/rules/units';
import type { ExerciseKind } from '@/rules/workout';
import { ConnectorError } from './errors';

// Pieces the read tools share (design Section 3, "Rules shared by every
// tool"): reading whole lists past the database's page size, weights and
// volume as the coach is told they come back, dates, and finding an exercise
// by id or exact name.

export function failed(what: string, e: { message: string } | null): never {
  throw new Error(`${what}: ${e?.message ?? 'no data'}`);
}

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/** Every row of a query, read a thousand at a time (the database stops at a thousand). */
export async function fetchAll<T>(what: string, make: (from: number, to: number) => Result<T>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < 200; page++) {
    const { data, error } = await make(page * 1000, page * 1000 + 999);
    if (error) failed(what, error);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

/** A list of ids read in pieces, so no request line grows too long and no piece can pass the database's thousand-row stop (40 ids x 24 sets is under it). */
export async function inChunks<T>(what: string, ids: string[], make: (chunk: string[]) => Result<T>, size = 40): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await make(ids.slice(i, i + size));
    if (error) failed(what, error);
    out.push(...(data ?? []));
  }
  return out;
}

// ---------------------------------------------------------------- inputs

const isRealDate = (s: string) => {
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export const dateInput = (about: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Write the date as 2026-11-16.').refine(isRealDate, 'That is not a real date.').optional().describe(about);

export const limitInput = (def: number, max: number) =>
  z.number().int().min(1, 'The limit is at least 1.').max(max, `The limit is at most ${max}.`).optional()
    .describe(`How many to return. Default ${def}, at most ${max}.`);

export const exerciseRef = z.string().trim().min(1, 'Give an exercise id or its exact name.').max(120).describe('An exercise id, or its exact name.');

/** from and to, with the defaults filled in; from after to is a mistake the coach can fix. */
export function dateRange(from: string | undefined, to: string | undefined, defaults: { from: string; to: string }) {
  const range = { from: from ?? defaults.from, to: to ?? defaults.to };
  if (range.from > range.to) {
    throw new ConnectorError('invalid_input', `"from" (${range.from}) is after "to" (${range.to}). Swap them, or leave one out.`, {
      problems: [{ field: 'from', problem: 'It must be on or before "to".' }],
    });
  }
  return range;
}

export const daysBefore = (date: string, n: number) => addDays(date, -n);

// ---------------------------------------------------------------- weights and volume

export interface Weight { value: number; unit: 'lb' | 'kg' | 'bw'; lb: number | null }

/**
 * A set's weight as the coach is told it: the value in the exercise's own unit,
 * the unit, and pounds. A bodyweight set is 1 BW with no pounds.
 */
export function weightOut(lb: number | null, entered: { value: number; unit: 'lb' | 'kg' | 'bw' }, exerciseUnit: ExerciseUnit): Weight {
  if (lb === null || entered.unit === 'bw') return { value: 1, unit: 'bw', lb: null };
  const unit = exerciseUnit === 'bw' ? entered.unit : exerciseUnit;
  return { value: displayWeight({ lb, enteredValue: entered.value, enteredUnit: entered.unit }, unit), unit, lb: round3(lb) };
}

/** A pounds figure in an exercise's own unit (an estimated one-rep max has no typed value). */
export function poundsOut(lb: number, exerciseUnit: ExerciseUnit): Weight {
  const unit = exerciseUnit === 'kg' ? 'kg' : 'lb';
  return { value: Math.round((unit === 'kg' ? lb * KG_PER_LB : lb) * 10) / 10, unit, lb: round3(lb) };
}

/** Volume in the person's totals unit, whole numbers. */
export function totalOut(lb: number, unit: 'lb' | 'kg') {
  return { value: Math.round(unit === 'kg' ? lb * KG_PER_LB : lb), unit };
}

/** Bodyweight and assisted volume is reps, kept apart and never added to the weight total. */
export const bodyweightOut = (reps: number) => ({ value: reps, unit: 'BW' });

// ---------------------------------------------------------------- exercises and the vocabulary

export interface ExerciseRow {
  id: string; name: string; default_unit: ExerciseUnit; assisted: boolean; load_count: number; archived_at: string | null;
  muscle_group_id: string | null; focus_id: string | null; equipment_id: string | null;
  work_seconds: number; rest_seconds: number; note: string;
}

export async function loadExercises(db: SupabaseClient, includeArchived = true): Promise<ExerciseRow[]> {
  const rows = await fetchAll<ExerciseRow>('exercises read', (a, b) => {
    let q = db.from('exercises')
      .select('id, name, default_unit, assisted, load_count, archived_at, muscle_group_id, focus_id, equipment_id, work_seconds, rest_seconds, note')
      .order('id');
    if (!includeArchived) q = q.is('archived_at', null);
    return q.range(a, b) as unknown as Result<ExerciseRow>;
  });
  return rows.map((r) => ({ ...r, assisted: !!r.assisted, load_count: Number(r.load_count ?? 1) }));
}

export const kindOf = (e: Pick<ExerciseRow, 'default_unit' | 'assisted' | 'load_count'> | undefined): ExerciseKind =>
  ({ unit: e?.default_unit ?? 'lb', assisted: e?.assisted ?? false, loadCount: e?.load_count ?? 1 });

export async function loadVocabularyNames(db: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await db.from('vocabulary_terms').select('id, name');
  if (error) failed('vocabulary read', error);
  return new Map(((data ?? []) as Array<{ id: string; name: string }>).map((t) => [t.id, t.name]));
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Finds an exercise by id or exact name (a live one first, when an archived one shares the name). */
export function findExercise(rows: ExerciseRow[], ref: string, field = 'exercise'): ExerciseRow {
  const clean = ref.trim();
  const found = UUID.test(clean)
    ? rows.find((r) => r.id.toLowerCase() === clean.toLowerCase())
    : rows.filter((r) => r.name.trim().toLowerCase() === clean.toLowerCase()).sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at))[0];
  if (!found) {
    throw new ConnectorError('not_found', `No exercise in the library has the id or exact name "${clean}". Use list_exercises with "search" to find its exact name.`, {
      problems: [{ field, problem: 'Not an exercise id or exact name in this library.' }],
    });
  }
  return found;
}
