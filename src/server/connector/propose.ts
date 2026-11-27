import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { findNearDuplicate } from '@/rules/names';
import { toPounds } from '@/rules/units';
import { ConnectorError, type Problem } from './errors';
import { failed, findExercise, loadExercises, type ExerciseRow } from './read';

// Pieces the five propose tools share (design Section 3, "Propose tools"):
// the checks that run before anything reaches the inbox, and the errors that
// say what is wrong and how to fix it (spec Section 4, "How the coach is
// shaped", lever 2). A propose tool checks everything first, turns names into
// ids, and stores the card in the shape stage 4D applies ("What each proposal
// carries").

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- inputs

export const summaryLines = z
  .array(z.string().trim().min(1, 'A summary line cannot be empty.').max(300, 'A summary line is at most 300 characters.'))
  .min(1, 'Give 1 to 20 summary lines, one per change.')
  .max(20, 'At most 20 summary lines. Bundle related changes into one line each, or fewer lines.')
  .describe('What the user reads on the card: 1 to 20 plain lines, each up to 300 characters, one clear line per change, such as "Overhead Press becomes Dumbbell Shoulder Press".');

const whole = (label: string, min: number, max: number) =>
  z.number(`${label} must be a number.`).int(`${label} must be a whole number.`).min(min, `${label} is at least ${min}.`).max(max, `${label} is at most ${max}.`);

export const setsInput = whole('sets', 1, 12);
export const repsInput = whole('reps', 1, 50);
export const restInput = whole('rest_seconds', 0, 600);

export const weightInput = z.object({
  value: z.number('weight.value must be a number.').min(0, 'weight.value cannot be negative.'),
  unit: z.enum(['lb', 'kg'], 'weight.unit is "lb" or "kg".'),
}).strict().describe('A weight with its unit, for example { "value": 27.5, "unit": "kg" }.');

export const exerciseRefInput = z.string().trim().min(1, 'Give an exercise id or its exact name.').max(120).describe('An exercise id, or its exact name.');

export const supersetInput = z.string().trim().regex(/^[A-Za-z]$/, 'A superset letter is one letter, A to Z.');

export const alternatesInput = z.object({
  bodyweight: z.string().trim().min(1, 'The bodyweight alternate needs a name.').max(120).optional(),
  basic_gym: z.string().trim().min(1, 'The basic gym alternate needs a name.').max(120).optional(),
  full_gym: z.string().trim().min(1, 'The full gym alternate needs a name.').max(120).optional(),
}).strict().describe('Three alternates, by exercise name: bodyweight (needs no equipment), basic gym and full gym. A new exercise needs all three.');

/** The fields of one exercise, as propose_exercise and every "new_exercises" list take them. */
export const exerciseFields = {
  name: z.string().trim().min(1, 'The exercise needs a name.').max(120, 'An exercise name is at most 120 characters.').describe('Equipment, then variation, then movement, for example "Cable Overhead Triceps Extension".'),
  muscle_group: z.string().trim().min(1).max(60).describe('A muscle group from get_vocabulary.'),
  focus: z.string().trim().min(1).max(60).optional().describe('A focus value under that muscle group, from get_vocabulary.'),
  equipment: z.string().trim().min(1).max(60).describe('An equipment value from get_vocabulary.'),
  default_unit: z.enum(['lb', 'kg', 'bw'], 'default_unit is "lb", "kg" or "bw" (bodyweight).'),
  work_seconds: whole('work_seconds', 5, 600).describe('Seconds one set takes.'),
  rest_seconds: whole('rest_seconds', 0, 600).describe('Rest after a set, in seconds.'),
  note: z.string().max(500, 'A note is at most 500 characters.').optional(),
  alternates: alternatesInput,
};
export const newExerciseInput = z.object(exerciseFields).strict();
export type NewExercise = z.infer<typeof newExerciseInput>;

// ---------------------------------------------------------------- collecting problems

/** Problems found so far, so the coach can fix them all in one go. */
export class Problems {
  readonly list: Problem[] = [];
  add(field: string, problem: string) { this.list.push({ field, problem }); }
  get any() { return this.list.length > 0; }
  /** Throws invalid_input if anything was found. */
  check(tool: string) {
    if (!this.any) return;
    throw new ConnectorError('invalid_input', `Some inputs to ${tool} are not right. Fix each problem listed and call it again; nothing was proposed.`, { problems: this.list });
  }
}

// ---------------------------------------------------------------- the library, read once per call

export interface Term { id: string; kind: 'muscle_group' | 'focus' | 'equipment'; name: string; parent_id: string | null }

export async function loadTerms(db: SupabaseClient): Promise<Term[]> {
  const { data, error } = await db.from('vocabulary_terms').select('id, kind, name, parent_id').is('archived_at', null);
  if (error) failed('vocabulary read', error);
  return (data ?? []) as Term[];
}

export interface Library { exercises: ExerciseRow[]; terms: Term[] }

export async function loadLibrary(db: SupabaseClient): Promise<Library> {
  const [exercises, terms] = await Promise.all([loadExercises(db), loadTerms(db)]);
  return { exercises, terms };
}

/** The version of one record the card would change, so Accept can check nobody edited it since (design Section 5). */
export async function versionOf(db: SupabaseClient, table: 'exercises' | 'workouts' | 'campaigns' | 'gyms', id: string): Promise<number> {
  const { data, error } = await db.from(table).select('version').eq('id', id).maybeSingle();
  if (error) failed(`${table} read`, error);
  if (!data) throw new Error(`${table} row vanished`);
  return Number((data as { version: number }).version);
}

// ---------------------------------------------------------------- vocabulary

/** A vocabulary value by exact name (any capitals), or unknown_vocabulary with the allowed values. */
export function term(terms: Term[], kind: Term['kind'], value: string, field: string, parent?: Term): Term {
  const pool = terms.filter((t) => t.kind === kind && (parent === undefined || t.parent_id === parent.id));
  const hit = pool.find((t) => t.name.trim().toLowerCase() === value.trim().toLowerCase());
  if (hit) return hit;
  const allowed = pool.map((t) => t.name);
  const label = kind === 'muscle_group' ? 'muscle group' : kind === 'focus' ? `focus value of ${parent?.name}` : 'equipment';
  throw new ConnectorError(
    'unknown_vocabulary',
    `"${value}" is not one of this user's ${label} values. Use exactly one of: ${allowed.join(', ') || '(none)'}. Call get_vocabulary to see them all.`,
    { problems: [{ field, problem: `Allowed values: ${allowed.join(', ')}` }], allowed },
  );
}

export const priorityValues = ['strength', 'muscle', 'fat_loss', 'general_fitness', 'endurance', 'mobility', 'sport', 'habit', 'other'] as const;

// ---------------------------------------------------------------- exercises

export function nearDuplicate(name: string, field: string, library: Library, ignoreId?: string, others: string[] = []) {
  const live = library.exercises.filter((e) => !e.archived_at && e.id !== ignoreId);
  const hit = findNearDuplicate(name, live.map((e) => e.name));
  if (hit) {
    const existing = live.find((e) => e.name === hit)!;
    throw new ConnectorError(
      'near_duplicate_name',
      `"${name}" is too close to "${existing.name}", which is already in the library. Use that exercise (its id is ${existing.id}), or give the new one a clearly different name.`,
      { problems: [{ field, problem: `Too close to the existing exercise "${existing.name}".` }], existing: { id: existing.id, name: existing.name } },
    );
  }
  const twin = findNearDuplicate(name, others);
  if (twin) {
    throw new ConnectorError(
      'near_duplicate_name',
      `"${name}" is too close to "${twin}", another new exercise in this same proposal. List it once, or give one of them a clearly different name.`,
      { problems: [{ field, problem: `Too close to "${twin}" in this proposal.` }] },
    );
  }
}

export interface ExercisePayload {
  name?: string; muscle_group_id?: string; focus_id?: string | null; equipment_id?: string; default_unit?: string;
  work_seconds?: number; rest_seconds?: number; note?: string; alternates?: Record<string, string>;
}

/**
 * One exercise's fields checked against the library and turned into the card's
 * shape. A new exercise needs every field but focus and note, with all three
 * alternates (decided 17 Nov, question 23); an edit changes only the fields given.
 */
export function exercisePayload(x: Partial<NewExercise>, library: Library, at: string, mode: 'new' | 'edit', problems: Problems, edited?: ExerciseRow, others: string[] = []): ExercisePayload {
  const out: ExercisePayload = {};
  if (mode === 'new') {
    for (const f of ['name', 'muscle_group', 'equipment', 'default_unit', 'work_seconds', 'rest_seconds'] as const) {
      if (x[f] === undefined) problems.add(`${at}${f}`, `A new exercise needs ${f}.`);
    }
    const alt = x.alternates ?? {};
    for (const t of ['bodyweight', 'basic_gym', 'full_gym'] as const) {
      if (!alt[t]) problems.add(`${at}alternates.${t}`, `A new exercise needs all three alternates; give the ${t.replace('_', ' ')} alternate by name.`);
    }
  }
  if (x.name !== undefined) {
    nearDuplicate(x.name, `${at}name`, library, edited?.id, others);
    out.name = x.name;
  }
  let group: Term | undefined;
  if (x.muscle_group !== undefined) {
    group = term(library.terms, 'muscle_group', x.muscle_group, `${at}muscle_group`);
    out.muscle_group_id = group.id;
  }
  if (x.focus !== undefined) {
    const parent = group ?? library.terms.find((t) => t.id === edited?.muscle_group_id);
    if (!parent) problems.add(`${at}focus`, 'A focus belongs to a muscle group. Give the muscle group too.');
    else out.focus_id = term(library.terms, 'focus', x.focus, `${at}focus`, parent).id;
  }
  if (x.equipment !== undefined) out.equipment_id = term(library.terms, 'equipment', x.equipment, `${at}equipment`).id;
  for (const f of ['default_unit', 'work_seconds', 'rest_seconds', 'note'] as const) if (x[f] !== undefined) (out as Record<string, unknown>)[f] = x[f];
  if (x.alternates && Object.keys(x.alternates).length) out.alternates = Object.fromEntries(Object.entries(x.alternates).filter(([, v]) => v)) as Record<string, string>;
  return out;
}

/** The library exercise a row names, by id or exact name, and not archived. */
export function liveExercise(library: Library, ref: string, field: string): ExerciseRow {
  const e = findExercise(library.exercises, ref, field);
  if (e.archived_at) {
    throw new ConnectorError('invalid_input', `"${e.name}" is archived, so it cannot be used. Pick another exercise, or propose a new one.`, {
      problems: [{ field, problem: `"${e.name}" is archived.` }],
    });
  }
  return e;
}

// ---------------------------------------------------------------- weights

/** A weight in pounds as the app stores it, with what the coach typed when it was kilograms. */
export function weightPounds(w: { value: number; unit: 'lb' | 'kg' }, field: string, problems: Problems): { weight_lb: number; weight_entered_value: number; weight_entered_unit: 'lb' | 'kg' } | null {
  const lb = Math.round(toPounds(w.value, w.unit) * 1000) / 1000;
  if (lb > 2000) {
    problems.add(field, 'A weight is at most 2000 lb (about 907 kg).');
    return null;
  }
  return { weight_lb: lb, weight_entered_value: w.value, weight_entered_unit: w.unit };
}

// ---------------------------------------------------------------- workouts and supersets

export interface Row { exercise: string; letter: string | null; sets: number }

/**
 * A superset holds two or three exercises, each with the same number of sets
 * (spec Section 10). The messages say how to fix it.
 */
export function checkSupersets(rows: Row[], at: string, problems: Problems) {
  const byLetter = new Map<string, Row[]>();
  for (const r of rows) if (r.letter) byLetter.set(r.letter, [...(byLetter.get(r.letter) ?? []), r]);
  for (const [letter, members] of byLetter) {
    if (members.length < 2 || members.length > 3) {
      problems.add(`${at}superset ${letter}`, members.length < 2
        ? `Superset ${letter} has only ${members.length} exercise. A superset holds two or three exercises: add one, or make it a single exercise.`
        : `Superset ${letter} has ${members.length} exercises (${members.map((m) => m.exercise).join(', ')}). A superset holds two or three exercises. Split these into supersets of two or three, or make one a single exercise.`);
    } else if (new Set(members.map((m) => m.sets)).size > 1) {
      problems.add(`${at}superset ${letter}`,
        `Superset ${letter} mixes set counts (${members.map((m) => `${m.exercise}: ${m.sets}`).join(', ')}). Give every exercise in a superset the same number of sets.`);
    }
  }
}

export const norm = (s: string) => s.trim().toLowerCase();

/** Looks up a new exercise (one this proposal brings) by name, or a library exercise by id or name. */
export function resolveExercise(
  library: Library, newNames: Map<string, string>, ref: string, field: string,
): { kind: 'library'; row: ExerciseRow } | { kind: 'new'; name: string } {
  const mine = UUID.test(ref.trim()) ? undefined : newNames.get(norm(ref));
  if (mine !== undefined) return { kind: 'new', name: mine };
  return { kind: 'library', row: liveExercise(library, ref, field) };
}

/** The new exercises in a list, checked, as the card carries them (each named by its own name as its "ref"). */
export function newExercisePayloads(list: NewExercise[] | undefined, library: Library, problems: Problems, at = 'new_exercises'): Array<ExercisePayload & { ref: string }> {
  const out: Array<ExercisePayload & { ref: string }> = [];
  const seen: string[] = [];
  (list ?? []).forEach((x, i) => {
    const p = exercisePayload(x, library, `${at}[${i}].`, 'new', problems, undefined, seen);
    seen.push(x.name);
    out.push({ ...p, ref: x.name });
  });
  return out;
}
