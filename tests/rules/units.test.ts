// Spec Section 8, "Units and entry", at the rules level.
import { describe, expect, it } from 'vitest';
import { displayWeight, formatWeight, fromPounds, stepReps, stepWeight, toPounds, weightToStore } from '@/rules/units';

describe('units and entry', () => {
  it('typing 27.5 with kg selected stores 60.627 lb and shows 27.5 kg afterward', () => {
    const stored = weightToStore(27.5, 'kg', null);
    expect(stored).toEqual({ lb: 60.627, enteredValue: 27.5, enteredUnit: 'kg' });
    expect(displayWeight(stored, 'kg')).toBe(27.5);
    expect(formatWeight(stored, 'kg')).toBe('27.5 kg');
  });

  it('60 lb shows as 27.2 kg after switching to kg', () => {
    const stored = weightToStore(60, 'lb', null);
    expect(displayWeight(stored, 'kg')).toBe(27.2);
    expect(fromPounds(60, 'kg')).toBe(27.2);
  });

  it('a unit switch alone never changes a weight', () => {
    const original = weightToStore(60, 'lb', null);
    const afterSwitch = weightToStore(displayWeight(original, 'kg'), 'kg', original);
    expect(afterSwitch.lb).toBe(60);
    // Changing the number does change it.
    expect(weightToStore(30, 'kg', original).lb).toBe(toPounds(30, 'kg'));
  });

  it('weight steps are plus and minus 5 in the selected unit, reps step by 1', () => {
    expect(stepWeight(60, 1)).toBe(65);
    expect(stepWeight(27.5, -1)).toBe(22.5);
    expect(stepReps(8, 1)).toBe(9);
    expect(stepReps(8, -1)).toBe(7);
  });

  it('weight cannot go below 0 and reps cannot go below 1', () => {
    expect(stepWeight(3, -1)).toBe(0);
    expect(stepWeight(0, -1)).toBe(0);
    expect(stepReps(1, -1)).toBe(1);
    expect(() => toPounds(-1, 'lb')).toThrow();
  });

  it('a bodyweight set reads 1 BW', () => {
    expect(formatWeight(null, 'bw')).toBe('1 BW');
  });
});
