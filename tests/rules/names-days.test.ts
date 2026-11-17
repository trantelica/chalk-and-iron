import { describe, expect, it } from 'vitest';
import { findNearDuplicate, isNearDuplicate } from '@/rules/names';
import { campaignPosition, mondayOf, nextRollover, trainingDay, weekday } from '@/rules/days';
import { supersetProblems } from '@/rules/supersets';

describe('near-duplicate names', () => {
  it('matches the same words in any order, case, punctuation, plural or short form', () => {
    expect(isNearDuplicate('Incline Dumbbell Press', 'Dumbbell Incline Press')).toBe(true);
    expect(isNearDuplicate('DB incline presses', 'Dumbbell Incline Press')).toBe(true);
    expect(isNearDuplicate('Bodyweight Pushups', 'Bodyweight Push-Up')).toBe(true);
    expect(findNearDuplicate('cable fly, standing', ['Cable Standing Fly', 'Barbell Curl'])).toBe('Cable Standing Fly');
  });
  it('does not match genuinely different lifts', () => {
    expect(isNearDuplicate('Selectorized Machine Hip Adduction', 'Selectorized Machine Hip Abduction')).toBe(false);
    expect(isNearDuplicate('Dumbbell Bench Press', 'Barbell Bench Press')).toBe(false);
  });
});

describe('days roll over at 3:00 am, weeks run Monday to Sunday', () => {
  it('2:59 am belongs to the day before, 3:00 am to the new day', () => {
    expect(trainingDay(new Date('2026-11-18T09:59:00Z'), 'America/Denver')).toBe('2026-11-17');
    expect(trainingDay(new Date('2026-11-18T10:00:00Z'), 'America/Denver')).toBe('2026-11-18');
  });
  it('rolls over across a month end and in other time zones', () => {
    expect(trainingDay(new Date('2026-12-01T01:00:00Z'), 'Europe/London')).toBe('2026-11-30');
  });
  it('the next rollover is 3:00 am local time', () => {
    expect(nextRollover(new Date('2026-11-17T20:00:00Z'), 'America/Denver').toISOString()).toBe('2026-11-18T10:00:00.000Z');
  });
  it('weekday 1 is Monday', () => {
    expect(weekday('2026-11-16')).toBe(1);
    expect(weekday('2026-11-22')).toBe(7);
    expect(mondayOf('2026-11-19')).toBe('2026-11-16');
  });
  it('week 1 is the week holding the start date, and a shifted week does not count', () => {
    expect(campaignPosition('2026-11-19', '2026-11-18', 4)).toEqual({ week: 1, weekday: 4 });
    expect(campaignPosition('2026-11-16', '2026-11-18', 4)).toBeNull();
    expect(campaignPosition('2026-11-23', '2026-11-18', 4)).toEqual({ week: 2, weekday: 1 });
    expect(campaignPosition('2026-12-07', '2026-11-18', 4)).toEqual({ week: 4, weekday: 1 });
    expect(campaignPosition('2026-12-14', '2026-11-18', 4)).toBeNull();
    // Shift forward a week starting 30 Nov: that week is blank, and week 3 moves to 7 Dec.
    expect(campaignPosition('2026-12-01', '2026-11-18', 4, ['2026-11-30'])).toBeNull();
    expect(campaignPosition('2026-12-07', '2026-11-18', 4, ['2026-11-30'])).toEqual({ week: 3, weekday: 1 });
    expect(campaignPosition('2026-12-14', '2026-11-18', 4, ['2026-11-30'])).toEqual({ week: 4, weekday: 1 });
  });
});

describe('supersets', () => {
  it('two or three members, equal sets', () => {
    expect(supersetProblems([{ sets: 3, superset: 'A' }, { sets: 3, superset: 'A' }])).toEqual([]);
    expect(supersetProblems([{ sets: 3, superset: 'A' }])).toHaveLength(1);
    expect(supersetProblems([{ sets: 4, superset: 'A' }, { sets: 3, superset: 'A' }])[0]).toMatch(/different set counts/);
    expect(supersetProblems(Array.from({ length: 4 }, () => ({ sets: 3, superset: 'B' })))[0]).toMatch(/two or three/);
  });
});
