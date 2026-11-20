// Deciding a day sent from the planner (spec Section 10, "Days and campaigns"
// and "Proposals"; design Section 2, "Sending a day from the planner", and
// Section 5, Proposal). Accept makes it today's workout for today only and
// never changes the library or the campaign; Dismiss changes nothing; a
// workout running at Accept is split, and the phone still holding it cannot
// reopen or overwrite it.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { addExercise, logSet, startExercise, startSession, type PlanItem, type Session } from '@/rules/session';
import { restChange, sessionChanges, type NewChange, type SyncAnswer } from '@/rules/sync';
import { planItems, planName } from '@/rules/today';

let db: Db;
let a: string;
let b: string;
const ex: Record<string, string> = {};
let bBench: string;
let workout: string;
let day: string;

const parse = <T,>(v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as T;

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  for (const name of ['Barbell Bench Press', 'Barbell Bent-Over Row', 'Barbell Curl', 'Bodyweight Push-Up', 'Dumbbell Lateral Raise']) {
    ex[name] = (await db.server<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [a, name]))[0].id;
  }
  bBench = (await db.server<{ id: string }>(`select id from exercises where user_id = $1 and name = 'Barbell Bench Press'`, [b]))[0].id;
  // A's library workout and active campaign, with a day override.
  workout = (await db.server<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Push A') returning id`, [a]))[0].id;
  const items = (await db.server<{ id: string }>(
    `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
     values ($1, $2, 0, $3, 3, 8, 'A'), ($1, $2, 1, $4, 3, 8, 'A'), ($1, $2, 2, $5, 3, 10, null) returning id`,
    [a, workout, ex['Barbell Bench Press'], ex['Barbell Bent-Over Row'], ex['Barbell Curl']])).map((r) => r.id);
  const camp = (await db.server<{ id: string }>(`insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Base', '2026-11-16', 4, 'active') returning id`, [a]))[0].id;
  day = (await db.server<{ id: string }>(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 5, $3) returning id`, [a, camp, workout]))[0].id;
  await db.server(`insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 12)`, [a, day, workout, items[2]]);
});

const finishAllActive = () => db.server(`update sessions set status = 'finished', ended_at = now(), finish_reason = 'user' where status = 'active'`);
beforeEach(finishAllActive);

/** The card the planner adds when today already has a workout. */
const payload = (over: Record<string, unknown> = {}) => ({
  local_date: '2026-11-20',
  workout_name: 'Pull B',
  workout_id: null,
  campaign_day_id: null,
  plan_items: [
    { exercise_id: ex['Barbell Bent-Over Row'], sets: 4, reps: 8, rest_seconds: 90 },
    { exercise_id: ex['Barbell Curl'], sets: 3, reps: 12, superset_letter: 'B' },
    { exercise_id: ex['Dumbbell Lateral Raise'], sets: 3, reps: 15, superset_letter: 'B', weight_lb: 20 },
  ],
  replaces: 'Push A',
  ...over,
});

async function card(user: string, over: Record<string, unknown> = {}, extra: { source?: string; expires?: string; coach?: boolean } = {}) {
  const [row] = await db.as<{ id: string }>(user,
    `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload, expires_at)
     values ($1, $2, 'today_change', 'today', '{"Pull B replaces Push A today"}', $3, coalesce($4::timestamptz, now() + interval '6 hours')) returning id`,
    [user, extra.source ?? 'planner', JSON.stringify(payload(over)), extra.expires ?? null], { coach: extra.coach });
  return row.id;
}

interface Answer { ok: boolean; status: string | null; code?: string; message: string; today_plan_id?: string; replaced_session_id?: string | null }
async function decide(user: string, id: string, accept: boolean, opts?: { coach?: boolean }) {
  const [row] = await db.as<{ r: unknown }>(user, `select decide_planner_proposal($1, $2) as r`, [id, accept], opts);
  return parse<Answer>(row.r);
}

const proposalRow = async (id: string) => (await db.server<{ status: string; decided_at: string | null; result: unknown }>(
  `select status, decided_at, result from proposals where id = $1`, [id]))[0];
const plansFor = (id: string) => db.server<{ id: string; local_date: string; source_kind: string; workout_id: string | null; campaign_day_id: string | null; plan: unknown; made_by: string }>(
  `select id, to_char(local_date, 'YYYY-MM-DD') as local_date, source_kind, workout_id, campaign_day_id, plan, made_by from today_plans where made_by = 'proposal:' || $1::text`, [id]);

/** Everything in A's library and campaigns, versions and timestamps included. */
async function libraryAndCampaign(user: string) {
  const out: Record<string, unknown> = {};
  for (const t of ['exercises', 'exercise_alternates', 'exercise_display_units', 'workouts', 'workout_items', 'campaigns', 'campaign_days', 'campaign_shifts', 'campaign_day_overrides', 'vocabulary_terms']) {
    out[t] = await db.server(`select to_jsonb(x) as r from ${t} x where user_id = $1 order by 1`, [user]);
  }
  return JSON.stringify(out);
}

// ---------------------------------------------------------------- the phone

const T0 = Date.now() - 20 * 60000; // a workout started 20 minutes ago
const plan = (names: string[]): PlanItem[] => names.map((n) => ({
  exerciseId: ex[n], name: n, muscle: '', equipment: '', unit: n === 'Bodyweight Push-Up' ? 'bw' : 'lb', assisted: false,
  loadCount: 1, work: 45, rest: 90, sets: 3, reps: 8, alternates: [],
}));
const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const lbSet = (lb: number, reps = 8) => ({ lb, enteredValue: lb, enteredUnit: 'lb' as const, reps });

async function send(user: string, cs: NewChange[]): Promise<SyncAnswer> {
  const wire = cs.map((c) => ({ id: crypto.randomUUID(), kind: c.kind, data: c.data }));
  const [row] = await db.as<{ r: unknown }>(user, `select apply_changes($1::jsonb) as r`, [JSON.stringify(wire)]);
  return parse<SyncAnswer>(row.r);
}

/** A's phone, mid-workout on today's campaign day: two sets of bench logged, curl not reached, rest running. */
async function midWorkout() {
  let s: Session = { ...startSession('Push A', '2026-11-20', plan(['Barbell Bench Press', 'Barbell Curl']), {}, T0, noSeed, workout), campaignDayId: day };
  const sent: NewChange[] = [...sessionChanges(null, s)];
  const step = (next: Session) => { sent.push(...sessionChanges(s, next)); s = next; };
  step(startExercise(s, T0 + 60000));
  step(logSet(s, lbSet(135), {}, T0 + 120000).session);
  step(logSet(s, lbSet(145), {}, T0 + 240000).session);
  const r = await send(a, [...sent, restChange(s.id, Date.now() + 90000)]);
  expect(r.rejected).toEqual([]);
  return s;
}

// ---------------------------------------------------------------- tests

describe('Accept, with no workout running', () => {
  it("makes the sent day today's prepared plan, for today only", async () => {
    const id = await card(a, { workout_id: workout });
    const r = await decide(a, id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted', replaced_session_id: null });
    const [tp] = await plansFor(id);
    expect(tp).toMatchObject({ id: r.today_plan_id, local_date: '2026-11-20', source_kind: 'workout', workout_id: workout, campaign_day_id: null, made_by: `proposal:${id}` });
    // The phone reads the plan exactly as sent, with the card's name.
    expect(planItems(tp.plan)).toEqual([
      { exerciseId: ex['Barbell Bent-Over Row'], sets: 4, reps: 8, rest: 90, superset: null, weightLb: null },
      { exerciseId: ex['Barbell Curl'], sets: 3, reps: 12, rest: null, superset: 'B', weightLb: null },
      { exerciseId: ex['Dumbbell Lateral Raise'], sets: 3, reps: 15, rest: null, superset: 'B', weightLb: 20 },
    ]);
    expect(planName(tp.plan)).toBe('Pull B');
    const p = await proposalRow(id);
    expect(p.status).toBe('accepted');
    expect(p.decided_at).not.toBeNull();
    expect(parse(p.result)).toEqual({ today_plan_id: r.today_plan_id, replaced_session_id: null });
  });

  it("a campaign day's card makes a plan from that day", async () => {
    const id = await card(a, { workout_id: workout, campaign_day_id: day });
    expect((await decide(a, id, true)).ok).toBe(true);
    const [tp] = await plansFor(id);
    expect([tp.source_kind, tp.campaign_day_id]).toEqual(['campaign_day', day]);
  });
});

describe('Accept mid-workout splits the running session', () => {
  it('saves the work done as its own ad hoc workout, and the sent day starts afterwards', async () => {
    const s = await midWorkout();
    const recordsBefore = await db.as(a, `select l.id, l.record_types from set_logs l join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1 order by l.set_number`, [s.id]);
    const id = await card(a);
    const r = await decide(a, id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted', replaced_session_id: s.id });

    const [row] = await db.as<{ status: string; finish_reason: string; source_kind: string; campaign_day_id: string | null; ended_at: string; clock_running_since: string | null; rest_ends_at: string | null; clock_banked_seconds: string }>(a,
      `select status, finish_reason, source_kind, campaign_day_id, ended_at, clock_running_since, rest_ends_at, clock_banked_seconds from sessions where id = $1`, [s.id]);
    expect(row).toMatchObject({ status: 'finished', finish_reason: 'replaced', source_kind: 'ad_hoc', campaign_day_id: null, clock_running_since: null, rest_ends_at: null });
    // Ended at its last logged step, with the clocks cut back to it.
    expect(new Date(row.ended_at).getTime()).toBe(T0 + 240000);
    expect(Number(row.clock_banked_seconds)).toBe(240);
    const blocks = await db.as<{ clock_banked_seconds: string; clock_running_since: string | null }>(a,
      `select clock_banked_seconds, clock_running_since from session_blocks where session_id = $1 order by position`, [s.id]);
    expect(Number(blocks[0].clock_banked_seconds)).toBe(180);
    expect(blocks.every((x) => x.clock_running_since === null)).toBe(true);
    // Bench, with sets logged, is Done; Curl, not reached, is Replaced (not Skipped).
    const states = await db.as<{ exercise_name_then: string; state: string }>(a,
      `select exercise_name_then, state from session_exercises where session_id = $1 order by exercise_name_then`, [s.id]);
    expect(states).toEqual([{ exercise_name_then: 'Barbell Bench Press', state: 'done' }, { exercise_name_then: 'Barbell Curl', state: 'replaced' }]);
    // Logged sets and their records are kept as they were.
    const recordsAfter = await db.as(a, `select l.id, l.record_types from set_logs l join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1 order by l.set_number`, [s.id]);
    expect(recordsAfter).toEqual(recordsBefore);
    expect(recordsAfter.length).toBe(2);
    // Its rest alert is cancelled.
    const alerts = await db.server<{ status: string }>(`select status from rest_alerts where session_id = $1`, [s.id]);
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.every((x) => x.status === 'cancelled')).toBe(true);
    // Nothing is running now; the sent day waits as today's plan.
    expect(await db.as(a, `select id from sessions where status = 'active'`)).toEqual([]);
    expect((await plansFor(id)).length).toBe(1);
    expect(parse<{ replaced_session_id: string }>((await proposalRow(id)).result).replaced_session_id).toBe(s.id);
  });

  it('a phone still holding the replaced workout cannot reopen or overwrite it, is told, and its late sets are kept', async () => {
    let s = await midWorkout();
    const id = await card(a);
    await decide(a, id, true);

    // The phone did not know: it logs a third set, adds an exercise and logs on it, all offline.
    const late: NewChange[] = [];
    const step = (next: Session) => { late.push(...sessionChanges(s, next)); s = next; };
    step(logSet(s, lbSet(150), {}, T0 + 400000).session);
    step(addExercise(s, plan(['Bodyweight Push-Up'])[0], noSeed));
    const pushKey = Object.values(s.exercises).find((e) => e.exerciseId === ex['Bodyweight Push-Up'])!.key;
    step(startExercise({ ...s, curBlock: s.blocks.at(-1)!.id, curMember: pushKey }, T0 + 420000));
    step(logSet(s, { lb: null, enteredValue: 1, enteredUnit: 'bw', reps: 20 }, {}, T0 + 450000).session);
    const r = await send(a, late);
    expect(r.rejected).toEqual([]);
    expect(r.conflict).toBeNull();
    expect(r.replaced).toEqual([s.id]);

    // Still finished as replaced, at the same end, as an ad hoc workout.
    const [row] = await db.as<{ status: string; finish_reason: string; source_kind: string; campaign_day_id: string | null; ended_at: string }>(a,
      `select status, finish_reason, source_kind, campaign_day_id, ended_at from sessions where id = $1`, [s.id]);
    expect(row).toMatchObject({ status: 'finished', finish_reason: 'replaced', source_kind: 'ad_hoc', campaign_day_id: null });
    expect(new Date(row.ended_at).getTime()).toBe(T0 + 240000);
    // Every set is kept, the new exercise too; an exercise that got a set is Done.
    const states = await db.as<{ exercise_name_then: string; state: string; n: number }>(a,
      `select se.exercise_name_then, se.state, count(l.id)::int as n from session_exercises se
       left join set_logs l on l.session_exercise_id = se.id and l.deleted_at is null
       where se.session_id = $1 group by 1, 2 order by 1`, [s.id]);
    expect(states).toEqual([
      { exercise_name_then: 'Barbell Bench Press', state: 'done', n: 3 },
      { exercise_name_then: 'Barbell Curl', state: 'replaced', n: 0 },
      { exercise_name_then: 'Bodyweight Push-Up', state: 'done', n: 1 },
    ]);
    expect(await db.as(a, `select id from sessions where status = 'active'`)).toEqual([]);
  });

  it('the sent day starts as a new session that names the one it split from, with no "other workout" conflict from the old phone', async () => {
    const old = await midWorkout();
    const id = await card(a);
    const r = await decide(a, id, true);
    const next = { ...startSession('Pull B', '2026-11-20', plan(['Barbell Bent-Over Row']), {}, Date.now(), noSeed), todayPlanId: r.today_plan_id! };
    expect((await send(a, sessionChanges(null, next))).rejected).toEqual([]);
    const [row] = await db.as<{ status: string; split_from_session_id: string }>(a, `select status, split_from_session_id from sessions where id = $1`, [next.id]);
    expect(row).toEqual({ status: 'active', split_from_session_id: old.id });
    const [tp] = await plansFor(id);
    expect((await db.as<{ consumed_at: string | null }>(a, `select consumed_at from today_plans where id = $1`, [tp.id]))[0].consumed_at).not.toBeNull();
    // The old phone's late copy, still "active", neither clashes with the new one nor reopens.
    const stale = await send(a, sessionChanges(null, logSet(old, lbSet(150), {}, T0 + 400000).session));
    expect(stale.conflict).toBeNull();
    expect(stale.replaced).toEqual([old.id]);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [old.id]))[0].status).toBe('finished');
    expect((await db.as<{ id: string }>(a, `select id from sessions where status = 'active'`)).map((x) => x.id)).toEqual([next.id]);
  });

  it('a finished workout is not split: Accept leaves it alone', async () => {
    const s = await midWorkout();
    await finishAllActive();
    const id = await card(a);
    const r = await decide(a, id, true);
    expect(r.replaced_session_id).toBeNull();
    expect((await db.as<{ finish_reason: string }>(a, `select finish_reason from sessions where id = $1`, [s.id]))[0].finish_reason).toBe('user');
  });
});

describe('Dismiss', () => {
  it('ends the card as declined and changes nothing else', async () => {
    const s = await midWorkout();
    const id = await card(a);
    const lib = await libraryAndCampaign(a);
    const sessions = await db.server(`select to_jsonb(x) as r from sessions x where user_id = $1 order by id`, [a]);
    const plans = await db.server(`select count(*)::int as n from today_plans where user_id = $1`, [a]);
    const r = await decide(a, id, false);
    expect(r).toMatchObject({ ok: true, status: 'rejected' });
    const p = await proposalRow(id);
    expect(p.status).toBe('rejected');
    expect(p.decided_at).not.toBeNull();
    expect(p.result).toBeNull();
    expect(await libraryAndCampaign(a)).toBe(lib);
    expect(await db.server(`select to_jsonb(x) as r from sessions x where user_id = $1 order by id`, [a])).toEqual(sessions);
    expect(await db.server(`select count(*)::int as n from today_plans where user_id = $1`, [a])).toEqual(plans);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [s.id]))[0].status).toBe('active');
  });
});

describe('a card decided twice', () => {
  it('answers "already decided" and does nothing more', async () => {
    const id = await card(a);
    expect((await decide(a, id, true)).ok).toBe(true);
    for (const accept of [true, false]) {
      expect(await decide(a, id, accept)).toMatchObject({ ok: false, code: 'already_decided', status: 'accepted' });
    }
    expect((await plansFor(id)).length).toBe(1);
    expect((await proposalRow(id)).status).toBe('accepted');

    const other = await card(a);
    await decide(a, other, false);
    expect(await decide(a, other, true)).toMatchObject({ ok: false, code: 'already_decided', status: 'rejected' });
    expect(await plansFor(other)).toEqual([]);
  });

  it('an out-of-date card cannot be accepted, but can be dismissed', async () => {
    const id = await card(a);
    await db.server(`update proposals set status = 'out_of_date' where id = $1`, [id]);
    expect(await decide(a, id, true)).toMatchObject({ ok: false, code: 'out_of_date', status: 'out_of_date' });
    expect(await decide(a, id, false)).toMatchObject({ ok: true, status: 'rejected' });
    expect(await plansFor(id)).toEqual([]);
  });
});

describe('an expired card', () => {
  it('is marked expired at the 3:00 am rollover, and nothing is applied', async () => {
    const s = await midWorkout();
    const id = await card(a, {}, { expires: new Date(Date.now() - 60000).toISOString() });
    expect(await decide(a, id, true)).toMatchObject({ ok: false, code: 'expired', status: 'expired' });
    expect((await proposalRow(id)).status).toBe('expired');
    expect(await plansFor(id)).toEqual([]);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [s.id]))[0].status).toBe('active');
    expect(await decide(a, id, false)).toMatchObject({ ok: false, code: 'already_decided', status: 'expired' });
  });
});

describe('who may decide', () => {
  it("one person cannot decide another's card", async () => {
    const id = await card(a);
    for (const accept of [true, false]) {
      expect(await decide(b, id, accept)).toMatchObject({ ok: false, code: 'not_found', status: null });
    }
    expect((await proposalRow(id)).status).toBe('pending');
    expect(await plansFor(id)).toEqual([]);
  });

  it('a coach sign-in cannot decide one, nor add a card that claims to come from the planner', async () => {
    const id = await card(a);
    await expect(decide(a, id, true, { coach: true })).rejects.toThrow(/not_signed_in/);
    await expect(decide(a, id, false, { coach: true })).rejects.toThrow(/not_signed_in/);
    expect((await proposalRow(id)).status).toBe('pending');
    await expect(card(a, {}, { coach: true })).rejects.toThrow();
    // A coach's own today card is not one this step decides.
    const coachCard = await card(a, {}, { coach: true, source: 'ChatGPT' });
    expect(await decide(a, coachCard, true)).toMatchObject({ ok: false, code: 'not_planner' });
    expect((await proposalRow(coachCard)).status).toBe('pending');
  });

  it('no one signed out can call it', async () => {
    const id = await card(a);
    await expect(db.pg.transaction(async (tx) => {
      await tx.exec(`set local role anon`);
      await tx.query(`select decide_planner_proposal($1, true)`, [id]);
    })).rejects.toThrow(/permission denied/);
  });
});

describe('the library and the campaign are never changed by use (spec Section 1, rule 3)', () => {
  it('Accept, with or without a running workout, leaves every exercise, workout, campaign, day and override as it was', async () => {
    const before = await libraryAndCampaign(a);
    await decide(a, await card(a, { workout_id: workout, campaign_day_id: day }), true);
    await midWorkout();
    await decide(a, await card(a, { workout_id: workout }), true);
    await decide(a, await card(a), false);
    expect(await libraryAndCampaign(a)).toBe(before);
  });
});

describe('a card that breaks a rule is refused, and stays pending', () => {
  const cases: Array<[string, () => Record<string, unknown>, RegExp]> = [
    ['an unknown exercise', () => ({ plan_items: [{ exercise_id: crypto.randomUUID(), sets: 3, reps: 8 }] }), /not in your library/],
    ["another person's exercise", () => ({ plan_items: [{ exercise_id: bBench, sets: 3, reps: 8 }] }), /not in your library/],
    ['a superset of four', () => ({ plan_items: ['Barbell Bench Press', 'Barbell Bent-Over Row', 'Barbell Curl', 'Dumbbell Lateral Raise'].map((n) => ({ exercise_id: ex[n], sets: 3, reps: 8, superset_letter: 'A' })) }), /two or three/],
    ['a superset of one', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 8, superset_letter: 'C' }] }), /two or three/],
    ['a superset with unequal sets', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 8, superset_letter: 'A' }, { exercise_id: ex['Bodyweight Push-Up'], sets: 4, reps: 8, superset_letter: 'A' }] }), /same number of sets/],
    ['13 sets', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 13, reps: 8 }] }), /1 to 12 sets/],
    ['sets as words', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 'three', reps: 8 }] }), /1 to 12 sets/],
    ['no reps', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 0 }] }), /1 to 50 reps/],
    ['a rest of 601 seconds', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 8, rest_seconds: 601 }] }), /0 to 600/],
    ['a lower-case superset letter', () => ({ plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 8, superset_letter: 'a' }] }), /A to Z/],
    ['no exercises', () => ({ plan_items: [] }), /between 1 and 40/],
    ['no day', () => ({ local_date: 'today' }), /not readable|no day/],
    ["another person's workout", () => ({ workout_id: crypto.randomUUID() }), /workout is not in your library/],
  ];
  for (const [what, over, message] of cases) {
    it(what, async () => {
      const id = await card(a, over());
      const r = await decide(a, id, true);
      expect(r).toMatchObject({ ok: false, code: 'invalid', status: 'pending' });
      expect(r.message).toMatch(message);
      expect((await proposalRow(id)).status).toBe('pending');
      expect(await plansFor(id)).toEqual([]);
      // Dismiss still works.
      expect((await decide(a, id, false)).status).toBe('rejected');
    });
  }

  it('an archived exercise', async () => {
    const [arch] = await db.server<{ id: string }>(`update exercises set archived_at = now() where user_id = $1 and name = 'Barbell Shrug' returning id`, [a]);
    const id = await card(a, { plan_items: [{ exercise_id: arch.id, sets: 3, reps: 8 }] });
    expect(await decide(a, id, true)).toMatchObject({ ok: false, code: 'invalid', message: expect.stringMatching(/archived/) });
  });

  it('a split never happens when the card is refused', async () => {
    const s = await midWorkout();
    const id = await card(a, { plan_items: [{ exercise_id: crypto.randomUUID(), sets: 3, reps: 8 }] });
    expect((await decide(a, id, true)).ok).toBe(false);
    expect((await db.as<{ status: string }>(a, `select status from sessions where id = $1`, [s.id]))[0].status).toBe('active');
  });
});
