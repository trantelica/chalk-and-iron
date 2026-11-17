// Units: weights are stored in pounds (spec rule 4). Entry and display use
// each exercise's own unit. Shared by the phone, the planner and the server.

export const KG_PER_LB = 0.45359237;

export type WeightUnit = 'lb' | 'kg';
export type ExerciseUnit = WeightUnit | 'bw';

/** Rounds to 3 decimals, the precision the database stores pounds at. */
export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Converts a typed value to the pounds value that is stored. 27.5 kg -> 60.627 lb. */
export function toPounds(value: number, unit: WeightUnit): number {
  if (!Number.isFinite(value) || value < 0) throw new RangeError('A weight must be zero or more');
  return round3(unit === 'lb' ? value : value / KG_PER_LB);
}

/** Pounds shown in another unit, to one decimal. 60 lb -> 27.2 kg. */
export function fromPounds(lb: number, unit: WeightUnit): number {
  const v = unit === 'lb' ? lb : lb * KG_PER_LB;
  return Math.round(v * 10) / 10;
}

export interface StoredWeight {
  lb: number;
  enteredValue: number;
  enteredUnit: WeightUnit;
}

/**
 * The number to show for a stored weight in a chosen unit. A weight shown in
 * the unit it was typed in shows exactly as typed; otherwise it is converted
 * to one decimal (spec Section 3, Units).
 */
export function displayWeight(w: StoredWeight, unit: WeightUnit): number {
  return w.enteredUnit === unit ? w.enteredValue : fromPounds(w.lb, unit);
}

/** Text for a weight, for example "27.5 kg" or "1 BW". */
export function formatWeight(w: StoredWeight | null, unit: ExerciseUnit): string {
  if (unit === 'bw' || w === null) return '1 BW';
  const n = displayWeight(w, unit);
  return `${Number.isInteger(n) ? n : n.toFixed(1).replace(/\.0$/, '')} ${unit}`;
}

/**
 * What logging a weight box stores. If the box still holds a converted or
 * seeded value the user did not change, the original pounds value is kept,
 * so a unit switch alone never changes a weight (spec Section 10).
 */
export function weightToStore(
  boxValue: number,
  boxUnit: WeightUnit,
  untouchedOriginal: StoredWeight | null,
): StoredWeight {
  if (untouchedOriginal && displayWeight(untouchedOriginal, boxUnit) === boxValue) {
    return untouchedOriginal.enteredUnit === boxUnit
      ? untouchedOriginal
      : { lb: untouchedOriginal.lb, enteredValue: boxValue, enteredUnit: boxUnit };
  }
  return { lb: toPounds(boxValue, boxUnit), enteredValue: boxValue, enteredUnit: boxUnit };
}

/** Steps: 5 in the selected unit for weight, never below 0. */
export function stepWeight(value: number, direction: 1 | -1): number {
  return Math.max(0, Math.round((value + 5 * direction) * 1000) / 1000);
}

/** Steps: 1 for reps, never below 1. */
export function stepReps(value: number, direction: 1 | -1): number {
  return Math.max(1, Math.round(value) + direction);
}
