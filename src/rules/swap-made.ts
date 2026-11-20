// A swap to an alternate that is not yet in the library (spec Section 2,
// Quick-swap; design question 16). The new exercise is made at once, so the
// workout never waits, with details copied from the original:
//   * muscle group, focus, work and rest seconds: the original's;
//   * unit: bodyweight for the bodyweight alternate, otherwise the original's;
//   * equipment: bodyweight for the bodyweight alternate; otherwise not known,
//     so it stays empty until the person picks it in the one-tap confirm.
// An exercise with an empty muscle group or equipment is "incomplete". That is
// worked out, never stored, and never blocks its use.

import type { SwapMadeExercise } from './sync';
import type { ExerciseUnit } from './units';

export type Tier = 'bodyweight' | 'basic_gym' | 'full_gym';

export interface VocabTerm { id: string; kind: 'muscle_group' | 'focus' | 'equipment'; name: string; parentId: string | null }

/** What the phone knows of the exercise being swapped out. */
export interface Original {
  muscleId: string | null; focusId: string | null; unit: ExerciseUnit; work: number; rest: number;
}

export function suggestSwapMade(id: string, name: string, tier: Tier, from: Original, vocab: VocabTerm[]): SwapMadeExercise {
  const bodyweight = vocab.find((v) => v.kind === 'equipment' && v.name.toLowerCase() === 'bodyweight');
  return {
    id,
    name: name.trim().slice(0, 120),
    muscle_group_id: from.muscleId,
    focus_id: from.muscleId ? from.focusId : null,
    equipment_id: tier === 'bodyweight' ? bodyweight?.id ?? null : null,
    default_unit: tier === 'bodyweight' ? 'bw' : from.unit,
    work_seconds: from.work,
    rest_seconds: from.rest,
  };
}

/** The fields an exercise is missing, if any (design Section 2: incomplete). */
export function missingFields(x: { muscle_group_id: string | null; equipment_id: string | null }): ('muscle group' | 'equipment')[] {
  const out: ('muscle group' | 'equipment')[] = [];
  if (!x.muscle_group_id) out.push('muscle group');
  if (!x.equipment_id) out.push('equipment');
  return out;
}
