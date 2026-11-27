// Gym weights (spec Section 5, Profile and gyms). Kept as ONE line of plain text
// in the gym's notes, starting "Weights:", so there is no database change and a
// coach and a person read it the same way. Writing replaces only that line;
// reading it back fills the Weights section exactly. A line that was edited by
// hand and cannot be read is reported and left alone, never overwritten.
//
// Example line:
//   Weights: Dumbbells 5 to 120 lb in 5 lb steps. Kettlebells 8, 12, 16 kg. Plates 45 x4, 25 x2, 5 x2. Heaviest barbell: 275 lb (bar 45 lb).

export type WeightUnit = 'lb' | 'kg';
export const NOTES_MAX = 1000;
export const PLATE_SIZES: Record<WeightUnit, number[]> = { lb: [45, 35, 25, 10, 5, 2.5], kg: [25, 20, 15, 10, 5, 2.5, 1.25] };
export const KETTLEBELL_SIZES: Record<WeightUnit, number[]> = {
  lb: [10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100],
  kg: [4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48],
};
export const DEFAULT_BAR: Record<WeightUnit, number> = { lb: 45, kg: 20 };
export const DUMBBELL_STEPS: Record<WeightUnit, number[]> = { lb: [2.5, 5, 10], kg: [1, 2, 2.5, 5] };

export type Dumbbells = { min: number; max: number; step: number; unit: WeightUnit };
export type Kettlebells = { unit: WeightUnit; sizes: number[] };
export type PlateCount = { size: number; count: number };
/** null = not recorded; 'none' = the gym has none. Plates are in the bar's unit. */
export type Weights = {
  dumbbells: Dumbbells | 'none' | null;
  kettlebells: Kettlebells | 'none' | null;
  plates: PlateCount[] | 'none' | null;
  bar: { weight: number; unit: WeightUnit };
};

export const emptyWeights = (unit: WeightUnit = 'lb'): Weights => ({ dumbbells: null, kettlebells: null, plates: null, bar: { weight: DEFAULT_BAR[unit], unit } });

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Plates come in pairs on a barbell: an odd plate is left off. */
export function heaviestBarbell(plates: PlateCount[] | 'none' | null, bar: number): number {
  if (!plates || plates === 'none') return bar;
  const sum = plates.reduce((t, p) => t + p.size * 2 * Math.floor(p.count / 2), 0);
  return Math.round((bar + sum) * 100) / 100;
}

const cleanPlates = (p: PlateCount[]) => p.filter((x) => x.count > 0).sort((a, b) => b.size - a.size);

export function isEmpty(w: Weights): boolean { return w.dumbbells === null && w.kettlebells === null && w.plates === null; }

/** Why these weights cannot be written, or '' when they can. */
export function checkWeights(w: Weights): string {
  const d = w.dumbbells;
  if (d && d !== 'none') {
    if (!(d.min > 0) || !(d.max >= d.min) || !(d.step > 0)) return 'Dumbbells: the lightest must be above zero, the heaviest at least as much, and the step above zero.';
  }
  const k = w.kettlebells;
  if (k && k !== 'none' && (!k.sizes.length || k.sizes.some((s) => !(s > 0)))) return 'Kettlebells: tick at least one size, or choose None.';
  if (Array.isArray(w.plates) && cleanPlates(w.plates).length === 0) return 'Plates: add at least one plate, or choose None.';
  if (w.plates !== null && !(w.bar.weight > 0)) return 'The bar must weigh more than zero.';
  return '';
}

/** The line to store, or '' when nothing is recorded. Throws nothing; call checkWeights first. */
export function weightsLine(w: Weights): string {
  const parts: string[] = [];
  const u = w.bar.unit;
  const d = w.dumbbells;
  if (d === 'none') parts.push('Dumbbells none.');
  else if (d) parts.push(`Dumbbells ${fmt(d.min)} to ${fmt(d.max)} ${d.unit} in ${fmt(d.step)} ${d.unit} steps.`);
  const k = w.kettlebells;
  if (k === 'none') parts.push('Kettlebells none.');
  else if (k) parts.push(`Kettlebells ${[...k.sizes].sort((a, b) => a - b).map(fmt).join(', ')} ${k.unit}.`);
  const p = w.plates;
  if (p === 'none') parts.push('Plates none.');
  else if (p) parts.push(`Plates (${u}): ${cleanPlates(p).map((x) => `${fmt(x.size)} x${x.count}`).join(', ')}.`);
  if (p !== null) parts.push(`Heaviest barbell: ${fmt(heaviestBarbell(p, w.bar.weight))} ${u} (bar ${fmt(w.bar.weight)} ${u}).`);
  return parts.length ? `Weights: ${parts.join(' ')}` : '';
}

const N = '\\d+(?:\\.\\d+)?';
const RE = new RegExp(
  '^Weights:' +
  `(?: Dumbbells (?:(?<dnone>none)|(?<dmin>${N}) to (?<dmax>${N}) (?<dunit>lb|kg) in (?<dstep>${N}) (?<dunit2>lb|kg) steps)\\.)?` +
  `(?: Kettlebells (?:(?<knone>none)|(?<klist>${N}(?:, ${N})*) (?<kunit>lb|kg))\\.)?` +
  `(?: Plates (?:(?<pnone>none)|\\((?<punit>lb|kg)\\): (?<plist>${N} x\\d+(?:, ${N} x\\d+)*))\\.)?` +
  `(?: Heaviest barbell: (?<hv>${N}) (?<hunit>lb|kg) \\(bar (?<barw>${N}) (?<barunit>lb|kg)\\)\\.)?$`,
);

/** Reads one stored line back into weights, or null if it is not in the written form. */
export function parseWeightsLine(line: string): Weights | null {
  const g = RE.exec(line)?.groups;
  if (!g) return null;
  const w = emptyWeights((g.barunit as WeightUnit) || (g.punit as WeightUnit) || 'lb');
  if (g.dnone) w.dumbbells = 'none';
  else if (g.dmin !== undefined) {
    if (g.dunit !== g.dunit2) return null;
    w.dumbbells = { min: Number(g.dmin), max: Number(g.dmax), step: Number(g.dstep), unit: g.dunit as WeightUnit };
  }
  if (g.knone) w.kettlebells = 'none';
  else if (g.klist !== undefined) w.kettlebells = { unit: g.kunit as WeightUnit, sizes: g.klist.split(', ').map(Number) };
  if (g.pnone) w.plates = 'none';
  else if (g.plist !== undefined) w.plates = g.plist.split(', ').map((s) => { const [size, count] = s.split(' x'); return { size: Number(size), count: Number(count) }; });
  if (g.barw !== undefined) w.bar = { weight: Number(g.barw), unit: g.barunit as WeightUnit };
  else if (w.plates !== null) return null;
  if (g.hunit !== g.barunit || (g.punit && g.punit !== g.barunit)) return null;
  // The exact round trip: a line that does not come back identical (a wrong total, an odd order) is "hand-edited".
  return weightsLine(w) === line ? w : null;
}

export type ReadResult =
  | { status: 'none' }
  | { status: 'ok'; weights: Weights }
  | { status: 'unreadable'; line: string };

const BLOCK = /^\s*Weights:/;

export function readWeights(notes: string): ReadResult {
  const lines = notes.split('\n').filter((l) => BLOCK.test(l));
  if (lines.length === 0) return { status: 'none' };
  if (lines.length > 1) return { status: 'unreadable', line: lines[0].trim() };
  const line = lines[0].replace(/\r$/, '');
  const w = parseWeightsLine(line);
  return w ? { status: 'ok', weights: w } : { status: 'unreadable', line: line.trim() };
}

/** The notes with only the Weights line replaced (or added, or removed when nothing is recorded). */
export function setWeights(notes: string, w: Weights): { ok: true; notes: string } | { ok: false; error: string } {
  const bad = checkWeights(w);
  if (bad) return { ok: false, error: bad };
  const lines = notes.split('\n');
  const at = lines.map((l, i) => (BLOCK.test(l) ? i : -1)).filter((i) => i >= 0);
  if (at.length > 1 || (at.length === 1 && !parseWeightsLine(lines[at[0]].replace(/\r$/, '')))) {
    return { ok: false, error: 'The Weights line in the notes was edited by hand and cannot be read, so it was left alone. Fix or delete that line in the notes first.' };
  }
  const line = weightsLine(w);
  let next: string;
  if (at.length === 1) {
    if (line) lines[at[0]] = line; else lines.splice(at[0], 1);
    next = lines.join('\n').replace(/\s+$/, '');
  } else {
    const base = notes.replace(/\s+$/, '');
    next = line ? (base ? `${base}\n${line}` : line) : notes;
  }
  if (next.length > NOTES_MAX) return { ok: false, error: `The notes would be ${next.length} characters; the limit is ${NOTES_MAX}. Shorten the other notes first.` };
  return { ok: true, notes: next };
}

/** A preset's weights as written in data/gym-presets.json. */
export type PresetWeights = {
  dumbbells: Dumbbells | 'none';
  kettlebells: Kettlebells | 'none';
  plates: PlateCount[] | 'none';
  bar: { weight: number; unit: WeightUnit };
};
export const fromPreset = (p: PresetWeights): Weights => ({ dumbbells: p.dumbbells, kettlebells: p.kettlebells, plates: p.plates, bar: p.bar });
