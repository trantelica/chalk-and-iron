// Fixes from the Phase 2 review (20 November 2026), one test each.
import { describe, expect, it } from 'vitest';
import {
  MAX_SETS, addSetToBlock, autoFinishIfIdle, blockBudget, blockOf, breakSuperset, canAddSet, deleteSet, efficiencyOf, goTo,
  isPaused, liveBlocks, logSet, moveBlock, pauseSession, reopenSession, setsDone, setsPlanned, skipBlock, startExercise,
  startSession, swapExercise, toggleSet, undoBreak, addExercise, type PlanItem, type Session,
} from '@/rules/session';
import { exerciseState, sessionFromRows, sessionRows, setRow } from '@/rules/sync';
import { readClock } from '@/rules/workout';

const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'm', equipment: 'e', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 120, sets: 4, reps: 8, alternates: [], ...over,
});
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const T = 1_000_000;
const log = (s: Session, now: number) => logSet(s, { lb: 50, enteredValue: 50, enteredUnit: 'lb', reps: 8 }, {}, now).session;
const names = (s: Session) => liveBlocks(s).map((b) => b.members.map((k) => s.exercises[k].name).join('+'));
function roundTrip(s: Session): Session {
  const rows = sessionRows(s);
  const sets = Object.values(s.exercises).flatMap((e) => e.logs.map((_, i) => ({ ...setRow(e, i), record_types: e.logs[i].records })));
  const lib = (id: string) => {
    const e = Object.values(s.exercises).find((x) => x.exerciseId === id)!;
    return { name: e.name, muscle: e.muscle, equipment: e.equipment, unit: e.unit, assisted: e.assisted, loadCount: e.loadCount, alternates: e.alternates };
  };
  return sessionFromRows(rows.session, rows.blocks, rows.exercises, sets, lib);
}

describe('1. skipping an exercise part-way', () => {
  it('keeps the sets done in sets done and in efficiency; only the sets left are left out', () => {
    let s = startExercise(startSession('x', 'd', [item('A'), item('B')], {}, T, noSeed), T);
    s = log(s, T + 60_000);
    s = log(s, T + 240_000);
    const before = efficiencyOf(s, T + 300_000);
    s = skipBlock(s, s.curBlock, T + 300_000);
    expect(setsDone(s)).toBe(2);
    expect(setsPlanned(s)).toBe(2 + 4); // A keeps the 2 it did; B's 4
    expect(efficiencyOf(s, T + 300_000)).toBe(before);
    // The exercise shows as Skipped, with its sets kept.
    const a = Object.values(s.exercises).find((e) => e.name === 'A')!;
    expect(exerciseState(s, a)).toBe('skipped');
    expect(a.logs.length).toBe(2);
  });

  it('an exercise skipped with nothing done is still left out of efficiency', () => {
    let s = startExercise(startSession('x', 'd', [item('A'), item('B')], {}, T, noSeed), T);
    s = log(s, T + 60_000);
    s = goTo(s, s.blocks[1].id, T + 100_000);
    s = startExercise(s, T + 100_000);
    s = skipBlock(s, s.blocks[1].id, T + 400_000);
    // Only A counts: 1 of 4 sets, against the 100 s on its clock.
    expect(efficiencyOf(s, T + 400_000)).toBe(Math.round(((4 * 45 + 3 * 120) / 4 / 100) * 100));
  });
});

describe('2. Undo break', () => {
  it('leaves the time of a superset broken earlier alone', () => {
    let s = startSession('x', 'd', [item('A1', { superset: 'A' }), item('A2', { superset: 'A' }), item('B1', { superset: 'B' }), item('B2', { superset: 'B' })], {}, T, noSeed);
    s = startExercise(s, T);
    s = log(s, T + 60_000);
    s = log(s, T + 120_000);
    const A = s.curBlock;
    s = breakSuperset(s, A, T + 200_000);
    s = startExercise(s, T + 200_000);
    s = log(s, T + 500_000); // A's break now stays
    const aClock = readClock(blockOf(s, A).clock, T + 600_000);
    const B = liveBlocks(s).find((b) => b.letter === 'B')!.id;
    s = goTo(s, B, T + 600_000);
    s = breakSuperset(s, B, T + 600_000);
    s = undoBreak(s, T + 610_000);
    expect(readClock(blockOf(s, A).clock, T + 610_000)).toBe(aClock);
    expect(blockOf(s, B).closed).toBe(false);
  });

  it('gives the superset back its time, counting the time after the break once', () => {
    let s = startSession('x', 'd', [item('A1', { superset: 'A' }), item('A2', { superset: 'A' })], {}, T, noSeed);
    s = startExercise(s, T);
    const A = s.curBlock;
    s = breakSuperset(s, A, T + 100_000); // the superset ran 100 s
    s = startExercise(s, T + 110_000);
    s = undoBreak(s, T + 150_000); // the new block ran 40 s
    expect(readClock(blockOf(s, A).clock, T + 150_000)).toBe(140);
    expect(readClock(blockOf(s, A).clock, T + 160_000)).toBe(150); // and runs on
  });

  it('keeps an exercise added after the break, and what happened to other exercises since', () => {
    let s = startSession('x', 'd', [item('A1', { superset: 'A' }), item('A2', { superset: 'A' }), item('C')], {}, T, noSeed);
    const A = s.curBlock;
    s = breakSuperset(s, A, T);
    s = addExercise(s, item('D'), noSeed);
    const C = liveBlocks(s).find((b) => names(s).length && s.exercises[b.members[0]].name === 'C')!.id;
    s = goTo(s, C, T + 1000);
    s = startExercise(s, T + 1000);
    s = undoBreak(s, T + 61_000);
    expect(names(s)).toEqual(['A1+A2', 'C', 'D']);
    expect(blockOf(s, C).started).toBe(true);
    expect(readClock(blockOf(s, C).clock, T + 61_000)).toBe(60);
  });
});

describe('3. moving an exercise in the tray', () => {
  it('moves past the next exercise shown, even after a break', () => {
    let s = startSession('x', 'd', [item('P'), item('A1', { superset: 'A' }), item('A2', { superset: 'A' }), item('C')], {}, T, noSeed);
    s = breakSuperset(s, s.blocks[1].id, T);
    expect(names(s)).toEqual(['P', 'A1', 'A2', 'C']);
    const a1 = liveBlocks(s)[1].id;
    expect(names(moveBlock(s, a1, -1))).toEqual(['A1', 'P', 'A2', 'C']);
    expect(names(moveBlock(s, liveBlocks(s)[0].id, 1))).toEqual(['A1', 'P', 'A2', 'C']);
  });

  it('always keeps a hidden superset ahead of the blocks made from it, and survives the round trip', () => {
    let s = startSession('x', 'd', [item('X', { superset: 'A' }), item('Y', { superset: 'A' }), item('P')], {}, T, noSeed);
    s = startExercise(s, T);
    s = log(s, T + 1000); s = log(s, T + 2000);
    s = swapExercise(s, s.curMember, item('Z'), noSeed, T + 3000);
    s = startExercise(s, T + 4000);
    s = log(s, T + 5000); s = log(s, T + 6000);
    s = swapExercise(s, Object.values(s.exercises).find((e) => e.name === 'Y')!.key, item('W'), noSeed, T + 7000);
    const newest = liveBlocks(s).find((b) => b.members.some((k) => s.exercises[k].name === 'W'))!.id;
    for (let i = 0; i < 4; i++) s = moveBlock(s, newest, -1);
    expect(names(s)[0]).toBe('Z+W');
    s.blocks.forEach((b, i) => {
      if (b.brokenFrom) expect(s.blocks.findIndex((p) => p.id === b.brokenFrom)).toBeLessThan(i);
    });
    expect(names(roundTrip(s))).toEqual(names(s));
  });
});

describe('4. the budget follows the sets', () => {
  it('a warm-up switch after a break adds one set of work and rest', () => {
    let s = startSession('x', 'd', [item('A1', { superset: 'A' }), item('A2', { superset: 'A' })], {}, T, noSeed);
    s = breakSuperset(s, s.curBlock, T);
    const b0 = blockBudget(s, blockOf(s, s.curBlock));
    expect(b0).toBe(4 * 45 + 3 * 120);
    s = toggleSet(s, 0);
    expect(blockBudget(s, blockOf(s, s.curBlock))).toBe(b0 + 45 + 120);
  });

  it('after a part-way superset swap, the same on a phone that resumed the workout from the account', () => {
    let s = startSession('x', 'd', [item('X', { superset: 'A' }), item('Y', { superset: 'A' })], {}, T, noSeed);
    s = startExercise(s, T);
    for (let i = 0; i < 4; i++) s = log(s, T + (i + 1) * 60_000);
    s = swapExercise(s, s.curMember, item('Z'), noSeed, T + 400_000);
    const r = roundTrip(s);
    expect(blockBudget(r, blockOf(r, r.curBlock))).toBe(blockBudget(s, blockOf(s, s.curBlock)));
    const here = toggleSet(s, 0);
    const there = toggleSet(r, 0);
    expect(blockBudget(there, blockOf(there, there.curBlock))).toBe(blockBudget(here, blockOf(here, here.curBlock)));
    expect(blockBudget(here, blockOf(here, here.curBlock))).toBe(3 * 90 + 2 * 120);
  });
});

describe('5. reopening a workout that finished itself while paused', () => {
  it('is not paused, and its clock runs', () => {
    let s = startSession('x', 'd', [item('A')], {}, T, noSeed);
    s = pauseSession(s, T + 1000);
    s = autoFinishIfIdle(s, T + 3 * 3600_000);
    expect(s.endedAt).toBe(T + 1000);
    s = reopenSession(s, T + 3 * 3600_000 + 1000);
    expect(isPaused(s)).toBe(false);
    expect(s.clock.since).not.toBeNull();
    expect(roundTrip(s).pausedAt).toBeNull();
  });
});

describe('6. at most 24 sets an exercise', () => {
  it('+ Set and a warm-up switch stop at the 24 sets the account accepts', () => {
    let s = startSession('x', 'd', [item('A', { sets: 23 })], {}, T, noSeed);
    const b = s.curBlock;
    s = addSetToBlock(s, b, T);
    expect(s.exercises[s.curMember].types.length).toBe(MAX_SETS);
    expect(canAddSet(s, blockOf(s, b))).toBe(false);
    expect(addSetToBlock(s, b, T).exercises[s.curMember].types.length).toBe(MAX_SETS);
    expect(toggleSet(s, 0).exercises[s.curMember].types.length).toBe(MAX_SETS);
    expect(toggleSet(s, 0).exercises[s.curMember].types[0]).toBe('working');
  });
});

describe('7. Delete on a set from before a superset swap', () => {
  it('removes only that exercise\'s set, as the confirmation now says', () => {
    let s = startSession('x', 'd', [item('X', { superset: 'A' }), item('Y', { superset: 'A' })], {}, T, noSeed);
    s = startExercise(s, T);
    for (let i = 0; i < 4; i++) s = log(s, T + (i + 1) * 60_000);
    s = swapExercise(s, s.curMember, item('Z'), noSeed, T + 400_000);
    const y = Object.values(s.exercises).find((e) => e.name === 'Y')!;
    const z = Object.values(s.exercises).find((e) => e.name === 'Z')!;
    const out = deleteSet(s, y.key, 0, {}, T + 410_000);
    expect(out.exercises[y.key].logs.length).toBe(1);
    expect(out.exercises[z.key].types.length).toBe(2);
  });
});
