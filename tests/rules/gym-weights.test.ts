import { describe, expect, it } from 'vitest';
import {
  NOTES_MAX, emptyWeights, heaviestBarbell, parseWeightsLine, readWeights, setWeights, weightsLine, type Weights,
} from '@/rules/gym-weights';
import { GYM_PRESETS, presetWeights, presetWeightsLine } from '@/rules/gym-presets';

const full: Weights = {
  dumbbells: { min: 5, max: 120, step: 5, unit: 'lb' },
  kettlebells: { unit: 'kg', sizes: [24, 8, 12, 16, 20] },
  plates: [{ size: 25, count: 2 }, { size: 45, count: 4 }, { size: 10, count: 2 }, { size: 5, count: 2 }],
  bar: { weight: 45, unit: 'lb' },
};

describe('gym weights line', () => {
  it('writes one readable line', () => {
    expect(weightsLine(full)).toBe(
      'Weights: Dumbbells 5 to 120 lb in 5 lb steps. Kettlebells 8, 12, 16, 20, 24 kg. Plates (lb): 45 x4, 25 x2, 10 x2, 5 x2. Heaviest barbell: 305 lb (bar 45 lb).',
    );
  });
  it('heaviest barbell is the bar plus plates in pairs; an odd plate is left off', () => {
    expect(heaviestBarbell(full.plates, 45)).toBe(45 + 180 + 50 + 20 + 10);
    expect(heaviestBarbell([{ size: 45, count: 5 }], 45)).toBe(45 + 180);
    expect(heaviestBarbell([{ size: 1.25, count: 2 }, { size: 2.5, count: 2 }], 20)).toBe(27.5);
    expect(heaviestBarbell('none', 20)).toBe(20);
    expect(heaviestBarbell(null, 45)).toBe(45);
  });
  it('reads back exactly what it wrote, in both units and with none', () => {
    const cases: Weights[] = [
      full,
      { dumbbells: { min: 2.5, max: 40, step: 2.5, unit: 'kg' }, kettlebells: 'none', plates: [{ size: 25, count: 4 }, { size: 1.25, count: 2 }], bar: { weight: 20, unit: 'kg' } },
      { dumbbells: 'none', kettlebells: 'none', plates: 'none', bar: { weight: 45, unit: 'lb' } },
      { ...emptyWeights(), dumbbells: { min: 5, max: 50, step: 5, unit: 'lb' } },
      { ...emptyWeights('kg'), kettlebells: { unit: 'lb', sizes: [35] } },
    ];
    for (const w of cases) {
      const line = weightsLine(w);
      const back = parseWeightsLine(line);
      expect(back, line).not.toBeNull();
      expect(weightsLine(back!)).toBe(line);
      if (w.plates === null) expect(back!.plates).toBeNull();
    }
    const r = parseWeightsLine(weightsLine(full))!;
    expect(r.dumbbells).toEqual(full.dumbbells);
    expect(r.plates).toEqual([{ size: 45, count: 4 }, { size: 25, count: 2 }, { size: 10, count: 2 }, { size: 5, count: 2 }]);
    expect(r.bar).toEqual({ weight: 45, unit: 'lb' });
  });
  it('writes nothing when nothing is recorded', () => { expect(weightsLine(emptyWeights())).toBe(''); });
  it('refuses a hand-edited or wrong line instead of guessing', () => {
    expect(parseWeightsLine('Weights: Dumbbells lots.')).toBeNull();
    expect(parseWeightsLine('Weights: Plates (lb): 45 x4. Heaviest barbell: 999 lb (bar 45 lb).')).toBeNull();
    expect(parseWeightsLine('Weights: Dumbbells 5 to 50 lb in 5 kg steps.')).toBeNull();
    expect(parseWeightsLine('Weights: Plates (lb): 45 x4.')).toBeNull();
    expect(parseWeightsLine('Weights:')).toBeNull();
  });
});

describe('weights in the notes', () => {
  it('adds the block after other notes and leaves them untouched, then replaces only the block', () => {
    const notes = 'Closed Sundays.\nNo chalk allowed.';
    const a = setWeights(notes, full);
    expect(a.ok && a.notes).toBe(`${notes}\n${weightsLine(full)}`);
    const next = { ...full, dumbbells: { min: 10, max: 100, step: 10, unit: 'lb' as const } };
    const b = setWeights((a as { notes: string }).notes, next);
    expect(b.ok && b.notes).toBe(`${notes}\n${weightsLine(next)}`);
    expect(b.ok && b.notes.split('\n').filter((l) => l.startsWith('Weights:')).length).toBe(1);
  });
  it('keeps notes written after the block', () => {
    const notes = `Top note\n${weightsLine(full)}\nBottom note`;
    const r = setWeights(notes, { ...full, plates: 'none' });
    expect(r.ok && r.notes.startsWith('Top note\nWeights: ')).toBe(true);
    expect(r.ok && r.notes.endsWith('\nBottom note')).toBe(true);
  });
  it('removes the block when nothing is recorded any more', () => {
    const r = setWeights(`Top\n${weightsLine(full)}`, emptyWeights());
    expect(r.ok && r.notes).toBe('Top');
  });
  it('reads the block back, and says so when there is none or it cannot be read', () => {
    expect(readWeights('Just notes')).toEqual({ status: 'none' });
    const ok = readWeights(`Hi\n${weightsLine(full)}`);
    expect(ok.status === 'ok' && weightsLine(ok.weights)).toBe(weightsLine(full));
    expect(readWeights('Weights: about 5 to 100').status).toBe('unreadable');
    expect(readWeights(`${weightsLine(full)}\n${weightsLine(full)}`).status).toBe('unreadable');
  });
  it('never overwrites a hand-edited block', () => {
    const notes = 'Weights: dumbbells up to 100, ask Sam';
    const r = setWeights(notes, full);
    expect(r.ok).toBe(false);
  });
  it('respects the 1000 character limit', () => {
    const r = setWeights('x'.repeat(NOTES_MAX - 20), full);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain('1000');
    expect(setWeights('x'.repeat(100), full).ok).toBe(true);
  });
  it('refuses weights that make no sense', () => {
    expect(setWeights('', { ...full, dumbbells: { min: 50, max: 5, step: 5, unit: 'lb' } }).ok).toBe(false);
    expect(setWeights('', { ...full, kettlebells: { unit: 'kg', sizes: [] } }).ok).toBe(false);
    expect(setWeights('', { ...full, plates: [{ size: 45, count: 0 }] }).ok).toBe(false);
  });
});

describe('preset weights', () => {
  it('each preset has weights that write, read back, and fit the notes limit', () => {
    for (const p of GYM_PRESETS) {
      const line = presetWeightsLine(p);
      expect(line.startsWith('Weights: '), p.id).toBe(true);
      expect(line.length).toBeLessThan(NOTES_MAX / 2);
      expect(weightsLine(parseWeightsLine(line)!)).toBe(line);
      expect(setWeights('', presetWeights(p)).ok).toBe(true);
    }
  });
  it('are large, modest and small', () => {
    const top = (id: string) => { const d = presetWeights(GYM_PRESETS.find((p) => p.id === id)!).dumbbells; return d && d !== 'none' ? d.max : 0; };
    expect(top('commercial')).toBe(150);
    expect(top('home')).toBe(50);
    expect(top('hotel')).toBe(50);
    expect(presetWeights(GYM_PRESETS[2]).plates).toBe('none');
  });
});
