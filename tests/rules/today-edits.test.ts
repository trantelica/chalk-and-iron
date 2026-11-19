import { describe, expect, it } from 'vitest';
import {
  addSetToBlock, blockBudget, blockOf, breakSuperset, canRemoveSet, goTo, isPaused, logSet, pauseSession, removeSetFromBlock,
  resumeSession, setBlockRest, startExercise, startSession, type PlanItem, type Session,
} from '@/rules/session';
import { readClock } from '@/rules/workout';

// Nathan, 19 Nov: Add set, sets and rest in the tray, and Pause. All of it
// changes today's session only.
const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'Chest', equipment: 'cable', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 120, sets: 3, reps: 8, alternates: [], ...over,
});
const noSeed = (_id: string, sets: number) => Array.from({ length: sets }, () => null);
const T0 = 1_000_000;
const log = (s: Session, now: number) => logSet(s, { lb: 50, enteredValue: 50, enteredUnit: 'lb', reps: 8 }, {}, now).session;
const superset = () => startSession('x', '2026-11-19', [item('A1', { sets: 3, superset: 'A' }), item('A2', { sets: 3, work: 40, superset: 'A' }), item('Solo')], {}, T0, noSeed);

describe('adding and removing sets for today', () => {
  it('Add set gives a single exercise one more set and grows its budget by one set and one rest', () => {
    const s0 = startSession('x', '2026-11-19', [item('Solo', { work: 50, rest: 150 })], {}, T0, noSeed);
    const b = s0.curBlock;
    const s = addSetToBlock(s0, b, T0);
    expect(s.exercises[blockOf(s, b).members[0]].types.length).toBe(4);
    expect(blockBudget(s, blockOf(s, b))).toBe(450 + 50 + 150);
  });

  it('in a superset it adds a round to every member, so they stay equal', () => {
    const s0 = superset();
    const s = addSetToBlock(s0, s0.curBlock, T0);
    const lens = blockOf(s, s0.curBlock).members.map((k) => s.exercises[k].types.length);
    expect(lens).toEqual([4, 4]);
  });

  it('a finished exercise opens again when a set is added, and its clock carries on', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Solo', { sets: 1 })], {}, T0, noSeed), T0);
    s = log(s, T0 + 10_000);
    const b = s.curBlock;
    expect(blockOf(s, b).stopped).toBe(true);
    s = addSetToBlock(s, b, T0 + 20_000);
    expect(blockOf(s, b).stopped).toBe(false);
    expect(readClock(blockOf(s, b).clock, T0 + 30_000)).toBe(20);
  });

  it('Remove set never goes below one set or below what is logged', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Solo', { sets: 2 })], {}, T0, noSeed), T0);
    s = log(s, T0 + 1000);
    const b = s.curBlock;
    s = removeSetFromBlock(s, b, T0 + 2000);
    expect(s.exercises[blockOf(s, b).members[0]].types.length).toBe(1);
    expect(blockOf(s, b).stopped).toBe(true); // that was the last set left, so the exercise is done
    expect(canRemoveSet(s, blockOf(s, b))).toBe(false);
    expect(removeSetFromBlock(s, b, T0 + 3000)).toBe(s);
  });

  it('works on an exercise made by breaking a superset, by the one-exercise budget', () => {
    const s0 = superset();
    const brk = breakSuperset(s0, s0.curBlock, T0);
    const nb = brk.blocks.find((b) => !b.closed && b.brokenFrom)!;
    const s = addSetToBlock(brk, nb.id, T0);
    expect(blockBudget(s, blockOf(s, nb.id))).toBe(4 * 45 + 3 * 120);
  });
});

describe('rest for today', () => {
  it('changes the rest after each set and the budget, for every member of a superset', () => {
    const s0 = superset();
    const s = setBlockRest(s0, s0.curBlock, 60, T0);
    expect(blockOf(s, s0.curBlock).members.map((k) => s.exercises[k].rest)).toEqual([60, 60]);
    expect(blockBudget(s, blockOf(s, s0.curBlock))).toBe(3 * 85 + 2 * 60);
    expect(setBlockRest(s0, s0.curBlock, 900, T0).exercises[blockOf(s0, s0.curBlock).members[0]].rest).toBe(600);
  });

  it('the next rest uses the new value', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Solo')], {}, T0, noSeed), T0);
    s = setBlockRest(s, s.curBlock, 45, T0);
    s = log(s, T0 + 1000);
    expect(s.restEndsAt).toBe(T0 + 1000 + 45_000);
  });
});

describe('pause', () => {
  it('stops the workout and exercise clocks and ends rest; resume carries on without counting the pause', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Solo')], {}, T0, noSeed), T0);
    s = log(s, T0 + 10_000);
    expect(s.restEndsAt).not.toBeNull();
    s = pauseSession(s, T0 + 20_000);
    expect(isPaused(s)).toBe(true);
    expect(s.restEndsAt).toBeNull();
    expect(readClock(s.clock, T0 + 999_000)).toBe(20);
    expect(readClock(blockOf(s, s.curBlock).clock, T0 + 999_000)).toBe(20);
    s = resumeSession(s, T0 + 1_000_000);
    expect(readClock(s.clock, T0 + 1_005_000)).toBe(25);
    expect(readClock(blockOf(s, s.curBlock).clock, T0 + 1_005_000)).toBe(25);
  });

  it('moving between exercises while paused starts no clock', () => {
    let s = startExercise(superset(), T0);
    const first = s.curBlock;
    s = goTo(s, s.blocks[1].id, T0 + 5000);
    s = startExercise(s, T0 + 5000);
    s = pauseSession(s, T0 + 10_000);
    s = goTo(s, first, T0 + 20_000);
    expect(blockOf(s, first).clock.since).toBeNull();
  });
});
