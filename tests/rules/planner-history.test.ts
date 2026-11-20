// History's session summaries (spec Section 5 and 8): what a finished session shows.
import { describe, expect, it } from 'vitest';
import { summarizeSession, volumeText, type HBlock, type HExercise, type HSet } from '@/rules/planner';

const kind = (id: string) => (id === 'pushup' ? { unit: 'bw', assisted: false, loadCount: 1 } as const : id === 'db' ? { unit: 'lb', assisted: false, loadCount: 2 } as const : { unit: 'lb', assisted: false, loadCount: 1 } as const);
const block = (p: Partial<HBlock> = {}): HBlock => ({ id: 'b1', broken_at: null, time_budget_seconds: 450, clock_started_at: '2026-11-18T10:00:00Z', clock_banked_seconds: 360, sets_done_at_break: null, sets_planned_at_break: null, ...p });
const ex = (p: Partial<HExercise> = {}): HExercise => ({ id: 'x1', block_id: 'b1', exercise_id: 'bench', state: 'done', planned: 3, sets_before_break: null, ...p });
const set = (id: string, lb: number | null, reps: number, p: Partial<HSet> = {}): HSet => ({ id, session_exercise_id: 'x1', lb, reps, type: 'working', records: [], ...p });

describe('a finished session\'s summary', () => {
  it('60 lb for 8, 8 and 7 is 1,380 lb of volume over 3 sets', () => {
    const s = summarizeSession({ clockBanked: 900, blocks: [block()], exercises: [ex()], sets: [set('a', 60, 8), set('b', 60, 8), set('c', 60, 7)], kind });
    expect(s).toMatchObject({ elapsed: 900, volumeLb: 1380, volumeBw: 0, sets: 3 });
  });
  it('a bodyweight session of 20, 18 and 15 reps is 53 BW, kept apart from pounds', () => {
    const s = summarizeSession({ clockBanked: 0, blocks: [block()], exercises: [ex({ exercise_id: 'pushup' })], sets: [set('a', null, 20), set('b', null, 18), set('c', null, 15)], kind });
    expect(s.volumeBw).toBe(53);
    expect(s.volumeLb).toBe(0);
    expect(volumeText(s.volumeLb, s.volumeBw, 'lb')).toBe('53 BW');
  });
  it('a pair of dumbbells counts twice, and a warm-up counts for nothing', () => {
    const s = summarizeSession({ clockBanked: 0, blocks: [block()], exercises: [ex({ exercise_id: 'db' })], sets: [set('a', 50, 10), set('w', 20, 10, { type: 'warm_up' })], kind });
    expect(s.volumeLb).toBe(1000);
  });
  it('counts sets that hold a record', () => {
    const s = summarizeSession({ clockBanked: 0, blocks: [block()], exercises: [ex()], sets: [set('a', 60, 8, { records: ['heaviest', '6_plus'] }), set('b', 50, 8)], kind });
    expect(s.records).toBe(1);
  });
  it('efficiency: a 7:30 budget, 3 sets planned, 2 done at 6:00 on the clock is 83%', () => {
    const s = summarizeSession({ clockBanked: 0, blocks: [block()], exercises: [ex()], sets: [set('a', 60, 8), set('b', 60, 8)], kind });
    expect(s.efficiency).toBe(83);
  });
  it('efficiency is n/a when no exercise was started, and leaves out a skipped exercise', () => {
    expect(summarizeSession({ clockBanked: 0, blocks: [block({ clock_started_at: null })], exercises: [ex({ state: 'skipped' })], sets: [], kind }).efficiency).toBeNull();
    const s = summarizeSession({
      clockBanked: 0,
      blocks: [block(), block({ id: 'b2', time_budget_seconds: 600, clock_banked_seconds: 100 })],
      exercises: [ex(), ex({ id: 'x2', block_id: 'b2', state: 'skipped' })],
      sets: [set('a', 60, 8), set('b', 60, 8), set('c', 60, 8)], kind,
    });
    expect(s.efficiency).toBe(125); // 450 s allocated for 3 of 3 sets, over 360 s
  });
  it('a skipped exercise that did some sets keeps those sets', () => {
    const s = summarizeSession({ clockBanked: 0, blocks: [block({ clock_banked_seconds: 100 })], exercises: [ex({ state: 'skipped' })], sets: [set('a', 60, 8)], kind });
    expect(s.efficiency).toBe(450); // planned counts only the 1 set done, so all 450 s are allocated over 100 s
  });
  it('a broken superset counts the sets logged before the break', () => {
    const s = summarizeSession({
      clockBanked: 0,
      blocks: [block({ broken_at: '2026-11-18T10:05:00Z', time_budget_seconds: 600, clock_banked_seconds: 300, sets_done_at_break: 4, sets_planned_at_break: 8 })],
      exercises: [ex()], sets: [set('a', 60, 8)], kind,
    });
    expect(s.efficiency).toBe(100); // 600 x 4/8 = 300 s allocated over 300 s
  });
  it('shows volume in kilograms in the kilogram view', () => {
    expect(volumeText(1380, 0, 'kg')).toBe('626 kg');
    expect(volumeText(1380, 0, 'lb')).toBe('1,380 lb');
    expect(volumeText(8450, 60, 'lb')).toBe('8,450 lb · 60 BW');
  });
});
