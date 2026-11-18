import { describe, expect, it } from 'vitest';
import {
  budgetSingle,
  budgetSuperset,
  budgetsAfterBreak,
  celebrationName,
  currentRecords,
  dial,
  efficiency,
  estimatedOneRepMax,
  newClock,
  pauseClock,
  readClock,
  recordsEarned,
  seedWeights,
  setVolume,
  startClock,
  toggleWarmup,
  type ExerciseKind,
  type SetFacts,
} from '@/rules/workout';

const lbKind: ExerciseKind = { unit: 'lb', assisted: false, loadCount: 1 };
let n = 0;
const set = (lb: number | null, reps: number, day = '2026-11-10', type: SetFacts['type'] = 'working'): SetFacts => ({
  id: `s${++n}`, lb, reps, type, day, order: n,
});

describe('time budget', () => {
  it('a superset of 4 rounds, 45 and 40 work, 120 rest is 11:40', () => {
    expect(budgetSuperset(4, [45, 40], 120)).toBe(11 * 60 + 40);
  });
  it('a single exercise of 3 sets, 50 work, 150 rest is 7:30', () => {
    expect(budgetSingle(3, 50, 150)).toBe(450);
  });
  it('breaking that superset before it starts gives 9:00 and 7:10', () => {
    const b = budgetsAfterBreak([
      { sets: 4, logged: 0, work: 45, rest: 120 },
      { sets: 4, logged: 0, work: 40, rest: 90 },
    ]);
    expect(b).toEqual([9 * 60, 7 * 60 + 10]);
  });
  it('breaking after 2 rounds leaves each exercise 2 sets', () => {
    const b = budgetsAfterBreak([
      { sets: 4, logged: 2, work: 45, rest: 120 },
      { sets: 4, logged: 2, work: 40, rest: 90 },
    ]);
    expect(b).toEqual([budgetSingle(2, 45, 120), budgetSingle(2, 40, 90)]);
  });
});

describe('clocks', () => {
  it('does not run before it is started, pauses and resumes from the same reading', () => {
    let c = newClock();
    expect(readClock(c, 5000)).toBe(0);
    c = startClock(c, 1000);
    expect(readClock(c, 11000)).toBe(10);
    c = pauseClock(c, 11000);
    expect(readClock(c, 99000)).toBe(10);
    c = startClock(c, 100000);
    expect(readClock(c, 105000)).toBe(15);
  });
});

describe('the dial', () => {
  const B = 450;
  it('is half at half the budget and empty at the full budget', () => {
    expect(dial(B, B / 2).fill).toBeCloseTo(0.5);
    expect(dial(B, B).fill).toBe(0);
  });
  it('is half red at 1.5 times and full red at double', () => {
    const half = dial(B, B * 1.5);
    expect(half.red).toBe(true);
    expect(half.fill).toBeCloseTo(0.5);
    expect(dial(B, B * 2).fill).toBe(1);
  });
  it('stays full red at 3.2 times, reading 2.2 times over', () => {
    const d = dial(B, B * 3.2);
    expect(d.red).toBe(true);
    expect(d.fill).toBe(1);
    expect(-d.remaining).toBeCloseTo(B * 2.2);
  });
  it('is full before the exercise is started', () => {
    expect(dial(B, 0, false).fill).toBe(1);
  });
});

describe('efficiency', () => {
  it('7:30 budget, 3 planned, 2 done at 6:00 is 83%', () => {
    expect(efficiency([{ budget: 450, planned: 3, done: 2, actual: 360 }])).toBe(83);
  });
  it('is n/a until an exercise has started', () => {
    expect(efficiency([])).toBeNull();
  });
  it('counts the superset time so far for the sets logged before a break', () => {
    // 4 of 4... a superset of 4 rounds (8 sets) broken after 2 rounds: 4 sets logged, 5:00 on its clock
    expect(efficiency([{ budget: 700, planned: 8, done: 4, actual: 300 }])).toBe(Math.round(((700 * 4) / 8 / 300) * 100));
  });
});

describe('records', () => {
  const prior6 = [set(60, 6, '2026-11-01')];
  it('a tie is not a record, and the record moves to the newer set', () => {
    const tie = set(60, 8, '2026-11-17');
    expect(recordsEarned(prior6, tie, lbKind)).not.toContain('6_plus');
    const rec = currentRecords([...prior6, tie], lbKind);
    expect(rec['6_plus']?.setId).toBe(tie.id);
    expect(rec['6_plus']?.day).toBe('2026-11-17');
  });
  it('65 for 8 is a 6+ record and the celebration names 6+', () => {
    const e = recordsEarned(prior6, set(65, 8, '2026-11-17'), lbKind);
    expect(e).toContain('6_plus');
    expect(celebrationName(e)).toBe('6_plus');
  });
  it('65 for 5 against a heaviest of 60 is a heaviest record, not 6+', () => {
    const prior = [set(60, 5, '2026-11-01'), set(55, 8, '2026-11-01')];
    const e = recordsEarned(prior, set(65, 5, '2026-11-17'), lbKind);
    expect(e).toEqual(['heaviest']);
  });
  it('awards nothing in the first-ever session', () => {
    const first = [set(50, 8, '2026-11-17')];
    expect(recordsEarned(first, set(70, 8, '2026-11-17'), lbKind)).toEqual([]);
    expect(recordsEarned([], set(70, 8, '2026-11-17'), lbKind)).toEqual([]);
  });
  it('a warm-up never earns or holds a record', () => {
    expect(recordsEarned(prior6, set(100, 8, '2026-11-17', 'warm_up'), lbKind)).toEqual([]);
    expect(currentRecords([set(100, 8, '2026-11-17', 'warm_up')], lbKind).heaviest).toBeUndefined();
  });
  it('assisted: 40 lb of assistance beats 50 for 8, 60 does not', () => {
    const kind: ExerciseKind = { unit: 'lb', assisted: true, loadCount: 1 };
    const prior = [set(50, 8, '2026-11-01')];
    expect(recordsEarned(prior, set(40, 8, '2026-11-17'), kind)).toContain('6_plus');
    expect(recordsEarned(prior, set(60, 8, '2026-11-17'), kind)).not.toContain('6_plus');
  });
  it('bodyweight: most reps in a set', () => {
    const kind: ExerciseKind = { unit: 'bw', assisted: false, loadCount: 1 };
    const prior = [set(null, 15, '2026-11-01')];
    expect(recordsEarned(prior, set(null, 18, '2026-11-17'), kind)).toEqual(['most_reps']);
    expect(recordsEarned(prior, set(null, 15, '2026-11-17'), kind)).toEqual([]);
  });
});

describe('volume', () => {
  it('dumbbell press 50 lb for 10 with load count 2 is 1,000 lb', () => {
    expect(setVolume(set(50, 10), { unit: 'lb', assisted: false, loadCount: 2 })).toBe(1000);
  });
  it('bodyweight and band sets count reps; warm-ups count nothing', () => {
    expect(setVolume(set(null, 20), { unit: 'bw', assisted: false, loadCount: 1 })).toBe(20);
    expect(setVolume(set(50, 10, '2026-11-17', 'warm_up'), lbKind)).toBe(0);
  });
  it('60 lb for 8, 8 and 7 is 1,380 lb; 20, 18, 15 reps is 53 BW', () => {
    const v = [8, 8, 7].map((r) => setVolume(set(60, r), lbKind)).reduce((a, b) => a + b, 0);
    expect(v).toBe(1380);
    const bw = [20, 18, 15].map((r) => setVolume(set(null, r), { unit: 'bw', assisted: false, loadCount: 1 })).reduce((a, b) => a + b, 0);
    expect(bw).toBe(53);
  });
  it('estimated one-rep max is weight x (1 + reps / 30)', () => {
    expect(estimatedOneRepMax([set(60, 15)], lbKind)).toBeCloseTo(90);
    expect(estimatedOneRepMax([set(60, 15)], { unit: 'lb', assisted: true, loadCount: 1 })).toBeNull();
  });
});

describe('seeded weight', () => {
  it('last time 80 then 90: set 1 is 80, set 2 is 90, set 3 is 90', () => {
    expect(seedWeights([80, 90], 3)).toEqual([80, 90, 90]);
  });
  it('is empty the very first time', () => {
    expect(seedWeights([], 3)).toEqual([null, null, null]);
  });
  it('an assisted machine falls back to the least assistance', () => {
    expect(seedWeights([50, 40], 3, true)).toEqual([50, 40, 40]);
  });
});

describe('the warm-up switch', () => {
  const W: ('working')[] = ['working', 'working', 'working'];
  it('round 1 of a 3-round superset becomes a warm-up for both and adds a working round', () => {
    const next = toggleWarmup([W, W], [0, 0], 0)!;
    expect(next[0]).toEqual(['warm_up', 'working', 'working', 'working']);
    expect(next[1]).toEqual(['warm_up', 'working', 'working', 'working']);
  });
  it('switching back returns both to 3 rounds', () => {
    const on = toggleWarmup([W, W], [0, 0], 0)!;
    const off = toggleWarmup(on, [0, 0], 0)!;
    expect(off[0]).toEqual(W);
    expect(off[1]).toEqual(W);
  });
  it('does not remove the added set once it has been logged', () => {
    const on = toggleWarmup([W], [0], 0)!;
    const off = toggleWarmup(on, [4], 0)!;
    expect(off[0].length).toBe(4);
  });
  it('marking the first of 3 planned sets a warm-up leaves 3 working sets, 4 in all', () => {
    const next = toggleWarmup([W], [0], 0)![0];
    expect(next.length).toBe(4);
    expect(next.filter((t) => t === 'working').length).toBe(3);
  });
});
