// Fixes carried into Phase 3 from the fresh check after the Phase 2 review (20 November 2026), one group each.
import { describe, expect, it } from 'vitest';
import {
  addSetToBlock, blockBudget, blockOf, breakSuperset, deleteSet, efficiencyOf, goTo, liveBlocks, logSet, setDetails,
  startExercise, startSession, toggleSet, undoBreak, type History, type PlanItem, type Session,
} from '@/rules/session';
import { sessionChanges } from '@/rules/sync';
import { readClock } from '@/rules/workout';

const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'm', equipment: 'e', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 90, sets: 3, reps: 8, alternates: [], ...over,
});
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const T = 1_000_000;
const log = (s: Session, now: number, lb = 50, history: History = {}) =>
  logSet(s, { lb, enteredValue: lb, enteredUnit: 'lb', reps: 8 }, history, now).session;
const superset = () => startSession('x', 'd', [item('A', { superset: 'S' }), item('B', { superset: 'S' })], {}, T, noSeed);
const keyOf = (s: Session, name: string) => Object.values(s.exercises).find((e) => e.name === name)!.key;
const types = (s: Session, name: string) => s.exercises[keyOf(s, name)].types;

describe('1. Undo break gives the superset back even', () => {
  it('after a warm-up switch on one exercise: both have 3 sets, and the budget is the 3-round one', () => {
    const s0 = superset();
    const S = s0.curBlock;
    const budgetBefore = blockBudget(s0, blockOf(s0, S));
    let s = breakSuperset(s0, S, T);
    s = toggleSet(s, 0, {}, T); // A's set 1 to warm-up: A now has 4
    expect(types(s, 'A').length).toBe(4);
    s = undoBreak(s, T + 1000, {});
    expect(types(s, 'A')).toEqual(['working', 'working', 'working']);
    expect(types(s, 'B')).toEqual(['working', 'working', 'working']);
    expect(blockBudget(s, blockOf(s, S))).toBe(budgetBefore);
  });

  it('after + Set on one exercise', () => {
    const s0 = superset();
    let s = breakSuperset(s0, s0.curBlock, T);
    s = addSetToBlock(s, s.curBlock, T);
    s = undoBreak(s, T + 1000);
    expect(types(s, 'A').length).toBe(3);
    expect(types(s, 'B').length).toBe(3);
  });

  it('then Warm-up on B\'s set 1 switches the round for both, and removes nothing from A', () => {
    const s0 = superset();
    let s = breakSuperset(s0, s0.curBlock, T);
    s = toggleSet(s, 0, {}, T);
    s = undoBreak(s, T + 1000, {});
    s = setDetails(s, keyOf(s, 'B'), 0, 'warm_up', null, {}, T + 2000);
    expect(types(s, 'A')).toEqual(['warm_up', 'working', 'working', 'working']);
    expect(types(s, 'B')).toEqual(['warm_up', 'working', 'working', 'working']);
  });

  it('after a round logged before the break, a logged set switched to warm-up goes back to working', () => {
    let s = startExercise(superset(), T);
    s = log(s, T + 60_000);
    s = log(s, T + 120_000);
    const S = s.curBlock;
    s = breakSuperset(s, S, T + 200_000);
    s = setDetails(s, keyOf(s, 'A'), 0, 'warm_up', null, {}, T + 210_000);
    s = undoBreak(s, T + 220_000, {});
    expect(types(s, 'A')).toEqual(['working', 'working', 'working']);
    expect(s.exercises[keyOf(s, 'A')].logs[0].type).toBe('working');
    expect(types(s, 'B')).toEqual(['working', 'working', 'working']);
  });

  it('Delete on a logged set of a broken-out exercise ends Undo break, as logging one does', () => {
    let s = startExercise(superset(), T);
    s = log(s, T + 60_000);
    s = log(s, T + 120_000);
    s = breakSuperset(s, s.curBlock, T + 200_000);
    expect(s.breakUndo).not.toBeNull();
    s = deleteSet(s, keyOf(s, 'A'), 0, {}, T + 210_000);
    expect(s.breakUndo).toBeNull();
  });

  it('the superset as put back carries no copy of the old set lists, and the change saves', () => {
    const s0 = superset();
    const broken = breakSuperset(s0, s0.curBlock, T);
    const warmed = toggleSet(broken, 0, {}, T);
    const back = undoBreak(warmed, T + 1000);
    expect(back.blocks.every((b) => b.setsAtBreak === undefined)).toBe(true);
    expect(sessionChanges(warmed, back).some((c) => c.kind === 'session.put')).toBe(true);
  });
});

describe('2. a finished exercise opens again after a warm-up switch', () => {
  it('its clock runs on, and efficiency counts the time spent on the added set', () => {
    let s = startExercise(startSession('x', 'd', [item('A', { sets: 2 }), item('C')], {}, T, noSeed), T);
    s = log(s, T + 60_000);
    s = log(s, T + 200_000); // A is done; its clock stops at 200 s
    const A = s.curBlock;
    expect(blockOf(s, A).stopped).toBe(true);
    s = toggleSet(s, 0, {}, T + 210_000); // set 1 becomes a warm-up: one working set to do
    expect(blockOf(s, A).stopped).toBe(false);
    expect(readClock(blockOf(s, A).clock, T + 270_000)).toBe(260); // 200 s, then 60 s more
    s = log(s, T + 270_000);
    expect(blockOf(s, A).stopped).toBe(true);
    expect(readClock(blockOf(s, A).clock, T + 400_000)).toBe(260);
    // 2 working sets done of 2 working (plus the warm-up), against 260 s on the clock.
    const budget = 3 * 45 + 2 * 90;
    expect(efficiencyOf(s, T + 400_000)).toBe(Math.round((budget / 260) * 100));
  });

  it('switching it back stops the clock again', () => {
    let s = startExercise(startSession('x', 'd', [item('A', { sets: 2 })], {}, T, noSeed), T);
    s = log(s, T + 60_000);
    s = log(s, T + 200_000);
    s = toggleSet(s, 0, {}, T + 210_000);
    s = toggleSet(s, 0, {}, T + 230_000);
    const b = blockOf(s, s.curBlock);
    expect(b.stopped).toBe(true);
    expect(readClock(b.clock, T + 500_000)).toBe(220);
  });

  it('from the set details sheet, an exercise not on screen opens again without its clock running', () => {
    let s = startExercise(startSession('x', 'd', [item('A', { sets: 2 }), item('C')], {}, T, noSeed), T);
    s = log(s, T + 60_000);
    s = log(s, T + 200_000);
    const A = s.curBlock;
    const aKey = s.curMember;
    s = goTo(s, liveBlocks(s)[1].id, T + 205_000);
    s = setDetails(s, aKey, 0, 'warm_up', null, {}, T + 210_000);
    expect(blockOf(s, A).stopped).toBe(false);
    expect(readClock(blockOf(s, A).clock, T + 300_000)).toBe(200);
  });
});

describe('3. a record badge never stays on a warm-up', () => {
  // Last time: 40 lb for 8, so 50 lb for 8 today is a record.
  const history: History = { A: [{ day: 'last', sets: [{ lb: 40, reps: 8, type: 'working' }] }], B: [{ day: 'last', sets: [{ lb: 40, reps: 8, type: 'working' }] }] };
  const twoRecords = () => {
    const s0 = startSession('x', 'd', [item('A', { superset: 'S' }), item('B', { superset: 'S' })], history, T, noSeed);
    let s = startExercise(s0, T);
    s = log(s, T + 60_000, 50, history);
    s = log(s, T + 120_000, 50, history);
    return s;
  };
  const badges = (s: Session, name: string) => s.exercises[keyOf(s, name)].logs[0].records;

  it('with a tap, in a superset, both members lose the badge', () => {
    const s = twoRecords();
    expect(badges(s, 'A').length).toBeGreaterThan(0);
    expect(badges(s, 'B').length).toBeGreaterThan(0);
    const t = toggleSet(s, 0, history, T + 130_000);
    expect(badges(t, 'A')).toEqual([]);
    expect(badges(t, 'B')).toEqual([]);
    // And back to working, both are records again.
    const back = toggleSet(t, 0, history, T + 140_000);
    expect(badges(back, 'A').length).toBeGreaterThan(0);
    expect(badges(back, 'B').length).toBeGreaterThan(0);
  });

  it('from the set details sheet, the partner loses it too', () => {
    const s = twoRecords();
    const t = setDetails(s, keyOf(s, 'A'), 0, 'warm_up', null, history, T + 130_000);
    expect(badges(t, 'A')).toEqual([]);
    expect(badges(t, 'B')).toEqual([]);
  });

  it('even without the past sessions to hand, a warm-up drops its badge', () => {
    const t = toggleSet(twoRecords(), 0);
    expect(badges(t, 'A')).toEqual([]);
    expect(badges(t, 'B')).toEqual([]);
  });
});
