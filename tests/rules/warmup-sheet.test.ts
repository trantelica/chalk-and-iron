// The set details sheet's Warm-up must do exactly what tapping the set does (Nathan, 20 November 2026).
import { describe, expect, it } from 'vitest';
import { MAX_SETS, blockBudget, blockOf, breakSuperset, setDetails, startSession, toggleSet, type PlanItem, type Session } from '@/rules/session';

const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'm', equipment: 'e', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 90, sets: 3, reps: 8, alternates: [], ...over,
});
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const T = 1_000_000;
const superset = () => startSession('x', 'd', [item('A', { superset: 'S' }), item('B', { superset: 'S' })], {}, T, noSeed);
const budget = (s: Session) => blockBudget(s, blockOf(s, s.curBlock));
const types = (s: Session, k: string) => s.exercises[k].types;

describe('details sheet: Warm-up equals the tap', () => {
  it('on a single exercise adds a working set and grows the budget, like the tap', () => {
    const s = startSession('x', 'd', [item('A', { rest: 120 })], {}, T, noSeed);
    const sheet = setDetails(s, s.curMember, 0, 'warm_up', null);
    expect(sheet).toEqual(toggleSet(s, 0));
    expect(types(sheet, s.curMember)).toEqual(['warm_up', 'working', 'working', 'working']);
    expect(budget(sheet)).toBe(budget(s) + 45 + 120);
  });

  it('in a 3-round superset, switches the whole round and both members gain a set (7:30 to 10:30)', () => {
    const s = superset();
    expect(budget(s)).toBe(450);
    const sheet = setDetails(s, s.curMember, 0, 'warm_up', null);
    expect(sheet).toEqual(toggleSet(s, 0));
    for (const k of Object.keys(s.exercises)) expect(types(sheet, k)).toEqual(['warm_up', 'working', 'working', 'working']);
    expect(budget(sheet)).toBe(630);
  });

  it('after a break, follows the same rules as the tap', () => {
    const s0 = superset();
    const s = breakSuperset(s0, s0.curBlock, T);
    const sheet = setDetails(s, s.curMember, 1, 'warm_up', null);
    expect(sheet).toEqual(toggleSet(s, 1));
    expect(types(sheet, s.curMember).length).toBe(4);
    expect(budget(sheet)).toBe(budget(s) + 45 + 90);
  });

  it('stops at 24 sets: the set keeps its type', () => {
    const s = startSession('x', 'd', [item('A', { sets: MAX_SETS })], {}, T, noSeed);
    const sheet = setDetails(s, s.curMember, 0, 'warm_up', null);
    expect(types(sheet, s.curMember).length).toBe(MAX_SETS);
    expect(types(sheet, s.curMember)[0]).toBe('working');
  });

  it('Working on a warm-up takes the added set away again, in both members of a superset', () => {
    const s = superset();
    const warm = setDetails(s, s.curMember, 0, 'warm_up', null);
    const back = setDetails(warm, warm.curMember, 0, 'working', null);
    expect(back).toEqual(s);
    expect(budget(back)).toBe(450);
  });

  it('warm-up to Drop set undoes the warm-up first, then labels it', () => {
    const s = superset();
    const warm = setDetails(s, s.curMember, 0, 'warm_up', null);
    const drop = setDetails(warm, warm.curMember, 0, 'drop', null);
    expect(types(drop, drop.curMember)).toEqual(['drop', 'working', 'working']);
    const other = Object.keys(s.exercises).find((k) => k !== s.curMember)!;
    expect(types(drop, other)).toEqual(['working', 'working', 'working']);
    expect(budget(drop)).toBe(450);
  });

  it('Drop set and Working to Drop set only change the label, adding nothing', () => {
    const s = superset();
    const drop = setDetails(s, s.curMember, 1, 'drop', 8);
    expect(types(drop, drop.curMember)).toEqual(['working', 'drop', 'working']);
    expect(budget(drop)).toBe(450);
    const other = Object.keys(s.exercises).find((k) => k !== s.curMember)!;
    expect(types(drop, other)).toEqual(['working', 'working', 'working']);
  });
});
