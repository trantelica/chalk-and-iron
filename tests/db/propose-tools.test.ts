// Stage 4E, the propose tools (spec Section 4, "Proposals in the app"; Section
// 8, "Coach"; design Section 3, "Propose tools" and "What each proposal
// carries"). The real connector code runs against the real database rules
// through a coach's pass: every check that must stop a bad proposal does, and
// every card the tools store is accepted by the app's own Accept (stage 4D),
// all of it or none. The coach lock itself is tested in coach-lock.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { pgClient } from './pg-client';
import { fingerprint } from './fixtures';
import type { Caller } from '@/server/connector/auth';
import { callTool, type Deps } from '@/server/connector/mcp';
import { trainingDay } from '@/rules/days';
import { todayDecision, type ProposalContext } from '@/rules/decide';

let db: Db;
let a: string;
let b: string;
const today = trainingDay(new Date(), 'America/Denver');
const parse = <T,>(v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const one = async <T = Record<string, unknown>,>(sql: string, params: unknown[] = []) => (await db.server<T>(sql, params))[0];
const id = async (name: string) => (await one<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [a, name])).id;

function caller(user: string): Caller {
  return {
    userId: user, clientId: 'test-coach-app', token: 't', claims: { sub: user, iss: 'x', exp: 0 },
    me: { id: user, display_name: 'Alex', totals_unit: 'lb', time_zone: 'America/Denver' },
    db: pgClient(db, user),
  };
}
const deps: Deps = {
  authenticate: async () => { throw new Error('not used'); },
  recentCallTimes: async () => [],
  logCall: async () => undefined,
  clientName: async () => 'ChatGPT',
};

interface Answer { isError?: boolean; out: Record<string, unknown>; code?: string; problems: Array<{ field: string; problem: string }>; message: string }
async function call(tool: string, args: Record<string, unknown>, user = a): Promise<Answer> {
  const r = await callTool(deps, caller(user), tool, args);
  const out = (r.structuredContent ?? {}) as Record<string, unknown>;
  const err = (out.error ?? {}) as { code?: string; message?: string; problems?: Answer['problems'] };
  return { isError: r.isError, out, code: err.code, problems: err.problems ?? [], message: err.message ?? String(out.message ?? '') };
}
const lines = (...l: string[]) => l;

const countCards = async () => Number((await one<{ n: string }>(`select count(*) as n from proposals where user_id = $1`, [a])).n);

/** Accepts a card as the app does (for a change to today: worked out with the phone's rules first). */
async function accept(card: string, user = a) {
  for (let i = 0; i < 3; i++) {
    const [row] = await db.as<{ c: unknown }>(user, `select proposal_context($1) as c`, [card]);
    const ctx = parse<ProposalContext>(row.c);
    const kind = ctx.proposal?.kind;
    let today: unknown = null;
    if (kind === 'today_change') {
      const d = todayDecision(ctx, Date.now());
      if ('wait' in d) return { ok: false, code: 'wait', message: d.wait, status: 'pending' } as Record<string, unknown>;
      today = d.send;
    }
    const [r] = await db.as<{ r: unknown }>(user, `select decide_proposal($1, true, null, $2) as r`, [card, today === null ? null : JSON.stringify(today)]);
    const answer = parse<Record<string, unknown>>(r.r);
    if (answer.code !== 'try_again') return answer;
  }
  throw new Error('kept changing');
}
const cardOf = (r: Answer) => r.out.proposal_id as string;
const stored = (card: string) => one<{ kind: string; applies_to: string; status: string; payload: Record<string, any>; source: string; expires_at: string | null; summary_lines: string[] }>(
  `select kind, applies_to, status, payload, source, expires_at, summary_lines from proposals where id = $1`, [card]);
const targetsOf = (card: string) => db.server<{ record_kind: string; record_id: string; version_seen: number }>(`select record_kind, record_id, version_seen from proposal_targets where proposal_id = $1`, [card]);

const alt = { bodyweight: 'Bodyweight Push-Up', basic_gym: 'Dumbbell Bench Press', full_gym: 'Barbell Bench Press' };
const newEx = (name: string, over: Record<string, unknown> = {}) => ({
  name, muscle_group: 'Chest', equipment: 'Dumbbell', default_unit: 'lb', work_seconds: 40, rest_seconds: 90, alternates: alt, ...over,
});

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
});

describe('what every propose tool does', () => {
  it('adds one pending card and nothing else, and tells the coach to say it is waiting', async () => {
    const before = await fingerprint(db);
    const r = await call('propose_exercise', { summary_lines: lines('Add Landmine Press'), ...newEx('Landmine Press') });
    expect(r.isError).toBeFalsy();
    expect(r.out).toMatchObject({ status: 'pending', applies_to: 'library' });
    expect(String(r.out.message)).toContain('waiting in the app');
    const after = await fingerprint(db);
    for (const t of Object.keys(before)) if (t !== 'proposals' && t !== 'connector_calls') expect(after[t], t).toEqual(before[t]);
    const card = await stored(cardOf(r));
    expect(card).toMatchObject({ kind: 'exercise', applies_to: 'library', status: 'pending' });
    expect(card.source.length).toBeGreaterThan(0);
    expect(card.summary_lines).toEqual(['Add Landmine Press']);
  });

  it('a repeat within a minute returns the first card, not a second', async () => {
    const args = { summary_lines: lines('Add Landmine Row'), ...newEx('Landmine Row') };
    const first = await call('propose_exercise', args);
    const n = await countCards();
    const again = await call('propose_exercise', { ...args });
    expect(cardOf(again)).toBe(cardOf(first));
    expect(String(again.out.message)).toContain('same proposal');
    expect(await countCards()).toBe(n);
  });

  it('refuses summary lines that are missing, empty or too long, and inputs it does not take', async () => {
    const n = await countCards();
    for (const args of [
      { ...newEx('Cable Fly Hold') },
      { summary_lines: [], ...newEx('Cable Fly Hold') },
      { summary_lines: [''], ...newEx('Cable Fly Hold') },
      { summary_lines: ['x'.repeat(301)], ...newEx('Cable Fly Hold') },
      { summary_lines: Array.from({ length: 21 }, () => 'a line'), ...newEx('Cable Fly Hold') },
      { summary_lines: lines('ok'), ...newEx('Cable Fly Hold'), user_id: b },
    ]) {
      const r = await call('propose_exercise', args);
      expect(r.code).toBe('invalid_input');
    }
    expect(await countCards()).toBe(n);
  });
});

describe('propose_exercise', () => {
  it('a new exercise is stored in the shape Accept applies, and Accept adds it with its three alternates', async () => {
    const r = await call('propose_exercise', { summary_lines: lines('Add Cable Y-Raise'), ...newEx('Cable Y-Raise', { muscle_group: 'chest', equipment: 'DUMBBELL', note: 'Light' }) });
    expect(r.isError).toBeFalsy();
    const card = await stored(cardOf(r));
    expect(card.payload).toMatchObject({ name: 'Cable Y-Raise', default_unit: 'lb', work_seconds: 40, rest_seconds: 90, note: 'Light', alternates: alt });
    expect(card.payload.muscle_group_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await targetsOf(cardOf(r))).toEqual([]);
    expect(await accept(cardOf(r))).toMatchObject({ ok: true, status: 'accepted' });
    const ex = await one<{ id: string; created_via: string }>(`select id, created_via from exercises where user_id = $1 and name = 'Cable Y-Raise'`, [a]);
    expect(ex.created_via).toBe('proposal');
    expect(Number((await one<{ n: string }>(`select count(*) as n from exercise_alternates where exercise_id = $1`, [ex.id])).n)).toBe(3);
  });

  it('says what is wrong, in the app\'s error codes, and adds nothing', async () => {
    const n = await countCards();
    const missing = await call('propose_exercise', { summary_lines: lines('x'), name: 'Floor Press', muscle_group: 'Chest', equipment: 'Dumbbell', default_unit: 'lb', work_seconds: 40, rest_seconds: 90, alternates: { bodyweight: 'Push-Up' } });
    expect(missing.code).toBe('invalid_input');
    expect(missing.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['alternates.basic_gym', 'alternates.full_gym']));
    const notAllThere = await call('propose_exercise', { summary_lines: lines('x'), name: 'Floor Press' });
    expect(notAllThere.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['muscle_group', 'equipment', 'default_unit', 'work_seconds', 'rest_seconds', 'alternates.bodyweight']));
    const vocab = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('Floor Press', { muscle_group: 'Pecs' }) });
    expect(vocab.code).toBe('unknown_vocabulary');
    expect(vocab.message).toContain('Chest');
    const equip = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('Floor Press', { equipment: 'Sandbag' }) });
    expect(equip.code).toBe('unknown_vocabulary');
    const focus = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('Floor Press', { focus: 'Left elbow' }) });
    expect(focus.code).toBe('unknown_vocabulary');
    const dup = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('dumbbell bench presses') });
    expect(dup.code).toBe('near_duplicate_name');
    expect(dup.message).toContain('Dumbbell Bench Press');
    const range = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('Floor Press', { work_seconds: 2, rest_seconds: 900 }) });
    expect(range.code).toBe('invalid_input');
    expect(range.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['work_seconds', 'rest_seconds']));
    const unit = await call('propose_exercise', { summary_lines: lines('x'), ...newEx('Floor Press', { default_unit: 'stone' }) });
    expect(unit.code).toBe('invalid_input');
    const ghost = await call('propose_exercise', { summary_lines: lines('x'), exercise: 'No Such Lift', note: 'hi' });
    expect(ghost.code).toBe('not_found');
    const nothing = await call('propose_exercise', { summary_lines: lines('x'), exercise: 'Barbell Curl' });
    expect(nothing.code).toBe('invalid_input');
    expect(await countCards()).toBe(n);
  });

  it('an edit names the exercise, targets its version, and goes out of date if the user edits it first', async () => {
    const curl = await id('Barbell Curl');
    const r = await call('propose_exercise', { summary_lines: lines('Barbell Curl rests longer'), exercise: 'Barbell Curl', rest_seconds: 150, alternates: { bodyweight: 'Towel Curl' } });
    expect(r.isError).toBeFalsy();
    expect((await stored(cardOf(r))).payload).toEqual({ exercise_id: curl, rest_seconds: 150, alternates: { bodyweight: 'Towel Curl' } });
    const t = await targetsOf(cardOf(r));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ record_kind: 'exercises', record_id: curl });
    expect(t[0].version_seen).toBe(Number((await one<{ version: number }>(`select version from exercises where id = $1`, [curl])).version));

    const stale = await call('propose_exercise', { summary_lines: lines('Curl note'), exercise: curl, note: 'Strict' });
    await db.server(`update exercises set note = 'user edit' where id = $1`, [curl]);
    expect((await stored(cardOf(stale))).status).toBe('out_of_date');
    expect(await accept(cardOf(stale))).toMatchObject({ ok: false, code: 'out_of_date' });
    expect(await accept(cardOf(r))).toMatchObject({ ok: false, code: 'out_of_date' });
    // The user's edit stands, and neither card changed anything.
    expect(await one(`select note, rest_seconds from exercises where id = $1`, [curl])).toMatchObject({ note: 'user edit' });
  });

  it('cannot reach another person\'s exercise', async () => {
    const theirs = await one<{ id: string }>(`select id from exercises where user_id = $1 limit 1`, [b]);
    const r = await call('propose_exercise', { summary_lines: lines('x'), exercise: theirs.id, note: 'hi' });
    expect(r.code).toBe('not_found');
  });
});

describe('propose_workout', () => {
  it('a new workout with a superset and a bundled new exercise is one card, and Accept adds all of it', async () => {
    const r = await call('propose_workout', {
      summary_lines: lines('New workout: Push Day', 'New exercise: Landmine Squeeze Press'),
      name: 'Push Day',
      items: [
        { exercise: 'Barbell Bench Press', sets: 3, reps: 8, superset: 'a' },
        { exercise: 'Landmine Squeeze Press', sets: 3, reps: 10, rest_seconds: 60, superset: 'A' },
        { exercise: 'Dumbbell Lateral Raise', sets: 2, reps: 15 },
      ],
      new_exercises: [newEx('Landmine Squeeze Press')],
    });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    const p = (await stored(cardOf(r))).payload;
    expect(p.name).toBe('Push Day');
    expect(p.new_exercises).toHaveLength(1);
    expect(p.new_exercises[0]).toMatchObject({ ref: 'Landmine Squeeze Press', name: 'Landmine Squeeze Press' });
    expect(p.items.map((i: any) => i.new_exercise ?? 'lib')).toEqual(['lib', 'Landmine Squeeze Press', 'lib']);
    expect(p.items[1]).toMatchObject({ superset_letter: 'A', rest_seconds: 60, sets: 3 });
    expect(await accept(cardOf(r))).toMatchObject({ ok: true, status: 'accepted' });
    const w = await one<{ id: string }>(`select id from workouts where user_id = $1 and name = 'Push Day'`, [a]);
    const items = await db.server<{ position: number; superset_letter: string | null; name: string }>(
      `select i.position, i.superset_letter, e.name from workout_items i join exercises e on e.id = i.exercise_id where i.workout_id = $1 order by i.position`, [w.id]);
    expect(items.map((i) => [i.name, i.superset_letter])).toEqual([['Barbell Bench Press', 'A'], ['Landmine Squeeze Press', 'A'], ['Dumbbell Lateral Raise', null]]);
  });

  it('an edit sets the whole list and targets the workout; editing the workout first makes it out of date', async () => {
    const w = await one<{ id: string }>(`select id from workouts where user_id = $1 and name = 'Push Day'`, [a]);
    const r = await call('propose_workout', { summary_lines: lines('Drop the raise'), workout: 'Push Day', items: [
      { exercise: 'Barbell Bench Press', sets: 4, reps: 6, superset: 'A' }, { exercise: 'Landmine Squeeze Press', sets: 4, reps: 10, superset: 'A' }] });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    expect(await targetsOf(cardOf(r))).toMatchObject([{ record_kind: 'workouts', record_id: w.id }]);
    await db.server(`update workouts set name = 'Push Day 2' where id = $1`, [w.id]);
    expect(await accept(cardOf(r))).toMatchObject({ ok: false, code: 'out_of_date' });
  });

  it('refuses what the brief says to refuse, each with a way to fix it', async () => {
    const n = await countCards();
    const four = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: ['Barbell Bench Press', 'Barbell Curl', 'Barbell Back Squat', 'Dumbbell Lateral Raise'].map((e) => ({ exercise: e, sets: 3, reps: 8, superset: 'A' })) });
    expect(four.code).toBe('invalid_input');
    expect(four.problems[0].problem).toContain('A superset holds two or three exercises');
    const alone = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Barbell Curl', sets: 3, reps: 8, superset: 'B' }] });
    expect(alone.problems[0].problem).toContain('only 1 exercise');
    const uneven = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Barbell Curl', sets: 3, reps: 8, superset: 'B' }, { exercise: 'Barbell Back Squat', sets: 4, reps: 8, superset: 'B' }] });
    expect(uneven.problems[0].problem).toContain('same number of sets');
    const ghost = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Zercher Squat Thing', sets: 3, reps: 8 }] });
    expect(ghost.code).toBe('not_found');
    const range = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Barbell Curl', sets: 13, reps: 0 }] });
    expect(range.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['items.0.sets', 'items.0.reps']));
    const noName = await call('propose_workout', { summary_lines: lines('x'), items: [{ exercise: 'Barbell Curl', sets: 3, reps: 8 }] });
    expect(noName.code).toBe('invalid_input');
    const dupNew = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Dumbbell Press Bench', sets: 3, reps: 8 }], new_exercises: [newEx('Dumbbell Press Bench')] });
    expect(dupNew.code).toBe('near_duplicate_name');
    const twins = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Hammer Thing', sets: 3, reps: 8 }], new_exercises: [newEx('Hammer Thing'), newEx('hammer things')] });
    expect(twins.code).toBe('near_duplicate_name');
    const archived = await one<{ id: string }>(`insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via, archived_at)
      select $1, 'Retired Lift', muscle_group_id, equipment_id, 'lb', 'planner', now() from exercises where user_id = $1 limit 1 returning id`, [a]);
    expect(archived.id).toBeTruthy();
    const arch = await call('propose_workout', { summary_lines: lines('x'), name: 'Big', items: [{ exercise: 'Retired Lift', sets: 3, reps: 8 }] });
    expect(arch.code).toBe('invalid_input');
    expect(arch.message).toContain('archived');
    expect(await countCards()).toBe(n);
  });
});

describe('propose_campaign', () => {
  it('a new campaign with new exercises and a new workout is one card; Accept makes a draft with its days and overrides', async () => {
    const pushDay = await one<{ id: string }>(`select id from workouts where user_id = $1 and name like 'Push Day%' limit 1`, [a]);
    const r = await call('propose_campaign', {
      summary_lines: lines('New 4-week block', 'Three new exercises', 'New workout: Pull Day'),
      name: 'Block A', start_date: '2026-12-07', week_count: 4,
      new_exercises: [newEx('Chest Supported Row Hold', { muscle_group: 'Back' }), newEx('Cable Face Pull Hold', { muscle_group: 'Back' }), newEx('Rope Hammer Hold', { muscle_group: 'Back' })],
      new_workouts: [{ name: 'Pull Day', items: [
        { exercise: 'Chest Supported Row Hold', sets: 4, reps: 8 }, { exercise: 'Cable Face Pull Hold', sets: 3, reps: 12, superset: 'A' }, { exercise: 'Rope Hammer Hold', sets: 3, reps: 12, superset: 'A' }] }],
      days: [
        { week: 1, weekday: 1, workout: pushDay.id, overrides: [{ exercise: 'Barbell Bench Press', reps: 5, weight: { value: 100, unit: 'kg' } }] },
        { week: 1, weekday: 3, workout: 'pull day' },
        { week: 1, weekday: 5, rest: true },
      ],
    });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    const p = (await stored(cardOf(r))).payload;
    expect(p.new_exercises).toHaveLength(3);
    expect(p.new_workouts[0]).toMatchObject({ ref: 'Pull Day', name: 'Pull Day' });
    expect(p.days[0]).toMatchObject({ week: 1, weekday: 1, workout_id: pushDay.id });
    expect(p.days[0].overrides[0]).toMatchObject({ item: 0, reps: 5, weight_entered_value: 100, weight_entered_unit: 'kg' });
    expect(p.days[0].overrides[0].weight_lb).toBeCloseTo(220.462, 2);
    expect(p.days[1]).toEqual({ week: 1, weekday: 3, new_workout: 'Pull Day' });
    expect(p.days[2]).toEqual({ week: 1, weekday: 5, rest: true });
    expect(await accept(cardOf(r))).toMatchObject({ ok: true, status: 'accepted' });
    const camp = await one<{ id: string; status: string }>(`select id, status from campaigns where user_id = $1 and name = 'Block A'`, [a]);
    expect(camp.status).toBe('draft');
    expect(Number((await one<{ n: string }>(`select count(*) as n from campaign_days where campaign_id = $1`, [camp.id])).n)).toBe(2);
    expect(Number((await one<{ n: string }>(`select count(*) as n from campaign_day_overrides where weight_lb is not null and campaign_day_id in (select id from campaign_days where campaign_id = $1)`, [camp.id])).n)).toBe(1);
  });

  it('refuses a bad week, a missing row, a lopsided superset and a bad shift, and adds nothing', async () => {
    const n = await countCards();
    const draft = await one<{ id: string }>(`select id from campaigns where user_id = $1 and name = 'Block A'`, [a]);
    const late = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, days: [{ week: 5, weekday: 1, workout: 'Pull Day' }] });
    expect(late.problems[0].problem).toContain('past the campaign');
    const six = await call('propose_campaign', { summary_lines: lines('x'), name: 'Long', start_date: '2026-12-07', week_count: 7, days: [{ week: 1, weekday: 1, rest: true }] });
    expect(six.code).toBe('invalid_input');
    const stray = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, days: [{ week: 1, weekday: 1, workout: 'Pull Day', overrides: [{ exercise: 'Barbell Curl', sets: 4 }] }] });
    expect(stray.problems[0].problem).toContain('not in that day\'s workout');
    const uneven = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, days: [{ week: 1, weekday: 1, workout: 'Pull Day', overrides: [{ exercise: 'Cable Face Pull Hold', sets: 5 }] }] });
    expect(uneven.problems[0].problem).toContain('same number of sets');
    const both = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, days: [{ week: 1, weekday: 1, workout: 'Pull Day', rest: true }] });
    expect(both.code).toBe('invalid_input');
    const noDays = await call('propose_campaign', { summary_lines: lines('x'), name: 'Empty', start_date: '2026-12-07', week_count: 2 });
    expect(noDays.problems.map((p) => p.field)).toContain('days');
    const lonelyShift = await call('propose_campaign', { summary_lines: lines('x'), shift_forward_weeks: 1 });
    expect(lonelyShift.code).toBe('invalid_input');
    const mixedShift = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, shift_forward_weeks: 1, name: 'Renamed' });
    expect(mixedShift.code).toBe('invalid_input');
    const noCampaign = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: '3f2b1c9e-0000-4000-8000-000000000000', name: 'Renamed' });
    expect(noCampaign.code).toBe('not_found');
    const ghostWorkout = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, days: [{ week: 1, weekday: 2, workout: 'Nope Day' }] });
    expect(ghostWorkout.code).toBe('not_found');
    expect(await countCards()).toBe(n);
  });

  it('a shift stands alone, targets the campaign, and Accept adds a blank week', async () => {
    const draft = await one<{ id: string }>(`select id from campaigns where user_id = $1 and name = 'Block A'`, [a]);
    await db.server(`update campaigns set status = 'active' where id = $1`, [draft.id]);
    const r = await call('propose_campaign', { summary_lines: lines('Shift the block a week'), campaign_id: draft.id, shift_forward_weeks: 1 });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    expect((await stored(cardOf(r))).payload).toEqual({ campaign_id: draft.id, shift_forward_weeks: 1 });
    expect(await targetsOf(cardOf(r))).toMatchObject([{ record_kind: 'campaigns', record_id: draft.id }]);
    expect(await accept(cardOf(r))).toMatchObject({ ok: true, status: 'accepted' });
    expect(Number((await one<{ n: string }>(`select count(*) as n from campaign_shifts where campaign_id = $1`, [draft.id])).n)).toBe(1);
    await db.server(`update campaigns set status = 'finished' where id = $1`, [draft.id]);
    const finished = await call('propose_campaign', { summary_lines: lines('x'), campaign_id: draft.id, shift_forward_weeks: 1 });
    expect(finished.code).toBe('invalid_input');
  });
});

describe('propose_today_change', () => {
  it('with nothing planned and nothing running there is nothing to change', async () => {
    const r = await call('propose_today_change', { summary_lines: lines('x'), changes: [{ action: 'remove', exercise: 'Barbell Curl' }] });
    expect(r.code).toBe('nothing_to_change');
  });

  it('works on today\'s plan: a card for today that ends at the rollover, applied with the phone\'s own rules', async () => {
    const [bench, row, curl] = [await id('Barbell Bench Press'), await id('Barbell Bent-Over Row'), await id('Barbell Curl')];
    await db.server(`insert into today_plans (user_id, local_date, source_kind, workout_id, plan, made_by) values ($1, $2, 'workout', null, $3, 'user')`,
      [a, today, JSON.stringify([
        { exercise_id: bench, sets: 3, reps: 8, superset_letter: 'A' }, { exercise_id: row, sets: 3, reps: 8, superset_letter: 'A' }, { exercise_id: curl, sets: 3, reps: 10 }])]);

    // Needs the superset matched, or broken first.
    const lopsided = await call('propose_today_change', { summary_lines: lines('x'), changes: [{ action: 'set_sets', exercise: 'Barbell Bench Press', sets: 4 }] });
    expect(lopsided.code).toBe('invalid_input');
    expect(lopsided.problems[0].problem).toContain('break_superset');
    const matched = await call('propose_today_change', { summary_lines: lines('x'), changes: [
      { action: 'set_sets', exercise: 'Barbell Bench Press', sets: 4 }, { action: 'set_sets', exercise: 'Barbell Bent-Over Row', sets: 4 }] });
    expect(matched.isError, JSON.stringify(matched)).toBeFalsy();
    const broken = await call('propose_today_change', { summary_lines: lines('x'), changes: [
      { action: 'break_superset', superset: 'a' }, { action: 'set_sets', exercise: 'Barbell Bench Press', sets: 5 }] });
    expect(broken.isError, JSON.stringify(broken)).toBeFalsy();
    const again = await call('propose_today_change', { summary_lines: lines('x'), changes: [{ action: 'break_superset', superset: 'A' }, { action: 'break_superset', exercise: 'Barbell Curl' }] });
    expect(again.code).toBe('invalid_input');

    const bad = [
      [{ action: 'swap', exercise: 'Barbell Back Squat', to_exercise: 'Barbell Curl' }, 'is not in today\'s workout'],
      [{ action: 'swap', exercise: 'Barbell Curl' }, 'swap needs'],
      [{ action: 'set_reps', exercise: 'Barbell Curl', reps: 12, sets: 3 }, 'does not take'],
      [{ action: 'reorder', exercise: 'Barbell Curl' }, 'reorder needs'],
      [{ action: 'break_superset' }, 'letter'],
    ] as const;
    for (const [change, text] of bad) {
      const r = await call('propose_today_change', { summary_lines: lines('x'), changes: [change] });
      expect(r.code, text).toBe('invalid_input');
      expect(JSON.stringify(r.problems), text).toContain(text);
    }

    // A swap, taken straight into today's plan.
    const swap = await call('propose_today_change', { summary_lines: lines('Barbell Bench Press becomes Dumbbell Bench Press'), changes: [{ action: 'swap', exercise: 'Barbell Bench Press', to_exercise: 'Dumbbell Bench Press' }] });
    expect(swap.isError, JSON.stringify(swap)).toBeFalsy();
    expect(swap.out.applies_to).toBe('today');
    const card = await stored(cardOf(swap));
    expect(card.payload).toEqual({ local_date: today, changes: [{ action: 'swap', exercise_id: bench, to_exercise_id: await id('Dumbbell Bench Press') }] });
    expect(card.expires_at).toBeTruthy();
    expect(Date.parse(card.expires_at!)).toBeGreaterThan(Date.now());
    expect(await accept(cardOf(swap))).toMatchObject({ ok: true, status: 'accepted' });
    const plan = await one<{ plan: unknown }>(`select plan from today_plans where user_id = $1 and local_date = $2 and consumed_at is null order by created_at desc limit 1`, [a, today]);
    expect(JSON.stringify(plan.plan)).toContain(await id('Dumbbell Bench Press'));
  });

  it('weights in kilograms become pounds, and add and remove carry their numbers', async () => {
    const r = await call('propose_today_change', { summary_lines: lines('Lighter curls, add raises'), changes: [
      { action: 'set_weight', exercise: 'Barbell Curl', weight: { value: 20, unit: 'kg' } },
      { action: 'add', exercise: 'Dumbbell Lateral Raise', sets: 2, reps: 15, weight: { value: 10, unit: 'lb' }, rest_seconds: 45, position: 1 },
      { action: 'remove', exercise: 'Barbell Bent-Over Row' }] });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    const ch = (await stored(cardOf(r))).payload.changes;
    expect(ch[0].weight_lb).toBeCloseTo(44.092, 2);
    expect(ch[1]).toMatchObject({ action: 'add', sets: 2, reps: 15, weight_lb: 10, rest_seconds: 45, position: 1 });
    expect(ch[2]).toMatchObject({ action: 'remove' });
  });

  it('in a running workout it will not touch what is done, and will not cut below the sets logged', async () => {
    const curl = await id('Barbell Curl');
    const bench = await id('Barbell Bench Press');
    const sess = await one<{ id: string }>(`insert into sessions (user_id, local_date, source_kind, workout_name, started_at) values ($1, $2, 'ad_hoc', 'Live', now()) returning id`, [a, today]);
    const block = await one<{ id: string }>(`insert into session_blocks (user_id, session_id, position, time_budget_seconds) values ($1, $2, 0, 450) returning id`, [a, sess.id]);
    const open = await one<{ id: string }>(`insert into session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds)
      values ($1, $2, $3, $4, 'Barbell Curl', '{working,working,working}', 8, 90, 45) returning id`, [a, sess.id, block.id, curl]);
    await db.server(`insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at) values ($1, $2, 1, 60, 60, 'lb', 8, now()), ($1, $2, 2, 60, 60, 'lb', 8, now())`, [a, open.id]);
    const blockB = await one<{ id: string }>(`insert into session_blocks (user_id, session_id, position, time_budget_seconds) values ($1, $2, 1, 450) returning id`, [a, sess.id]);
    await db.server(`insert into session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds, state)
      values ($1, $2, $3, $4, 'Barbell Bench Press', '{working}', 8, 90, 45, 'done')`, [a, sess.id, blockB.id, bench]);

    const cut = await call('propose_today_change', { summary_lines: lines('x'), changes: [{ action: 'set_sets', exercise: 'Barbell Curl', sets: 1 }] });
    expect(cut.code).toBe('invalid_input');
    expect(cut.message + JSON.stringify(cut.problems)).toContain('2 sets logged');
    const done = await call('propose_today_change', { summary_lines: lines('x'), changes: [{ action: 'set_reps', exercise: 'Barbell Bench Press', reps: 5 }] });
    expect(done.code).toBe('invalid_input');
    expect(JSON.stringify(done.problems)).toContain('already done');
    const fine = await call('propose_today_change', { summary_lines: lines('Four sets of curls'), changes: [{ action: 'set_sets', exercise: 'Barbell Curl', sets: 4 }] });
    expect(fine.isError, JSON.stringify(fine)).toBeFalsy();
    await db.server(`delete from set_logs where session_exercise_id = $1`, [open.id]);
    await db.server(`delete from sessions where id = $1`, [sess.id]);
  });
});

describe('propose_profile_update', () => {
  it('an intake and a new gym are one card; Accept applies the profile and the gym', async () => {
    const r = await call('propose_profile_update', {
      summary_lines: lines('Coach style: challenging', 'Priorities: strength, then climbing', 'New gym: Garage'),
      coach_style: 'challenging', experience: 'intermediate', progression_pace: 'steady', workout_minutes: 60, days_per_week: 4, variety: 'some',
      priorities: [{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }], goals: 'Bench 225 by March', exercises_to_avoid: 'Upright rows',
      gym: { name: 'Garage', equipment: ['dumbbell', 'Barbell'], notes: 'Rack and plates', make_default: true },
    });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    expect(r.out.applies_to).toBe('profile');
    const p = (await stored(cardOf(r))).payload;
    expect(p.profile.priorities).toEqual([{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }]);
    expect(p.gym.equipment).toEqual(['dumbbell', 'barbell']);
    expect(await accept(cardOf(r))).toMatchObject({ ok: true, status: 'accepted' });
    const c = await one<Record<string, unknown>>(`select * from coach_profiles where user_id = $1`, [a]);
    expect(c).toMatchObject({ coach_style: 'challenging', experience: 'intermediate', progression_pace: 'steady', workout_minutes: 60, days_per_week: 4, variety: 'some', goals: 'Bench 225 by March', exercises_to_avoid: 'Upright rows' });
    expect(parse<unknown[]>(c.priorities)).toEqual([{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }]);
    expect(await one(`select name, is_default from gyms where user_id = $1 and name = 'Garage'`, [a])).toMatchObject({ is_default: true });
  });

  it('targets the profile and the gym by version, and goes out of date when either is edited', async () => {
    const gym = await one<{ id: string }>(`select id from gyms where user_id = $1 and name = 'Garage'`, [a]);
    const r = await call('propose_profile_update', { summary_lines: lines('Faster pace', 'Garage notes'), progression_pace: 'moderate', gym: { gym: 'garage', notes: 'Rack, plates, bands' } });
    expect(r.isError, JSON.stringify(r)).toBeFalsy();
    const t = await targetsOf(cardOf(r));
    expect(t.map((x) => x.record_kind).sort()).toEqual(['coach_profiles', 'gyms']);
    expect(t.find((x) => x.record_kind === 'coach_profiles')!.record_id).toBe(a);
    expect(t.find((x) => x.record_kind === 'gyms')!.record_id).toBe(gym.id);
    await db.server(`update coach_profiles set notes = 'edited by the user' where user_id = $1`, [a]);
    expect((await stored(cardOf(r))).status).toBe('out_of_date');
    expect(await accept(cardOf(r))).toMatchObject({ ok: false, code: 'out_of_date' });
  });

  it('refuses unknown values, a missing intake word, a bad count, and an empty proposal', async () => {
    const n = await countCards();
    const equip = await call('propose_profile_update', { summary_lines: lines('x'), gym: { name: 'Studio', equipment: ['Sandbag'] } });
    expect(equip.code).toBe('unknown_vocabulary');
    const style = await call('propose_profile_update', { summary_lines: lines('x'), coach_style: 'drill sergeant' });
    expect(style.code).toBe('invalid_input');
    const four = await call('propose_profile_update', { summary_lines: lines('x'), priorities: ['strength', 'muscle', 'fat_loss', 'habit'].map((value) => ({ value })) });
    expect(four.code).toBe('invalid_input');
    const other = await call('propose_profile_update', { summary_lines: lines('x'), priorities: [{ value: 'other' }] });
    expect(other.problems[0].problem).toContain('needs its text');
    const twice = await call('propose_profile_update', { summary_lines: lines('x'), priorities: [{ value: 'strength' }, { value: 'strength' }] });
    expect(twice.code).toBe('invalid_input');
    const minutes = await call('propose_profile_update', { summary_lines: lines('x'), workout_minutes: 5, days_per_week: 9 });
    expect(minutes.problems.map((p) => p.field)).toEqual(expect.arrayContaining(['workout_minutes', 'days_per_week']));
    const empty = await call('propose_profile_update', { summary_lines: lines('x') });
    expect(empty.code).toBe('invalid_input');
    const ghost = await call('propose_profile_update', { summary_lines: lines('x'), gym: { gym: 'Nowhere', name: 'Else' } });
    expect(ghost.code).toBe('not_found');
    const noName = await call('propose_profile_update', { summary_lines: lines('x'), gym: { equipment: ['dumbbell'] } });
    expect(noName.code).toBe('invalid_input');
    expect(await countCards()).toBe(n);
  });
});

describe('the propose tools and the rest of the app', () => {
  it('a coach on one account cannot propose against the other\'s data', async () => {
    const theirWorkout = await one<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Blair Only') returning id`, [b]);
    const r = await call('propose_workout', { summary_lines: lines('x'), workout: theirWorkout.id, name: 'Mine now' });
    expect(r.code).toBe('not_found');
    const theirs = await one<{ id: string }>(`select id from gyms where user_id = $1 limit 1`, [b]).catch(() => undefined);
    if (theirs) expect((await call('propose_profile_update', { summary_lines: lines('x'), gym: { gym: theirs.id, notes: 'hi' } })).code).toBe('not_found');
  });
});
