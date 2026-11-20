// Swaps saved to the account (spec Sections 2 and 10, design question 16):
// an alternate not yet in the library joins it at once, sent with the
// outbox ahead of the workout that uses it, and a swap part-way through an
// exercise keeps each set with the exercise it was done on.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { Outbox } from '@/lib/outbox';
import { logSet, startExercise, startSession, swapExercise, type PlanItem, type Session } from '@/rules/session';
import { exerciseConfirmChange, exerciseCreateChange, sessionChanges, type Change, type SwapMadeExercise, type SyncAnswer } from '@/rules/sync';
import { suggestSwapMade, type VocabTerm } from '@/rules/swap-made';

let db: Db;
let a: string;
let b: string;
let bench: { id: string; muscle_group_id: string; focus_id: string | null };
let vocab: VocabTerm[];

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  bench = (await db.server<typeof bench>(`select id, muscle_group_id, focus_id from exercises where user_id = $1 and name = 'Barbell Bench Press'`, [a]))[0];
  vocab = (await db.server<{ id: string; kind: VocabTerm['kind']; name: string; parent_id: string | null }>(
    `select id, kind, name, parent_id from vocabulary_terms where user_id = $1`, [a])).map((v) => ({ id: v.id, kind: v.kind, name: v.name, parentId: v.parent_id }));
});

beforeEach(async () => {
  await db.server(`update sessions set status = 'finished', ended_at = now(), finish_reason = 'user' where status = 'active'`);
});

const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const sendAs = (user: string) => async (cs: Change[]): Promise<SyncAnswer> => {
  const rows = await db.as<{ r: unknown }>(user, `select apply_changes($1::jsonb) as r`, [JSON.stringify(cs.map(({ id, kind, data }) => ({ id, kind, data })))]);
  return parse(rows[0].r) as SyncAnswer;
};
function phone(user: string) {
  let stored: Change[] = [];
  const net = { on: true };
  const box = new Outbox({
    load: () => stored, save: (q) => { stored = q; },
    send: async (cs) => { if (!net.on) throw new Error('Failed to fetch'); return sendAs(user)(cs); },
  });
  let cur: Session | null = null;
  return { box, net, get s() { return cur!; }, commit(next: Session) { box.add(sessionChanges(cur, next)); cur = next; } };
}
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const item = (id: string, name: string, over: Partial<PlanItem> = {}): PlanItem => ({
  exerciseId: id, name, muscle: 'Chest', equipment: 'barbell', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 120,
  sets: 3, reps: 8, alternates: [], ...over,
});
const T = Date.parse('2026-11-19T17:00:00Z');
const made = (name: string, tier: 'bodyweight' | 'basic_gym' = 'basic_gym'): SwapMadeExercise =>
  suggestSwapMade(crypto.randomUUID(), name, tier, { muscleId: bench.muscle_group_id, focusId: bench.focus_id, unit: 'lb', work: 45, rest: 120 }, vocab);
const exerciseRow = (id: string) => db.server<{ name: string; created_via: string; muscle_group_id: string | null; focus_id: string | null; equipment_id: string | null; default_unit: string; version: number }>(
  `select name, created_via, muscle_group_id, focus_id, equipment_id, default_unit, version from exercises where id = $1`, [id]);

describe('a swap to an alternate not yet in the library', () => {
  it('adds it at once with what is known from the original, and its equipment left empty', async () => {
    const x = made('Cable Chest Press Test');
    const r = await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(x) }]);
    expect(r.rejected).toEqual([]);
    const [row] = await exerciseRow(x.id);
    expect(row).toMatchObject({ name: 'Cable Chest Press Test', created_via: 'swap', muscle_group_id: bench.muscle_group_id, equipment_id: null, default_unit: 'lb' });
  });

  it('the bodyweight alternate gets the bodyweight unit and equipment, so it is complete', async () => {
    const x = made('Deficit Push-Up Test', 'bodyweight');
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(x) }]);
    const [row] = await exerciseRow(x.id);
    expect(row.default_unit).toBe('bw');
    expect(row.equipment_id).not.toBeNull();
  });

  it('sent twice, it is added once', async () => {
    const x = made('Twice Sent Press');
    const c = exerciseCreateChange(x);
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...c }]);
    const r = await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...c }]);
    expect(r.rejected).toEqual([]);
    expect((await db.server(`select 1 from exercises where user_id = $1 and name = 'Twice Sent Press'`, [a])).length).toBe(1);
  });

  it('made on two phones at once, the second keeps its own id under a name that does not clash', async () => {
    const one = made('Two Phone Press');
    const two = made('Two Phone Press');
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(one) }]);
    const r = await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(two) }]);
    expect(r.rejected).toEqual([]);
    expect((await exerciseRow(two.id))[0].name).toBe('Two Phone Press (2)');
  });

  it('made offline mid-workout, it reaches the account before the workout that names it', async () => {
    const p = phone(a);
    p.net.on = false;
    let s = startSession('Push', '2026-11-19', [item(bench.id, 'Barbell Bench Press')], {}, T, noSeed);
    p.commit(s);
    s = startExercise(s, T + 1000); p.commit(s);
    s = logSet(s, { lb: 135, enteredValue: 135, enteredUnit: 'lb', reps: 8 }, {}, T + 2000).session; p.commit(s);
    // The bench is taken: swap part-way to a new alternate.
    const x = made('Offline Swap Press');
    p.box.addFirst(exerciseCreateChange(x));
    s = swapExercise(s, s.curMember, item(x.id, x.name), noSeed, T + 3000); p.commit(s);
    s = startExercise(s, T + 4000); p.commit(s);
    s = logSet(s, { lb: 60, enteredValue: 60, enteredUnit: 'lb', reps: 10 }, {}, T + 5000).session; p.commit(s);
    await p.box.flush();
    p.net.on = true;
    await p.box.flush();
    expect(p.box.rejected).toEqual([]);
    expect(p.box.count).toBe(0);
    // Each set is saved with the exercise it was done on.
    const rows = await db.as<{ exercise_id: string; reps: number; state: string; origin: string; swapped_from_exercise_id: string | null }>(a,
      `select se.exercise_id, l.reps, se.state, se.origin, se.swapped_from_exercise_id from set_logs l
       join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1 order by l.logged_at`, [s.id]);
    expect(rows.map((r) => [r.exercise_id, r.reps])).toEqual([[bench.id, 8], [x.id, 10]]);
    expect(rows[0].state).toBe('done');
    expect(rows[1]).toMatchObject({ origin: 'swap', swapped_from_exercise_id: bench.id });
    // The swap changes no library workout or exercise detail of the original.
    expect((await db.server<{ created_via: string }>(`select created_via from exercises where id = $1`, [bench.id]))[0].created_via).toBe('starter');
  });
});

describe('the one-tap confirm', () => {
  it('fills in the suggested details as an ordinary edit', async () => {
    const x = made('Confirm Me Press');
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(x) }]);
    const cable = vocab.find((v) => v.kind === 'equipment' && v.name === 'cable')!;
    const { name: _name, ...rest } = x; void _name;
    const r = await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseConfirmChange({ ...rest, equipment_id: cable.id }) }]);
    expect(r.rejected).toEqual([]);
    const [row] = await exerciseRow(x.id);
    expect(row.equipment_id).toBe(cable.id);
    expect(row.version).toBe(2);
  });

  it('changes only an exercise made by a swap, and only the person\'s own', async () => {
    const { name: _n, ...benchEdit } = made('x'); void _n;
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseConfirmChange({ ...benchEdit, id: bench.id, default_unit: 'kg' }) }]);
    expect((await exerciseRow(bench.id))[0].default_unit).toBe('lb');
    const x = made('Not Yours Press');
    await sendAs(a)([{ id: crypto.randomUUID(), at: T, ...exerciseCreateChange(x) }]);
    const { name: _m, ...edit } = x; void _m;
    await sendAs(b)([{ id: crypto.randomUUID(), at: T, ...exerciseConfirmChange({ ...edit, default_unit: 'kg' }) }]);
    expect((await exerciseRow(x.id))[0].default_unit).toBe('lb');
  });
});
