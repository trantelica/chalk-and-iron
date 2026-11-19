// Saving workouts to the account and sending changes made offline (design
// Section 6, spec Section 8 "Resilience"). The phone's own outbox runs here
// against the test database, with the network switched off and on.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { Outbox } from '@/lib/outbox';
import {
  autoFinishIfIdle, deleteSet, editSet, finishSession, logSet, reopenSession, startExercise, startSession,
  AUTO_FINISH_MS, type History, type PlanItem, type Session,
  pauseSession, resumeSession, PAUSED_FINISH_MS,
} from '@/rules/session';
import {
  enqueue, finishOtherChange, historyFromMemory, noteChange, restChange, sessionChanges, sessionFromRows, unitChange,
  type Change, type MemoryRow, type NewChange, type SyncAnswer,
} from '@/rules/sync';
import { recordsEarned, type SetFacts } from '@/rules/workout';

let db: Db;
let a: string;
let b: string;
const ex: Record<string, string> = {};

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  for (const name of ['Barbell Bench Press', 'Barbell Bent-Over Row', 'Barbell Curl', 'Push-Up', 'Assisted Pull-Up Machine']) {
    const rows = await db.server<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [a, name]);
    if (rows[0]) ex[name] = rows[0].id;
  }
});

const t = (v: unknown) => new Date(v as string).getTime();
const parse = (v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v);
const wire = (cs: Change[]) => JSON.stringify(cs.map(({ id, kind, data }) => ({ id, kind, data })));

/** Sends straight to the database as a person, the way the phone's rpc call does. */
const sendAs = (user: string, opts?: { coach?: boolean }) => async (cs: Change[]): Promise<SyncAnswer> => {
  const rows = await db.as<{ r: unknown }>(user, `select apply_changes($1::jsonb) as r`, [wire(cs)], opts);
  return parse(rows[0].r) as SyncAnswer;
};

/** A phone: an outbox in memory, and a network that can be switched off. */
function phone(user: string) {
  let stored: Change[] = [];
  const net = { on: true, loseAnswers: false };
  const box = new Outbox({
    load: () => stored,
    save: (q) => { stored = q; },
    send: async (cs) => {
      if (!net.on) throw new Error('Failed to fetch');
      const answer = await sendAs(user)(cs);
      if (net.loseAnswers) throw new Error('The connection dropped before the answer arrived');
      return answer;
    },
  });
  let cur: Session | null = null;
  return {
    box, net,
    stored: () => stored,
    get s() { return cur!; },
    /** Every change to the session goes through here, as in the app. */
    commit(next: Session) { box.add(sessionChanges(cur, next)); cur = next; },
    add(cs: NewChange[]) { box.add(cs); },
  };
}

const plan = (names: string[], over: Partial<PlanItem> = {}): PlanItem[] => names.map((n) => ({
  exerciseId: ex[n], name: n, muscle: '', equipment: '', unit: n === 'Push-Up' ? 'bw' : 'lb', assisted: n.startsWith('Assisted'),
  loadCount: 1, work: 45, rest: 90, sets: 3, reps: 8, alternates: [], ...over,
}));
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const lbSet = (lb: number, reps = 8) => ({ lb, enteredValue: lb, enteredUnit: 'lb' as const, reps });

async function setsOnServer(user: string, sessionId: string) {
  return db.as<{ id: string; set_number: number; weight_lb: string; reps: number; record_types: string[]; deleted_at: string | null }>(user,
    `select l.id, l.set_number, l.weight_lb, l.reps, l.record_types, l.deleted_at from set_logs l
     join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1 order by l.deleted_at nulls first, l.set_number`, [sessionId]);
}

async function finishAllActive() {
  await db.server(`update sessions set status = 'finished', ended_at = now(), finish_reason = 'user' where status = 'active'`);
}

beforeEach(finishAllActive);

const T = Date.parse('2026-11-17T17:00:00Z');

describe('a change sent twice counts once', () => {
  it('the same change id sent twice adds one set', async () => {
    const p = phone(a);
    let s = startSession('Push', '2026-11-17', plan(['Barbell Curl']), {}, T, noSeed);
    p.commit(s);
    s = startExercise(s, T + 1000); p.commit(s);
    s = logSet(s, lbSet(60), {}, T + 2000).session; p.commit(s);
    const batch = p.box.entries.slice();
    const first = await sendAs(a)(batch);
    expect(first.done).toEqual(batch.map((c) => c.id));
    const again = await sendAs(a)(batch);
    expect(again.done).toEqual(batch.map((c) => c.id));
    expect(again.rejected).toEqual([]);
    const live = (await setsOnServer(a, s.id)).filter((r) => !r.deleted_at);
    expect(live.length).toBe(1);
  });

  it('when the answer is lost, the outbox keeps the change and the resend does nothing more', async () => {
    const p = phone(a);
    let s = startExercise(startSession('Pull', '2026-11-17', plan(['Barbell Bent-Over Row']), {}, T, noSeed), T);
    p.commit(s);
    s = logSet(s, lbSet(95), {}, T + 5000).session; p.commit(s);
    p.net.loseAnswers = true;
    await p.box.flush();
    expect(p.box.count).toBeGreaterThan(0); // never confirmed, so still waiting
    p.net.loseAnswers = false;
    await p.box.flush();
    expect(p.box.count).toBe(0);
    expect((await setsOnServer(a, s.id)).length).toBe(1);
  });
});

describe('offline, then online', () => {
  it('sets logged offline reach the server once, in order, with edits and deletes applied', async () => {
    const p = phone(a);
    p.net.on = false;
    let s = startExercise(startSession('Arms', '2026-11-17', plan(['Barbell Curl'], { sets: 4 }), {}, T, noSeed), T);
    p.commit(s);
    for (const [i, w] of [50, 55, 60].entries()) { s = logSet(s, lbSet(w), {}, T + (i + 1) * 60000).session; p.commit(s); }
    const key = Object.keys(s.exercises)[0];
    s = editSet(s, key, 1, lbSet(57.5, 9), {}, T + 300000); p.commit(s); // set 2 edited
    s = deleteSet(s, key, 0, {}, T + 310000); p.commit(s); // set 1 deleted, the others move up
    await p.box.flush();
    expect(p.box.status.state).toBe('offline');
    expect((await db.as(a, `select 1 from sessions where id = $1`, [s.id])).length).toBe(0);

    p.net.on = true;
    await p.box.flush();
    expect(p.box.count).toBe(0);
    const rows = await setsOnServer(a, s.id);
    const live = rows.filter((r) => !r.deleted_at).map((r) => [r.set_number, Number(r.weight_lb), r.reps]);
    expect(live).toEqual([[1, 57.5, 9], [2, 60, 8]]);
    expect(rows.filter((r) => r.deleted_at).length).toBe(1);
    // And flushing again sends nothing and changes nothing.
    await p.box.flush();
    expect((await setsOnServer(a, s.id)).length).toBe(3);
  });

  it('folds repeated copies of the same unsent change into one', () => {
    let q: Change[] = [];
    q = enqueue(q, [noteChange('e1', 'a')], new Set(), 1);
    q = enqueue(q, [unitChange('e1', 'kg')], new Set(), 2);
    q = enqueue(q, [noteChange('e1', 'ab')], new Set(), 3);
    expect(q.map((c) => c.kind)).toEqual(['note.put', 'display_unit.put']);
    expect(q[0].data.note).toBe('ab');
    // Not while it is being sent.
    const sending = new Set([q[0].id]);
    q = enqueue(q, [noteChange('e1', 'abc')], sending, 4);
    expect(q.length).toBe(3);
  });
});

describe('what wins in a conflict (design Section 6)', () => {
  it('a deleted set stays deleted: a later edit from elsewhere does not bring it back', async () => {
    const p = phone(a);
    let s = startExercise(startSession('Curl day', '2026-11-17', plan(['Barbell Curl']), {}, T, noSeed), T);
    p.commit(s);
    s = logSet(s, lbSet(40), {}, T + 1000).session; p.commit(s);
    await p.box.flush();
    const key = Object.keys(s.exercises)[0];
    const old = s;
    s = deleteSet(s, key, 0, {}, T + 2000); p.commit(s);
    await p.box.flush();
    // Another device, which still had the set, edits it later.
    const other = sessionChanges(old, editSet(old, key, 0, lbSet(45, 10), {}, T + 3000)).filter((c) => c.kind === 'set.put');
    const answer = await sendAs(a)(enqueue([], other, new Set(), T + 3000));
    expect(answer.rejected).toEqual([]);
    const rows = await setsOnServer(a, s.id);
    expect(rows.length).toBe(1);
    expect(rows[0].deleted_at).not.toBeNull();
    expect(Number(rows[0].weight_lb)).toBe(40);
  });

  it('the same set edited in two places: the last change to reach the server wins', async () => {
    const p = phone(a);
    let s = startExercise(startSession('Row day', '2026-11-17', plan(['Barbell Bent-Over Row']), {}, T, noSeed), T);
    p.commit(s);
    s = logSet(s, lbSet(100), {}, T + 1000).session; p.commit(s);
    await p.box.flush();
    const key = Object.keys(s.exercises)[0];
    const here = sessionChanges(s, editSet(s, key, 0, lbSet(105), {}, T + 2000)).filter((c) => c.kind === 'set.put');
    const there = sessionChanges(s, editSet(s, key, 0, lbSet(110), {}, T + 1500)).filter((c) => c.kind === 'set.put');
    await sendAs(a)(enqueue([], here, new Set(), 1));
    await sendAs(a)(enqueue([], there, new Set(), 2));
    expect(Number((await setsOnServer(a, s.id))[0].weight_lb)).toBe(110);
  });

  it('only one workout runs at a time: a second is held back until the first is finished', async () => {
    const first = phone(a);
    const s1 = startSession('Phone workout', '2026-11-17', plan(['Barbell Curl']), {}, T, noSeed);
    first.commit(s1);
    await first.box.flush();
    expect(first.box.count).toBe(0);

    const second = phone(a);
    let s2 = startExercise(startSession('Tablet workout', '2026-11-17', plan(['Barbell Bench Press']), {}, T + 60000, noSeed), T + 60000);
    second.commit(s2);
    s2 = logSet(s2, lbSet(135, 5), {}, T + 61000).session; second.commit(s2);
    await second.box.flush();
    expect(second.box.status.state).toBe('conflict');
    if (second.box.status.state !== 'conflict') return;
    expect(second.box.status.conflict.session_id).toBe(s1.id);
    expect(second.box.status.conflict.workout_name).toBe('Phone workout');
    // Nothing of the second session reached the server.
    expect((await db.as(a, `select 1 from sessions where id = $1`, [s2.id])).length).toBe(0);

    // The person chooses: finish the other one and keep this one.
    second.box.addFirst(finishOtherChange(s1.id));
    second.box.clearConflict();
    await second.box.flush();
    expect(second.box.count).toBe(0);
    const rows = await db.as<{ id: string; status: string; finish_reason: string }>(a,
      `select id, status, finish_reason from sessions where id = any($1) order by started_at`, [[s1.id, s2.id]]);
    expect(rows.map((r) => [r.status, r.finish_reason])).toEqual([['finished', 'user'], ['active', null]]);
    expect((await setsOnServer(a, s2.id)).length).toBe(1);
  });

  it('a finished workout can be reopened within 48 hours, and not after', async () => {
    const p = phone(a);
    const now = Date.now();
    let s = startExercise(startSession('Reopen me', '2026-11-17', plan(['Barbell Curl']), {}, now - 3600000, noSeed), now - 3600000);
    s = logSet(s, lbSet(50), {}, now - 3500000).session;
    s = finishSession(s, now - 3400000);
    p.commit(s);
    await p.box.flush();
    s = reopenSession(s, now);
    expect(s.endedAt).toBeNull();
    p.commit(s);
    await p.box.flush();
    expect(p.box.rejected).toEqual([]);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [s.id]))[0].status).toBe('active');

    // An old one: finished three days ago on the server.
    const q = phone(a);
    let old = startSession('Old', '2026-11-14', plan(['Barbell Curl']), {}, now - 4 * 86400000, noSeed);
    old = finishSession(old, now - 3 * 86400000);
    await finishAllActive();
    q.commit(old);
    await q.box.flush();
    const forced = { ...old, endedAt: null, finishReason: null }; // a phone that tries anyway
    q.commit(forced);
    await q.box.flush();
    expect(q.box.rejected.map((r) => r.reason).join(' ')).toMatch(/48 hours/);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [old.id]))[0].status).toBe('finished');
  });
});

describe('the 30-minute auto-finish', () => {
  it('the server job ends an idle session at its last logged step, clocks cut back', async () => {
    const p = phone(a);
    const start = Date.now() - 2 * 3600000;
    let s = startExercise(startSession('Idle', '2026-11-17', plan(['Barbell Curl', 'Barbell Bent-Over Row']), {}, start, noSeed), start + 60000);
    s = logSet(s, lbSet(50), {}, start + 120000).session; // the last logged step, 2 minutes in
    p.commit(s);
    await p.box.flush();
    const n = await db.server<{ n: number }>(`select app.auto_finish_idle_sessions() as n`);
    expect(n[0].n).toBe(1);
    const [row] = await db.as<{ status: string; finish_reason: string; ended_at: string; clock_banked_seconds: string }>(a,
      `select status, finish_reason, ended_at, clock_banked_seconds from sessions where id = $1`, [s.id]);
    expect([row.status, row.finish_reason]).toEqual(['finished', 'auto']);
    expect(t(row.ended_at)).toBe(start + 120000);
    expect(Number(row.clock_banked_seconds)).toBe(120);
    const blocks = await db.as<{ clock_banked_seconds: string; clock_running_since: string | null }>(a,
      `select clock_banked_seconds, clock_running_since from session_blocks where session_id = $1 order by position`, [s.id]);
    expect(Number(blocks[0].clock_banked_seconds)).toBe(60);
    expect(blocks.every((x) => x.clock_running_since === null)).toBe(true);
    const states = await db.as<{ state: string }>(a, `select state from session_exercises where session_id = $1 order by exercise_name_then`, [s.id]);
    expect(states.map((x) => x.state).sort()).toEqual(['done', 'skipped']);

    // The phone, opened later, works out the same end and the same clocks.
    const local = autoFinishIfIdle(s, start + 120000 + AUTO_FINISH_MS + 1);
    expect(local.endedAt).toBe(start + 120000);
    expect(local.finishReason).toBe('auto');
    expect(local.clock.banked).toBe(120);
  });

  it('a session with recent activity is left alone', async () => {
    const p = phone(a);
    p.commit(startSession('Busy', '2026-11-17', plan(['Barbell Curl']), {}, Date.now() - 60000, noSeed));
    await p.box.flush();
    expect((await db.server<{ n: number }>(`select app.auto_finish_idle_sessions() as n`))[0].n).toBe(0);
  });
});

describe('a paused workout (Nathan, 19 Nov)', () => {
  it('waits 2 hours, not 30 minutes, before finishing itself, and comes back paused', async () => {
    const p = phone(a);
    const start = Date.now() - 4 * 3600000;
    let s = startExercise(startSession('Paused', '2026-11-19', plan(['Barbell Curl']), {}, start, noSeed), start + 60000);
    s = logSet(s, lbSet(50), {}, start + 120000).session;
    const pausedAt = Date.now() - 60 * 60000; // paused an hour ago
    s = pauseSession(s, pausedAt);
    p.commit(s);
    await p.box.flush();
    expect(p.box.rejected).toEqual([]);
    expect((await db.server<{ n: number }>(`select app.auto_finish_idle_sessions() as n`))[0].n).toBe(0);
    const [row] = await db.as<Record<string, unknown>>(a, `select * from sessions where id = $1`, [s.id]);
    expect(row.status).toBe('active');
    expect(row.clock_running_since).toBeNull();

    // Paused 3 hours ago: it finishes, ending at the pause.
    await db.server(`update sessions set last_activity_at = now() - interval '3 hours' where id = $1`, [s.id]);
    expect((await db.server<{ n: number }>(`select app.auto_finish_idle_sessions() as n`))[0].n).toBe(1);
    const [done] = await db.as<{ status: string; finish_reason: string }>(a, `select status, finish_reason from sessions where id = $1`, [s.id]);
    expect([done.status, done.finish_reason]).toEqual(['finished', 'auto']);
  });

  it('resume starts the clocks again, and the phone keeps the same 2-hour rule', () => {
    const t0 = 1_000_000_000;
    let s = startExercise(startSession('P', '2026-11-19', plan(['Barbell Curl']), {}, t0, noSeed), t0);
    s = pauseSession(s, t0 + 60000);
    expect(autoFinishIfIdle(s, t0 + 60000 + AUTO_FINISH_MS + 1).endedAt).toBeNull();
    expect(autoFinishIfIdle(s, t0 + 60000 + PAUSED_FINISH_MS + 1).finishReason).toBe('auto');
    s = resumeSession(s, t0 + 600000);
    expect(s.pausedAt).toBeNull();
    expect(s.clock.since).toBe(t0 + 600000);
  });
});

describe('records are worked out by the database', () => {
  async function session(day: string, at: number, sets: Array<[number, number, ('warm_up' | 'working')?]>, name = 'Barbell Curl', h: History = {}) {
    const p = phone(a);
    let s = startExercise(startSession('R', day, plan([name], { sets: sets.length }), h, at, noSeed), at);
    const key = Object.keys(s.exercises)[0];
    sets.forEach(([, , t], i) => { if (t === 'warm_up') s.exercises[key].types[i] = 'warm_up'; });
    for (const [i, [lb, reps]] of sets.entries()) s = logSet(s, lbSet(lb, reps), h, at + (i + 1) * 1000).session;
    s = finishSession(s, at + 60000);
    p.commit(s);
    await p.box.flush();
    expect(p.box.rejected).toEqual([]);
    return s;
  }

  it('matches the phone rule, ties included, and is worked out again on delete', async () => {
    await db.server(`delete from sessions where user_id = $1`, [a]);
    const s1 = await session('2026-11-01', Date.parse('2026-11-01T17:00:00Z'), [[60, 8], [60, 8]]);
    const s2 = await session('2026-11-08', Date.parse('2026-11-08T17:00:00Z'), [[45, 10, 'warm_up'], [60, 8], [65, 8], [70, 5]]);
    const rows = await setsOnServer(a, s2.id);
    expect(rows.map((r) => r.record_types)).toEqual([[], [], ['heaviest', '6_plus'], ['heaviest']]);
    expect((await setsOnServer(a, s1.id)).map((r) => r.record_types)).toEqual([[], []]); // first-ever session

    // The same answer from the phone's own rule, set by set.
    const facts: SetFacts[] = [];
    const phoneAnswer: string[][] = [];
    for (const [day, list] of [['2026-11-01', [[60, 8, 'working'], [60, 8, 'working']]], ['2026-11-08', [[45, 10, 'warm_up'], [60, 8, 'working'], [65, 8, 'working'], [70, 5, 'working']]]] as const) {
      list.forEach(([lb, reps, type], i) => {
        const f: SetFacts = { id: `${day}${i}`, lb, reps, type, day, order: i };
        if (day === '2026-11-08') phoneAnswer.push(recordsEarned(facts, f, { unit: 'lb', assisted: false, loadCount: 1 }));
        facts.push(f);
      });
    }
    expect(rows.map((r) => r.record_types)).toEqual(phoneAnswer);

    // Deleting the 65 lb set: the 70 lb set is still the heaviest, and nothing is 6+ any more.
    const p = phone(a);
    p.commit(s2);
    const key = Object.keys(s2.exercises)[0];
    p.box.add(sessionChanges(s2, deleteSet(s2, key, 2, {}, Date.now())));
    // (a fresh phone: the diff above is enough to delete and renumber)
    await p.box.flush();
    const after = (await setsOnServer(a, s2.id)).filter((r) => !r.deleted_at);
    expect(after.map((r) => [Number(r.weight_lb), r.record_types])).toEqual([[45, []], [60, []], [70, ['heaviest']]]);
  });

  it('an assisted machine counts less assistance as better', async () => {
    if (!ex['Assisted Pull-Up Machine']) return;
    await session('2026-11-02', Date.parse('2026-11-02T17:00:00Z'), [[50, 8]], 'Assisted Pull-Up Machine');
    const s = await session('2026-11-09', Date.parse('2026-11-09T17:00:00Z'), [[60, 8], [40, 8]], 'Assisted Pull-Up Machine');
    expect((await setsOnServer(a, s.id)).map((r) => r.record_types)).toEqual([[], ['heaviest', '6_plus']]);
  });

  it('the phone is told the server\'s records for its sets, and they replace its own', async () => {
    const p = phone(a);
    let s = startExercise(startSession('X', '2026-11-20', plan(['Barbell Curl']), {}, Date.parse('2026-11-20T17:00:00Z'), noSeed), Date.parse('2026-11-20T17:00:00Z'));
    s = logSet(s, lbSet(80, 8), {}, Date.parse('2026-11-20T17:01:00Z')).session; // the phone, with no history, thinks: no record
    p.commit(s);
    let answer: SyncAnswer | null = null;
    p.box.onAnswer((x) => { answer = x; });
    await p.box.flush();
    const id = s.exercises[Object.keys(s.exercises)[0]].logs[0].id;
    expect(answer!.records[id]).toEqual(['heaviest', '6_plus']);
  });
});

describe('display choices and the note', () => {
  it('the lb/kg switch is saved apart from the library, and the note is an edit to the exercise', async () => {
    const curl = ex['Barbell Curl'];
    const [before] = await db.as<{ version: number; default_unit: string }>(a, `select version, default_unit from exercises where id = $1`, [curl]);
    const p = phone(a);
    p.net.on = false;
    p.add([unitChange(curl, 'kg')]);
    p.add([noteChange(curl, 'Elbows in')]);
    await p.box.flush();
    p.net.on = true;
    await p.box.flush();
    const [unit] = await db.as<{ unit: string }>(a, `select unit from exercise_display_units where exercise_id = $1`, [curl]);
    expect(unit.unit).toBe('kg');
    const [after] = await db.as<{ version: number; default_unit: string; note: string }>(a, `select version, default_unit, note from exercises where id = $1`, [curl]);
    expect(after.default_unit).toBe(before.default_unit);
    expect(after.note).toBe('Elbows in');
    expect(after.version).toBe(before.version + 1); // the note, not the unit switch
    p.add([unitChange(curl, 'lb')]);
    await p.box.flush();
    const [again] = await db.as<{ version: number }>(a, `select version from exercises where id = $1`, [curl]);
    expect(again.version).toBe(after.version);
  });
});

describe('rest alerts', () => {
  it('rest start schedules one, +0:15 moves it, Skip cancels it, and finishing cancels it', async () => {
    const p = phone(a);
    const now = Date.now();
    let s = startExercise(startSession('Rest', '2026-11-17', plan(['Barbell Curl']), {}, now, noSeed), now);
    p.commit(s);
    s = logSet(s, lbSet(50), {}, now + 1000).session; // rest starts: 90 seconds
    p.commit(s);
    await p.box.flush();
    const alerts = () => db.as<{ fire_at: string; status: string }>(a, `select fire_at, status from rest_alerts where session_id = $1 order by created_at, fire_at`, [s.id]);
    expect((await alerts()).map((x) => [t(x.fire_at), x.status])).toEqual([[s.restEndsAt, 'scheduled']]);
    const moved = { ...s, restEndsAt: s.restEndsAt! + 15000, restTotal: s.restTotal + 15 };
    p.commit(moved);
    await p.box.flush();
    const list = await alerts();
    expect(list.filter((x) => x.status === 'scheduled').map((x) => t(x.fire_at))).toEqual([moved.restEndsAt]);
    p.commit({ ...moved, restEndsAt: null });
    await p.box.flush();
    expect((await alerts()).filter((x) => x.status === 'scheduled')).toEqual([]);
    // The app on screen cancels just before the end; a hidden app schedules it again.
    p.add([restChange(s.id, now + 60000)]);
    await p.box.flush();
    expect((await alerts()).filter((x) => x.status === 'scheduled').length).toBe(1);
    p.commit(finishSession({ ...moved, restEndsAt: now + 60000 }, now + 2000));
    await p.box.flush();
    expect((await alerts()).filter((x) => x.status === 'scheduled')).toEqual([]);
  });

  it('a person cannot mark their own alert sent', async () => {
    await expect(db.as(a, `update rest_alerts set status = 'sent' where user_id = $1`, [a])).rejects.toThrow();
  });
});

describe('history from the server', () => {
  it('gives the last sessions in full and older record sets, and leaves out the session asked about', async () => {
    await db.server(`delete from sessions where user_id = $1`, [a]);
    const ids: string[] = [];
    for (let w = 0; w < 8; w++) {
      const day = `2026-10-${String(1 + w * 3).padStart(2, '0')}`;
      const p = phone(a);
      let s = startExercise(startSession('H', day, plan(['Barbell Bench Press'], { sets: 2 }), {}, Date.parse(`${day}T17:00:00Z`), noSeed), Date.parse(`${day}T17:00:00Z`));
      // The best set ever is in the first week.
      s = logSet(s, lbSet(w === 0 ? 225 : 135 + w * 5, 5), {}, Date.parse(`${day}T17:01:00Z`)).session;
      s = logSet(s, lbSet(135, 8), {}, Date.parse(`${day}T17:02:00Z`)).session;
      p.commit(finishSession(s, Date.parse(`${day}T17:10:00Z`)));
      await p.box.flush();
      ids.push(s.id);
    }
    const rows = (await db.as<MemoryRow>(a, `select * from exercise_memory($1)`, [ids[7]])).filter((r) => r.exercise_id === ex['Barbell Bench Press']);
    const h = historyFromMemory(rows)[ex['Barbell Bench Press']];
    const real = h.filter((x) => !x.extra);
    expect(real.length).toBe(6);
    expect(real.map((x) => x.sessionId)).toEqual(ids.slice(1, 7)); // the 6 before the one left out
    const extra = h.filter((x) => x.extra);
    expect(extra.flatMap((x) => x.sets.map((y) => y.lb))).toContain(225);
    // B sees none of it.
    expect((await db.as(b, `select * from exercise_memory(null)`)).length).toBe(0);
  });

  it('a session rebuilt from the account matches the phone\'s own', async () => {
    const p = phone(a);
    let s = startSession('Rebuild', '2026-11-17', [
      ...plan(['Barbell Bench Press', 'Barbell Bent-Over Row'], { superset: 'A', sets: 3 }),
      ...plan(['Barbell Curl']),
    ], {}, T, noSeed);
    s = startExercise(s, T + 1000);
    s = logSet(s, lbSet(135, 8), {}, T + 2000).session;
    s = logSet(s, lbSet(95, 10), {}, T + 3000).session;
    p.commit(s);
    await p.box.flush();
    const [session] = await db.as(a, `select * from sessions where id = $1`, [s.id]);
    const blocks = await db.as(a, `select * from session_blocks where session_id = $1`, [s.id]);
    const exercises = await db.as(a, `select * from session_exercises where session_id = $1`, [s.id]);
    const sets = await db.as(a, `select l.* from set_logs l join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1`, [s.id]);
    const lib = (id: string) => ({ name: Object.keys(ex).find((k) => ex[k] === id)!, muscle: '', equipment: '', unit: 'lb' as const, assisted: false, loadCount: 1, alternates: [] });
    const back = sessionFromRows(session, blocks, exercises, sets, lib);
    const strip = (x: Session) => JSON.parse(JSON.stringify({ ...x, exercises: Object.fromEntries(Object.entries(x.exercises).map(([k, e]) => [k, { ...e, logs: e.logs.map((l) => ({ ...l, records: [] })) }])) }));
    expect(strip(back)).toEqual(strip(s));
  });
});

describe('each person\'s changes stay their own', () => {
  it('A cannot write into B\'s session through the outbox, and a coach cannot send changes at all', async () => {
    const pb = phone(b);
    const [{ id: bCurl, note: bNote }] = await db.server<{ id: string; note: string }>(`select id, note from exercises where user_id = $1 and name = 'Barbell Curl'`, [b]);
    let sb = startExercise(startSession('B', '2026-11-17', [{ ...plan(['Barbell Curl'])[0], exerciseId: bCurl }], {}, T, noSeed), T);
    sb = logSet(sb, lbSet(30), {}, T + 1000).session;
    pb.commit(sb);
    await pb.box.flush();
    expect(pb.box.count).toBe(0);

    // A replays B's changes, and tries to edit B's set and finish B's session.
    const bKey = Object.keys(sb.exercises)[0];
    const attack = enqueue([], [
      ...sessionChanges(null, sb),
      ...sessionChanges(sb, editSet(sb, bKey, 0, lbSet(999), {}, T + 2000)).filter((c) => c.kind === 'set.put'),
      finishOtherChange(sb.id),
      noteChange(bCurl, 'hacked'),
      unitChange(bCurl, 'kg'),
    ], new Set(), T);
    const answer = await sendAs(a)(attack);
    expect(answer.done.length).toBeLessThan(attack.length);
    const [bSet] = await setsOnServer(b, sb.id);
    expect(Number(bSet.weight_lb)).toBe(30);
    expect((await db.as<{ status: string }>(b, `select status from sessions where id = $1`, [sb.id]))[0].status).toBe('active');
    expect((await db.as<{ note: string }>(b, `select note from exercises where id = $1`, [bCurl]))[0].note).toBe(bNote);
    expect((await db.as(b, `select 1 from exercise_display_units where exercise_id = $1`, [bCurl])).length).toBe(0);
    // A's received ids are A's own; B never sees them.
    expect((await db.as(b, `select 1 from received_changes where change_id = any($1)`, [attack.map((c) => c.id)])).length).toBe(0);

    await expect(sendAs(a, { coach: true })(enqueue([], [noteChange(ex['Barbell Curl'], 'coach')], new Set(), T))).rejects.toThrow(/not_signed_in/);
  });
});
