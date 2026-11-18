// The phone's side of saving and sending (design Sections 6 and 7): the rows a
// session becomes, the changes between two states, the outbox queue, and the
// crash-safe rules (auto-finish, reopen, close and reopen mid-session).
import { describe, expect, it } from 'vitest';
import {
  AUTO_FINISH_MS, REOPEN_MS, autoFinishIfIdle, blockOf, breakSuperset, canReopen, deleteSet, editSet, finishSession, goTo,
  lastLoggedSetUndo, liveBlocks, logSet, reopenSession, skipBlock, startExercise, startSession,
  type History, type PlanItem, type Session,
} from '@/rules/session';
import {
  applyServerRecords, enqueue, mergeHistory, noteChange, pendingChoices, sessionChanges, sessionFromRows, sessionRows, setRow,
  settle, unitChange, type Change,
} from '@/rules/sync';
import { readClock } from '@/rules/workout';

const item = (name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: name, name, muscle: 'm', equipment: 'e', unit: 'lb', assisted: false, loadCount: 1,
  work: 45, rest: 120, sets: 3, reps: 8, alternates: [], ...over,
});
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const T0 = Date.parse('2026-11-17T17:00:00Z');
const log = (s: Session, now: number, lb = 50, reps = 8, h: History = {}) =>
  logSet(s, { lb, enteredValue: lb, enteredUnit: 'lb', reps }, h, now).session;

/** What the account holds, rebuilt as a phone session (the round trip a second device makes). */
function roundTrip(s: Session): Session {
  const rows = sessionRows(s);
  const sets = Object.values(s.exercises).flatMap((e) => e.logs.map((_, i) => ({ ...setRow(e, i), record_types: e.logs[i].records })));
  const lib = (id: string) => {
    const e = Object.values(s.exercises).find((x) => x.exerciseId === id)!;
    return { name: e.name, muscle: e.muscle, equipment: e.equipment, unit: e.unit, assisted: e.assisted, loadCount: e.loadCount, alternates: e.alternates };
  };
  return sessionFromRows(rows.session, rows.blocks, rows.exercises, sets, lib);
}
const plain = (s: Session) => JSON.parse(JSON.stringify(s));

describe('a session as rows and back', () => {
  it('a superset broken part-way, a skipped exercise and a running rest survive the round trip', () => {
    let s = startSession('Push', '2026-11-17', [
      item('A1', { sets: 4, superset: 'A' }), item('A2', { sets: 4, rest: 90, superset: 'A' }), item('Solo'), item('Skip me'),
    ], {}, T0, noSeed, 'workout-1');
    s = startExercise(s, T0 + 1000);
    s = log(log(log(log(s, T0 + 2000), T0 + 3000), T0 + 4000), T0 + 5000); // 2 rounds
    s = breakSuperset(s, s.curBlock, T0 + 6000);
    s = skipBlock(s, liveBlocks(s).at(-1)!.id, T0 + 7000);
    s = startExercise(s, T0 + 8000);
    s = log(s, T0 + 9000);
    expect(s.restEndsAt).not.toBeNull();
    expect(plain(roundTrip(s))).toEqual(plain(s));
  });

  it('a finished session keeps its reason and end, and sets left undone are Skipped', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A'), item('B')], {}, T0, noSeed), T0);
    s = log(s, T0 + 1000);
    s = finishSession(s, T0 + 60000);
    const rows = sessionRows(s);
    expect(rows.session.status).toBe('finished');
    expect(rows.session.finish_reason).toBe('user');
    expect(rows.exercises.map((x) => x.state)).toEqual(['done', 'skipped']);
  });
});

describe('the changes between two states', () => {
  it('a new session sends the session, then its sets in order, then the rest alert', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0);
    s = log(log(s, T0 + 1000), T0 + 2000);
    expect(sessionChanges(null, s).map((c) => c.kind)).toEqual(['session.put', 'set.put', 'set.put', 'rest.set']);
  });

  it('deleting a set sends the delete first, then the sets that moved up, lowest first', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A', { sets: 4 })], {}, T0, noSeed), T0);
    s = log(log(log(s, T0 + 1000, 50), T0 + 2000, 55), T0 + 3000, 60);
    const key = Object.keys(s.exercises)[0];
    const next = deleteSet(s, key, 0, {}, T0 + 4000);
    const cs = sessionChanges(s, next);
    expect(cs.map((c) => c.kind)).toEqual(['set.delete', 'session.put', 'set.put', 'set.put']);
    expect(cs.filter((c) => c.kind === 'set.put').map((c) => [c.data.set_number, c.data.weight_lb])).toEqual([[1, 55], [2, 60]]);
  });

  it('nothing changed, nothing sent', () => {
    const s = startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed);
    expect(sessionChanges(s, s)).toEqual([]);
  });

  it('finishing cancels the rest alert', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0);
    s = log(s, T0 + 1000);
    const cs = sessionChanges(s, finishSession(s, T0 + 2000));
    expect(cs.find((c) => c.kind === 'rest.set')?.data.fire_at).toBeNull();
  });
});

describe('the outbox queue', () => {
  const q0 = (): Change[] => [];
  it('a later copy of the session folds into the unsent earlier one, keeping its place, with a new id', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0);
    let q = enqueue(q0(), sessionChanges(null, s), new Set(), 1);
    const firstId = q[0].id;
    const prev = s;
    s = log(s, T0 + 1000);
    q = enqueue(q, sessionChanges(prev, s), new Set(), 2);
    expect(q.map((c) => c.kind)).toEqual(['session.put', 'set.put', 'rest.set']);
    expect(q[0].id).not.toBe(firstId);
  });

  it('an edit to a set is not folded back past a delete that waits after it', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A', { sets: 4 })], {}, T0, noSeed), T0);
    s = log(log(s, T0 + 1000, 50), T0 + 2000, 55);
    let q = enqueue(q0(), sessionChanges(null, s), new Set(), 1);
    const key = Object.keys(s.exercises)[0];
    const d = deleteSet(s, key, 0, {}, T0 + 3000);
    q = enqueue(q, sessionChanges(s, d), new Set(), 2);
    const kinds = q.map((c) => `${c.kind}${c.kind === 'set.put' ? c.data.set_number : ''}`);
    // The 55 lb set, now number 1, comes after the delete of the old number 1.
    expect(kinds.indexOf('set.delete')).toBeLessThan(kinds.lastIndexOf('set.put1'));
  });

  it('the server\'s answer takes out what it confirmed or refused, and nothing else', () => {
    const q = enqueue(q0(), [noteChange('e', 'a'), unitChange('e', 'kg'), unitChange('f', 'lb')], new Set(), 1);
    const left = settle(q, { done: [q[0].id], rejected: [{ id: q[1].id, reason: 'x' }], conflict: null, records: {} });
    expect(left.map((c) => c.id)).toEqual([q[2].id]);
    expect(pendingChoices(left).units).toEqual({ f: 'lb' });
  });

  it('records from the server replace the phone\'s badges', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0);
    s = log(s, T0 + 1000);
    const id = Object.values(s.exercises)[0].logs[0].id;
    const t = applyServerRecords(s, { [id]: ['heaviest'] });
    expect(Object.values(t.exercises)[0].logs[0].records).toEqual(['heaviest']);
    expect(applyServerRecords(t, { [id]: ['heaviest'] })).toBe(t);
  });
});

describe('crash-safe sessions (spec Section 8, Resilience)', () => {
  it('closing mid-session and reopening later returns to the same exercise with sets and clocks correct', () => {
    let s = startSession('x', '2026-11-17', [item('A'), item('B')], {}, T0, noSeed);
    s = startExercise(s, T0 + 10_000);
    s = log(s, T0 + 70_000);
    s = goTo(s, s.blocks[1].id, T0 + 80_000);
    s = startExercise(s, T0 + 90_000);
    // The phone's storage holds plain JSON; the app is closed and reopened 5 minutes later.
    const stored = JSON.stringify(s);
    const back: Session = JSON.parse(stored);
    const later = T0 + 390_000;
    expect(back.curBlock).toBe(s.blocks[1].id);
    expect(back.exercises[back.curMember].name).toBe('B');
    expect(back.exercises[s.blocks[0].members[0]].logs.length).toBe(1);
    expect(readClock(back.clock, later)).toBe(390); // the workout clock kept counting
    expect(readClock(blockOf(back, back.curBlock).clock, later)).toBe(300); // B's clock, from its Start exercise
    expect(readClock(back.blocks[0].clock, later)).toBe(70); // A paused when left
    // A second device rebuilding it from the account reads the same.
    const other = roundTrip(back);
    expect(readClock(other.clock, later)).toBe(390);
    expect(readClock(blockOf(other, other.curBlock).clock, later)).toBe(300);
  });

  it('after 30 minutes with nothing logged, the session ends at its last step, clocks cut back', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0 + 60_000);
    s = log(s, T0 + 120_000);
    expect(autoFinishIfIdle(s, T0 + 120_000 + AUTO_FINISH_MS - 1)).toBe(s);
    const f = autoFinishIfIdle(s, T0 + 120_000 + AUTO_FINISH_MS + 5000);
    expect(f.endedAt).toBe(T0 + 120_000);
    expect(f.finishReason).toBe('auto');
    expect(f.clock.banked).toBe(120);
    expect(readClock(f.blocks[0].clock, T0 + 10 * AUTO_FINISH_MS)).toBe(60);
    expect(f.restEndsAt).toBeNull();
  });

  it('a finished workout reopens within 48 hours with the closed time not counted, and not after', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], {}, T0, noSeed), T0);
    s = log(s, T0 + 60_000);
    s = finishSession(s, T0 + 100_000);
    const r = reopenSession(s, T0 + 3_600_000);
    expect(r.endedAt).toBeNull();
    expect(readClock(r.clock, T0 + 3_610_000)).toBe(110);
    expect(readClock(blockOf(r, r.curBlock).clock, T0 + 3_610_000)).toBe(110);
    expect(canReopen(s, T0 + 100_000 + REOPEN_MS + 1)).toBe(false);
    expect(reopenSession(s, T0 + 100_000 + REOPEN_MS + 1)).toBe(s);
  });
});

describe('editing and deleting logged sets (spec Section 10)', () => {
  const past: History = { A: [{ day: '2026-11-10', sessionId: 'old', sets: [{ lb: 60, reps: 8, type: 'working' }] }] };
  it('editing a set works its records out again', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A')], past, T0, noSeed), T0);
    s = log(s, T0 + 1000, 65, 8, past);
    const key = Object.keys(s.exercises)[0];
    expect(s.exercises[key].logs[0].records).toEqual(['heaviest', '6_plus']);
    s = editSet(s, key, 0, { lb: 55, enteredValue: 55, enteredUnit: 'lb', reps: 8 }, past, T0 + 2000);
    expect(s.exercises[key].logs[0].records).toEqual([]);
  });

  it('deleting the last set of a finished exercise opens it again and resumes its clock', () => {
    let s = startExercise(startSession('x', '2026-11-17', [item('A', { sets: 1 })], {}, T0, noSeed), T0);
    s = log(s, T0 + 30_000);
    expect(s.blocks[0].stopped).toBe(true);
    const key = Object.keys(s.exercises)[0];
    s = lastLoggedSetUndo(s, key, {}, T0 + 40_000);
    expect(s.exercises[key].logs).toEqual([]);
    expect(s.blocks[0].stopped).toBe(false);
    expect(readClock(s.blocks[0].clock, T0 + 50_000)).toBe(40);
  });
});

describe('history: the server\'s, with this phone\'s unsent sessions', () => {
  it('adds a session finished here that the server has not heard of, and leaves out the one running', () => {
    const server: History = { A: [{ day: '2026-11-10', sessionId: 's1', sets: [] }] };
    const local: History = { A: [{ day: '2026-11-10', sessionId: 's1', sets: [] }, { day: '2026-11-12', sessionId: 's2', sets: [] }, { day: '2026-11-17', sessionId: 'now', sets: [] }] };
    expect(mergeHistory(server, local, 'now').A.map((p) => p.sessionId)).toEqual(['s1', 's2']);
  });
});
