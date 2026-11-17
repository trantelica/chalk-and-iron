// The starter library and vocabulary (spec Section 4; design question 28).
import { describe, expect, it } from 'vitest';
import starter from '../data/starter-library.json';
import { nameKey } from '@/rules/names';

const groups = new Map(starter.vocabulary.muscle_groups.map((g) => [g.name, g.focus]));

describe('starter library', () => {
  it('holds the 227 exercises Nathan approved on 17 November 2026 (version 2)', () => {
    expect(starter.version).toBe(2);
    expect(starter.exercises.length).toBe(227);
  });

  it('links every alternate to another starter exercise, so a swap keeps its own history', () => {
    const names = new Set(starter.exercises.map((e) => e.name));
    for (const e of starter.exercises) {
      for (const a of [e.alternates.bodyweight, e.alternates.basic_gym, e.alternates.full_gym]) {
        expect(names.has(a), `${e.name} -> ${a}`).toBe(true);
      }
    }
  });

  it('uses only vocabulary values, with a focus from the exercise\'s own muscle group', () => {
    for (const e of starter.exercises) {
      expect(groups.has(e.muscle_group), e.name).toBe(true);
      if (e.focus) expect(groups.get(e.muscle_group), e.name).toContain(e.focus);
      expect(starter.vocabulary.equipment, e.name).toContain(e.equipment);
    }
  });

  it('gives every exercise three different alternates, none of them itself', () => {
    for (const e of starter.exercises) {
      const alts = [e.alternates.bodyweight, e.alternates.basic_gym, e.alternates.full_gym];
      expect(alts.every((a) => typeof a === 'string' && a.length > 0), e.name).toBe(true);
      expect(new Set(alts.map(nameKey)).size, e.name).toBe(3);
      expect(alts.map(nameKey), e.name).not.toContain(nameKey(e.name));
      expect(e.alternates.bodyweight.startsWith('Bodyweight'), e.name).toBe(true);
    }
  });

  it('has no near-duplicate names', () => {
    const keys = starter.exercises.map((e) => nameKey(e.name));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses the default seconds: 45 work, 120 rest multi-joint, 90 single-joint, and bodyweight units for bodyweight and band equipment', () => {
    for (const e of starter.exercises) {
      expect(e.work_seconds).toBe(45);
      expect([90, 120]).toContain(e.rest_seconds);
      // Bands are bodyweight: their resistance is not standardized (Nathan, 17 Nov 2026).
      expect(e.default_unit === 'bw', e.name).toBe(e.equipment === 'bodyweight' || e.equipment === 'band');
    }
  });

  it('matches the spec\'s starter vocabulary', () => {
    expect([...groups.keys()]).toEqual(['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Glutes', 'Calves', 'Quads', 'Hamstrings', 'Adductors', 'Abductors']);
    expect(starter.vocabulary.equipment).toEqual(['barbell', 'dumbbell', 'kettlebell', 'cable', 'selectorized machine', 'plate-loaded machine', 'Smith machine', 'bodyweight', 'band', 'cardio machine']);
  });
});
