import { describe, expect, it } from 'vitest';
import starter from '../../data/starter-library.json';
import { ITEM_MAX, LIST_MAX, checkEquipment } from '@/rules/gym-equipment';
import { allTicked, applyPreset, GYM_PRESETS, presetItems } from '@/rules/gym-presets';

describe('gym presets', () => {
  it('has the three presets, sized large, small and smallest', () => {
    expect(GYM_PRESETS.map((p) => p.id)).toEqual(['commercial', 'home', 'hotel']);
    const n = Object.fromEntries(GYM_PRESETS.map((p) => [p.id, presetItems(p).length]));
    expect(n.commercial).toBeGreaterThan(n.home);
    expect(n.home).toBeGreaterThan(n.hotel);
  });
  it('has valid items: at most 60 characters, no repeats within a preset, saveable as a gym list', () => {
    for (const p of GYM_PRESETS) {
      const items = presetItems(p);
      expect(items.length).toBeLessThan(LIST_MAX);
      expect(new Set(items.map((i) => i.toLowerCase())).size, p.name).toBe(items.length);
      for (const i of items) expect(i.length, i).toBeLessThanOrEqual(ITEM_MAX);
      expect(checkEquipment(items).ok).toBe(true);
    }
  });
  it('the commercial list covers every kind of equipment the starter exercises use', () => {
    const text = presetItems(GYM_PRESETS[0]).join(' ').toLowerCase();
    for (const kind of ['dumbbell', 'barbell', 'cable', 'selectorized', 'plate-loaded', 'smith machine', 'kettlebell', 'band']) expect(text, kind).toContain(kind);
    expect(starter.exercises.length).toBe(227);
  });
  it('applying only adds: the current list stays, repeats are skipped, unticked items stay out', () => {
    const home = GYM_PRESETS[1];
    const ticked = allTicked(home);
    ticked.delete('Treadmill');
    const r = applyPreset(['Sandbag', 'barbell'], home, ticked);
    expect(r.next).toContain('Sandbag');
    expect(r.next).toContain('barbell');
    expect(r.next).not.toContain('Barbell');
    expect(r.next).not.toContain('Treadmill');
    expect(r.already).toEqual(['Barbell']);
    expect(r.fresh.length).toBe(presetItems(home).length - 2);
  });
});
