import { describe, expect, it } from 'vitest';
import {
  allDone, blockBudget, blockOf, blockOfKey, breakSuperset, deleteSet, efficiencyOf, liveBlocks, logSet, setsDone, setsPlanned,
  startExercise, startSession, swapBlocked, swapExercise, toggleSet, toHistory, undoBreak, type PlanItem, type Session,
} from '@/rules/session';
import { sessionFromRows, sessionRows, setRow, type LibraryFacts } from '@/rules/sync';

// A swap part-way through an exercise (spec Sections 2 and 10): the sets
// already logged stay with the exercise they were done on, and only the sets
// left are done as the new one. A superset stays paired and equal.
const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'Chest', equipment: 'barbell', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 120, sets: 4, reps: 8, alternates: [], ...over,
});
const noSeed = (_id: string, sets: number) => Array.from({ length: sets }, () => null);
const T0 = 1_000_000;
const log = (s: Session, now: number, lb = 100) => logSet(s, { lb, enteredValue: lb, enteredUnit: 'lb', reps: 8 }, {}, now).session;
const pushUp = item('Push-Up', { unit: 'bw', equipment: 'bodyweight', work: 30, rest: 60 });

describe('a swap before any set is logged', () => {
  it('replaces the exercise in place and keeps its sets', () => {
    const s0 = startSession('x', '2026-11-19', [item('Bench')], {}, T0, noSeed);
    const k = s0.curMember;
    const s = swapExercise(s0, k, pushUp, noSeed, T0);
    expect(s.exercises[k].exerciseId).toBe('Push-Up');
    expect(s.exercises[k].types.length).toBe(4);
    expect(s.exercises[k].swappedFrom).toBe('Bench');
    expect(s.blocks.length).toBe(1);
  });
});

describe('a swap part-way through one exercise', () => {
  const twoDone = () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Bench'), item('Row')], {}, T0, noSeed), T0);
    s = log(s, T0 + 60_000);
    s = log(s, T0 + 240_000);
    return s;
  };

  it('keeps the logged sets on the original, which ends with them, and puts the sets left on the new one right after it', () => {
    const s0 = twoDone();
    const k = s0.curMember;
    const s = swapExercise(s0, k, pushUp, noSeed, T0 + 300_000);
    const bench = s.exercises[k];
    expect(bench.exerciseId).toBe('Bench');
    expect(bench.logs.length).toBe(2);
    expect(bench.types.length).toBe(2);
    const live = liveBlocks(s);
    expect(live.map((b) => s.exercises[b.members[0]].name)).toEqual(['Bench', 'Push-Up', 'Row']);
    const pu = s.exercises[live[1].members[0]];
    expect(pu.types.length).toBe(2);
    expect(pu.logs.length).toBe(0);
    expect(pu.origin).toBe('swap');
    expect(pu.swappedFrom).toBe('Bench');
    // The screen moves to the new exercise, which waits for Start exercise.
    expect(s.curMember).toBe(pu.key);
    expect(blockOf(s, s.curBlock).started).toBe(false);
    // The original stops; its budget is now for the two sets it kept.
    expect(blockOf(s, live[0].id).stopped).toBe(true);
    expect(blockBudget(s, live[0])).toBe(2 * 45 + 1 * 120);
    // Sets done and planned still add up.
    expect(setsDone(s)).toBe(2);
    expect(setsPlanned(s)).toBe(2 + 2 + 4);
  });

  it('the new exercise logs as itself, so each keeps its own history', () => {
    const d = twoDone();
    let s = swapExercise(d, d.curMember, pushUp, noSeed, T0 + 300_000);
    s = startExercise(s, T0 + 310_000);
    s = logSet(s, { lb: null, enteredValue: 1, enteredUnit: 'bw', reps: 15 }, {}, T0 + 330_000).session;
    const h = toHistory(s, {});
    expect(h.Bench[0].sets.length).toBe(2);
    expect(h['Push-Up'][0].sets).toEqual([{ lb: null, reps: 15, type: 'working' }]);
  });

  it('cannot swap an exercise that is done or skipped', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('Bench', { sets: 1 }), item('Row')], {}, T0, noSeed), T0);
    const k = s.curMember;
    s = log(s, T0 + 1000);
    expect(swapBlocked(s, k)).toBe('done');
    expect(swapExercise(s, k, pushUp, noSeed, T0)).toBe(s);
  });

  it('efficiency counts the time on each part against its own budget', () => {
    const d = twoDone();
    let s = swapExercise(d, d.curMember, item('Dumbbell Press'), noSeed, T0 + 300_000);
    s = startExercise(s, T0 + 300_000);
    s = log(s, T0 + 360_000);
    s = log(s, T0 + 540_000);
    expect(efficiencyOf(s, T0 + 540_000)).not.toBeNull();
    expect(allDone(s)).toBe(false); // Row is still to do
  });

  it('ends Undo break, so a break cannot bring back what the swap replaced', () => {
    let s = startExercise(startSession('x', '2026-11-19', [item('A1', { superset: 'A' }), item('A2', { superset: 'A' })], {}, T0, noSeed), T0);
    s = log(log(s, T0 + 1000), T0 + 2000);
    s = breakSuperset(s, s.curBlock, T0 + 3000);
    expect(s.breakUndo).not.toBeNull();
    s = swapExercise(s, s.curMember, pushUp, noSeed, T0 + 4000);
    expect(s.breakUndo).toBeNull();
    expect(undoBreak(s, T0 + 5000).blocks.length).toBe(s.blocks.length);
    // The broken-out A1 ends with its one set; Push-Up takes its three left.
    const pu = Object.values(s.exercises).find((e) => e.name === 'Push-Up')!;
    expect(pu.types.length).toBe(3);
  });
});

describe('a swap part-way through a superset', () => {
  const ss = () => startExercise(startSession('x', '2026-11-19', [
    item('A1', { sets: 3, superset: 'A' }), item('A2', { sets: 3, work: 40, superset: 'A' }), item('Solo'),
  ], {}, T0, noSeed), T0);
  const oneRound = () => log(log(ss(), T0 + 60_000), T0 + 120_000);
  const keyOf = (s: Session, name: string) => Object.values(s.exercises).find((e) => e.name === name)!.key;

  it('waits for the end of a round', () => {
    const s = log(ss(), T0 + 60_000); // A1 done in round 1, A2 not yet
    expect(swapBlocked(s, keyOf(s, 'A1'))).toBe('mid_round');
    const r = oneRound();
    expect(swapBlocked(r, keyOf(r, 'A1'))).toBeNull();
  });

  it('the new exercise takes the member\'s place for the rounds left, and the superset stays paired', () => {
    const s0 = oneRound();
    const a1 = keyOf(s0, 'A1');
    const s = swapExercise(s0, a1, item('C', { work: 35 }), noSeed, T0 + 200_000);
    const live = liveBlocks(s);
    // A1 stays in the workout, done with its one set; the superset carries on as C and A2.
    expect(live.map((b) => b.members.map((k) => s.exercises[k].name))).toEqual([['A1'], ['C', 'A2'], ['Solo']]);
    const sup = live[1];
    expect(sup.letter).toBe('A');
    expect(s.exercises[a1].types.length).toBe(1);
    const c = s.exercises[sup.members[0]];
    expect(c.types.length).toBe(2);
    // Budget for the two rounds left: 2 × (35 + 40) + 1 rest.
    expect(blockBudget(s, sup)).toBe(2 * 75 + 120);
    // Logging alternates between C and A2, with rest after the round.
    let t = startExercise(s, T0 + 300_000);
    expect(t.curMember).toBe(c.key);
    t = log(t, T0 + 330_000);
    expect(t.curMember).toBe(keyOf(t, 'A2'));
    t = log(t, T0 + 360_000);
    expect(t.restEndsAt).toBe(T0 + 360_000 + 120_000);
    expect(t.curMember).toBe(c.key);
  });

  it('a warm-up switch and Delete still act on the whole round', () => {
    const s0 = oneRound();
    let s = swapExercise(s0, keyOf(s0, 'A1'), item('C'), noSeed, T0 + 200_000);
    const sup = liveBlocks(s)[1];
    const c = sup.members[0];
    const a2 = keyOf(s, 'A2');
    // C's first set is round 2, which is A2's second set.
    s = toggleSet(s, 0);
    expect(s.exercises[c].types).toEqual(['warm_up', 'working', 'working']);
    expect(s.exercises[a2].types).toEqual(['working', 'warm_up', 'working', 'working']);
    s = deleteSet(s, c, 0, {}, T0 + 300_000);
    expect(s.exercises[c].types.length).toBe(2);
    expect(s.exercises[a2].types.length).toBe(3);
    expect(s.exercises[a2].logs.length).toBe(1); // A2's round-1 set, from before the swap, stays
  });

  it('can still be broken apart afterwards', () => {
    const s0 = oneRound();
    let s = swapExercise(s0, keyOf(s0, 'A1'), item('C'), noSeed, T0 + 200_000);
    s = breakSuperset(s, liveBlocks(s)[1].id, T0 + 210_000);
    const names = liveBlocks(s).map((b) => b.members.map((k) => s.exercises[k].name).join('+'));
    expect(names).toEqual(['A1', 'C', 'A2', 'Solo']);
    const a2 = blockOfKey(s, keyOf(s, 'A2'));
    expect(blockBudget(s, a2)).toBe(2 * 40 + 1 * 120);
  });
});

describe('a part-way swap saved to the account and opened again', () => {
  it('comes back the same from the rows', () => {
    let s = startExercise(startSession('x', '2026-11-19', [
      item('A1', { sets: 3, superset: 'A' }), item('A2', { sets: 3, superset: 'A' }),
    ], {}, T0, noSeed), T0);
    s = log(log(s, T0 + 1000), T0 + 2000);
    const a1 = Object.values(s.exercises).find((e) => e.name === 'A1')!.key;
    s = swapExercise(s, a1, item('C'), noSeed, T0 + 3000);
    const rows = sessionRows(s);
    const sets = Object.values(s.exercises).flatMap((e) => e.logs.map((_, i) => setRow(e, i)));
    const lib = (id: string): LibraryFacts => ({ name: id, muscle: 'Chest', equipment: 'barbell', unit: 'lb', assisted: false, loadCount: 1, alternates: [] });
    const back = sessionFromRows(rows.session, rows.blocks, rows.exercises, sets, lib);
    const live = liveBlocks(back);
    expect(live.map((b) => b.members.map((k) => back.exercises[k].exerciseId))).toEqual([['A1'], ['C', 'A2']]);
    const sup = live[1];
    expect(sup.bases).toEqual({ [sup.members[0]]: 0, [sup.members[1]]: 1 });
    let t = startExercise(back, T0 + 4000);
    t = log(t, T0 + 5000);
    expect(t.curMember).toBe(sup.members[1]); // the superset still alternates
  });
});
