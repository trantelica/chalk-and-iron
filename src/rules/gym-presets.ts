// Gym presets (spec Section 5, Profile and gyms): the lists live in
// data/gym-presets.json, not in the database. A preset only fills in tick boxes;
// what is ticked is saved to the gym as ordinary free-text items.
import data from '../../data/gym-presets.json';
import { cleanEquipment, previewAdd } from './gym-equipment';
import { fromPreset, weightsLine, type PresetWeights, type Weights } from './gym-weights';

export type PresetGroup = { name: string; items: string[] };
export type Preset = { id: string; name: string; blurb: string; groups: PresetGroup[]; weights: PresetWeights };

export const GYM_PRESETS: Preset[] = data.presets as Preset[];

/** A preset's typical weights, and the line that would go in the gym's notes. */
export const presetWeights = (p: Preset): Weights => fromPreset(p.weights);
export const presetWeightsLine = (p: Preset): string => weightsLine(presetWeights(p));

export const presetById = (id: string): Preset | undefined => GYM_PRESETS.find((p) => p.id === id);

export const presetItems = (p: Preset): string[] => p.groups.flatMap((g) => g.items);

/** Everything in the preset, ticked (the starting point: the person unticks what the gym lacks). */
export const allTicked = (p: Preset): Set<string> => new Set(presetItems(p));

/**
 * What saving would put in the gym: the current list plus the ticked items.
 * Applying a preset never removes anything. `fresh` is what is new, `already` what the gym had.
 */
export function applyPreset(current: string[], p: Preset, ticked: Set<string>): { next: string[]; fresh: string[]; already: string[] } {
  const chosen = presetItems(p).filter((i) => ticked.has(i));
  const { fresh, already } = previewAdd(current, chosen);
  return { next: cleanEquipment([...current, ...fresh]), fresh, already };
}
