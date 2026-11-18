import { describe, expect, it } from 'vitest';
import {
  addRest, blockBudget, blockOf, breakSuperset, efficiencyOf, finishSession, goTo, logSet, skipRest, skipBlock,
  startExercise, startSession, toggleSet, undoBreak, volumeOf, allDone, setsDone,
  type History, type PlanItem, type Session,
} from '@/rules/session';
import { readClock } from '@/rules/workout';

const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'Chest', equipment: 'cable', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 120, sets: 3, reps: 8, alternates: [], ...over,
});
const noSeed = (_id: string, sets: number) => Array.from({ length: sets }, () => null);
const T0 = 1_000_000;
const log = (s: Session, now: number, lb = 50, reps = 8, h: History = {}) =>
  logSet(s, { lb, enteredValue: lb, enteredUnit: 'lb', reps }, h, now).session;

function superset(): Session {
  const plan = [
    item('A1', { sets: 4, work: 45, rest: 120, superset: 'A' }),
    item('A2', { sets: 4, work: 40, rest: 90, superset: 'A' }),
    item('Solo', { sets: 3, work: 50, rest: 150 }),
  ];
  return startSession('Push', '2026-11-17', plan, {}, T0, noSeed);
}

describe('a superset in play', () => {
  it('logging the first member moves to the second with no rest; the second starts rest', () => {
    let s = startExercise(superset(), T0);
    const [a1, a2] = blockOf(s, s.curBlock).members;
    expect(s.curMember).toBe(a1);
    s = log(s, T0 + 1000);
    expect(s.curMember).toBe(a2);
    expect(s.restEndsAt).toBeNull();
    s = log(s, T0 + 2000);
    expect(s.curMember).toBe(a1);
    expect(s.restEndsAt).toBe(T0 + 2000 + 120_000); // the first member's rest
  });

  it('the superset budget is 11:40 and +0:15 and Skip work on rest', () => {
    let s = startExercise(superset(), T0);
    expect(blockBudget(s, blockOf(s, s.curBlock))).toBe(700);
    s = log(log(s, T0 + 1000), T0 + 2000);
    s = addRest(s, 15);
    expect(s.restEndsAt).toBe(T0 + 2000 + 135_000);
    s = skipRest(s);
    expect(s.restEndsAt).toBeNull();
  });

  it('a warm-up switch on round 1 makes 4 working rounds for both members, and back', () => {
    const plan = [item('A1', { sets: 3, superset: 'A' }), item('A2', { sets: 3, superset: 'A' })];
    let s = startSession('x', '2026-11-17', plan, {}, T0, noSeed);
    s = toggleSet(s, 0);
    for (const k of blockOf(s, s.curBlock).members) {
      expect(s.exercises[k].types).toEqual(['warm_up', 'working', 'working', 'working']);
    }
    s = toggleSet(s, 0);
    for (const k of blockOf(s, s.curBlock).members) expect(s.exercises[k].types.length).toBe(3);
  });
});

describe('breaking a superset', () => {
  it('before it starts: each exercise keeps 4 sets, budgets 9:00 and 7:10, rest after every set', () => {
    const s0 = superset();
    const id = s0.curBlock;
    const s = breakSuperset(s0, id, T0);
    const live = s.blocks.filter((b) => !b.closed);
    expect(live.map((b) => b.members.length)).toEqual([1, 1, 1]);
    expect([blockBudget(s, live[0]), blockBudget(s, live[1])]).toEqual([540, 430]);
    expect(live[0].letter).toBeNull();
    expect(s.exercises[live[0].members[0]].types.length).toBe(4);
    // rest follows every set, with that exercise's own rest
    const after = startExercise(s, T0);
    const logged = log(after, T0 + 1000);
    expect(logged.restEndsAt).toBe(T0 + 1000 + 120_000);
  });

  it('after 2 rounds: 4 logged sets stay, 2 left each, and the time so far counts toward efficiency', () => {
    let s = startExercise(superset(), T0);
    for (let i = 0; i < 4; i++) s = log(s, T0 + (i + 1) * 10_000);
    const brk = breakSuperset(s, s.curBlock, T0 + 300_000);
    const live = brk.blocks.filter((b) => !b.closed);
    for (const k of [live[0].members[0], live[1].members[0]]) expect(brk.exercises[k].logs.length).toBe(2);
    expect(blockBudget(brk, live[0])).toBe(2 * 45 + 120);
    expect(blockBudget(brk, live[1])).toBe(2 * 40 + 90);
    // old block: budget 700 x 4 of 8 sets / 300 s on its clock
    expect(efficiencyOf(brk, T0 + 300_000)).toBe(Math.round(((700 * 4) / 8 / 300) * 100));
  });

  it('can be undone until a set is logged afterwards', () => {
    const s0 = startExercise(superset(), T0);
    const id = s0.curBlock;
    const brk = breakSuperset(s0, id, T0 + 5000);
    const back = undoBreak(brk, T0 + 5000);
    expect(back.blocks.filter((b) => !b.closed).length).toBe(2);
    expect(blockOf(back, id).members.length).toBe(2);
    const next = log(startExercise(brk, T0 + 6000), T0 + 7000);
    expect(next.breakUndo).toBeNull();
  });
});

describe('clocks and efficiency in a session', () => {
  it('the exercise clock does not run before Start exercise', () => {
    const s = superset();
    expect(readClock(blockOf(s, s.curBlock).clock, T0 + 60_000)).toBe(0);
  });

  it('moving to another exercise pauses the first and coming back resumes it', () => {
    let s = startExercise(superset(), T0);
    const first = s.curBlock;
    const second = s.blocks[1].id;
    s = goTo(s, second, T0 + 10_000);
    expect(readClock(blockOf(s, first).clock, T0 + 90_000)).toBe(10);
    s = goTo(s, first, T0 + 100_000);
    expect(readClock(blockOf(s, first).clock, T0 + 105_000)).toBe(15);
  });

  it('moving between members of a superset does not pause it', () => {
    let s = startExercise(superset(), T0);
    const b = blockOf(s, s.curBlock);
    s = goTo(s, b.id, T0 + 10_000, b.members[1]);
    expect(s.curMember).toBe(b.members[1]);
    expect(readClock(blockOf(s, b.id).clock, T0 + 20_000)).toBe(20);
  });

  it('a single exercise: 7:30 budget, 2 of 3 sets at 6:00 is 83%', () => {
    let s = startSession('x', '2026-11-17', [item('Solo', { work: 50, rest: 150 })], {}, T0, noSeed);
    s = startExercise(s, T0);
    s = log(log(s, T0 + 100_000), T0 + 200_000);
    expect(efficiencyOf(s, T0 + 360_000)).toBe(83);
  });

  it('efficiency is n/a until an exercise has started', () => {
    expect(efficiencyOf(superset(), T0)).toBeNull();
  });
});

describe('finishing and counts', () => {
  it('skipping leaves a skipped exercise out of efficiency and the workout can finish', () => {
    let s = startSession('x', '2026-11-17', [item('A', { sets: 1 }), item('B', { sets: 1 })], {}, T0, noSeed);
    s = startExercise(s, T0);
    s = log(s, T0 + 1000);
    s = skipBlock(s, s.blocks[1].id, T0 + 2000);
    expect(allDone(s)).toBe(true);
    const done = finishSession(s, T0 + 3000);
    expect(done.endedAt).toBe(T0 + 3000);
    expect(setsDone(done)).toBe(1);
  });

  it('volume keeps bodyweight apart from pounds, and uses the load count', () => {
    let s = startSession('x', '2026-11-17', [item('DB', { sets: 1, loadCount: 2 }), item('Push-up', { sets: 1, unit: 'bw' })], {}, T0, noSeed);
    s = startExercise(s, T0);
    s = log(s, T0 + 1000, 50, 10);
    s = goTo(s, s.blocks[1].id, T0 + 2000);
    s = startExercise(s, T0 + 2000);
    s = logSet(s, { lb: null, enteredValue: 1, enteredUnit: 'bw', reps: 20 }, {}, T0 + 3000).session;
    expect(volumeOf(s)).toEqual({ lb: 1000, bw: 20 });
  });
});
