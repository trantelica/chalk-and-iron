// Stage 4D, Accept and Decline (spec Section 4, "Proposals in the app";
// Section 8, "Coach"; Section 10, "Proposals"; design Sections 3 and 5).
// One guarded step, decide_proposal, decides every coach's card: Accept
// applies all of it or none, Decline applies none and can carry a reason the
// coach can read. A change to today changes only today, inside a running
// workout if there is one, and never a set already logged; a phone that was
// offline when it was accepted replays it rather than overwrite it.
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { fingerprint } from './fixtures';
import { addDays, mondayOf, trainingDay, weekday } from '@/rules/days';
import { breakSuperset, logSet, startExercise, startSession, type PlanItem, type Session } from '@/rules/session';
import { sessionChanges, sessionFromRows, type NewChange, type SyncAnswer } from '@/rules/sync';
import { factsFrom, seedFromMemory, todayDecision, type ProposalContext } from '@/rules/decide';
import { replayAccepted, type AcceptedToday, type TodayChange } from '@/rules/today-change';
import { planItems } from '@/rules/today';

let db: Db;
let a: string;
let b: string;
const ex: Record<string, string> = {};
const vocab: Record<string, string> = {};
const today = trainingDay(new Date(), 'America/Denver');

const parse = <T,>(v: unknown) => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const one = async <T = Record<string, unknown>,>(sql: string, params: unknown[] = []) => (await db.server<T>(sql, params))[0];

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  for (const name of ['Barbell Bench Press', 'Barbell Bent-Over Row', 'Barbell Curl', 'Dumbbell Bench Press', 'Bodyweight Push-Up',
    'Dumbbell Lateral Raise', 'Cable Rope Pushdown', 'Barbell Back Squat']) {
    ex[name] = (await one<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [a, name]))?.id;
    expect(ex[name], name).toBeTruthy();
  }
  for (const [kind, name] of [['muscle_group', 'Chest'], ['muscle_group', 'Back'], ['equipment', 'dumbbell'], ['equipment', 'barbell']]) {
    vocab[name] = (await one<{ id: string }>(`select id from vocabulary_terms where user_id = $1 and kind = $2 and name = $3`, [a, kind, name])).id;
  }
});

interface Answer { ok: boolean; status: string | null; code?: string; message: string; kind?: string; result?: Record<string, unknown> }

/** A coach's card, added with a coach's pass, as the propose tools add them, with its targets. */
async function coachCard(kind: string, applies: string, payload: unknown, targets: [string, string][] = [], user = a) {
  const [row] = await db.as<{ id: string }>(user,
    `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'ChatGPT', $2, $3, '{"One change"}', $4) returning id`,
    [user, kind, applies, JSON.stringify(payload)], { coach: true });
  for (const [t, id] of targets) {
    const v = t === 'coach_profiles'
      ? (await one<{ version: number }>(`select version from coach_profiles where user_id = $1`, [id])).version
      : (await one<{ version: number }>(`select version from ${t} where id = $1`, [id])).version;
    await db.as(user, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, $3, $4, $5)`,
      [user, row.id, t, id, v], { coach: true });
  }
  return row.id;
}

async function decide(id: string, accept: boolean, opts: { reason?: string | null; today?: unknown; user?: string; coach?: boolean } = {}) {
  const [row] = await db.as<{ r: unknown }>(opts.user ?? a, `select decide_proposal($1, $2, $3, $4) as r`,
    [id, accept, opts.reason ?? null, opts.today === undefined ? null : JSON.stringify(opts.today)], { coach: opts.coach });
  return parse<Answer>(row.r);
}

/** Accept a card for today exactly as the app does: read, work it out with the phone's rules, decide. */
async function acceptToday(id: string, user = a): Promise<Answer> {
  for (let i = 0; i < 3; i++) {
    const [row] = await db.as<{ c: unknown }>(user, `select proposal_context($1) as c`, [id]);
    const ctx = parse<ProposalContext>(row.c);
    const d = todayDecision(ctx, Date.now());
    if ('wait' in d) return { ok: false, status: 'pending', code: 'wait', message: d.wait };
    const r = await decide(id, true, { today: d.send, user });
    if (r.code !== 'try_again') return r;
  }
  throw new Error('kept changing');
}

const status = async (id: string) => one<{ status: string; decided_at: string | null; decline_reason: string | null; result: unknown }>(
  `select status, decided_at, decline_reason, result from proposals where id = $1`, [id]);
const exByName = (name: string, user = a) => db.server<{ id: string; created_via: string; archived_at: string | null }>(
  `select id, created_via, archived_at from exercises where user_id = $1 and lower(name) = lower($2)`, [user, name]);

/** A new exercise, complete as a coach must send one (with its three alternates). */
const newEx = (name: string, over: Record<string, unknown> = {}) => ({
  name, muscle_group_id: vocab.Chest, equipment_id: vocab.dumbbell, default_unit: 'lb', work_seconds: 40, rest_seconds: 90, note: '',
  alternates: { bodyweight: 'Bodyweight Push-Up', basic_gym: 'Dumbbell Bench Press', full_gym: 'Barbell Bench Press' }, ...over,
});

// ---------------------------------------------------------------- Decline, and reading the decision

describe('Decline', () => {
  it('applies nothing, with or without a reason, and the coach can read the status and the reason', async () => {
    const before = await fingerprint(db);
    const id1 = await coachCard('exercise', 'library', newEx('Landmine Press'));
    const id2 = await coachCard('exercise', 'library', newEx('Landmine Row'));
    const mid = await fingerprint(db);
    expect(await decide(id1, false)).toMatchObject({ ok: true, status: 'rejected', message: 'Declined. Nothing was changed.' });
    expect(await decide(id2, false, { reason: '  too much\nvolume  ' })).toMatchObject({ ok: true, status: 'rejected' });
    expect(await exByName('Landmine Press')).toEqual([]);
    expect(await exByName('Landmine Row')).toEqual([]);
    // Only the two cards changed.
    const after = await fingerprint(db);
    for (const t of Object.keys(before)) if (t !== 'proposals') expect(after[t], t).toEqual(mid[t]);
    // What the coach's pass reads (get_proposal_status and list_proposals read these columns).
    const seen = await db.as<{ id: string; status: string; decline_reason: string | null; decided_at: string | null }>(a,
      `select id, status, decline_reason, decided_at from proposals where id = any ($1) order by array_position($1::uuid[], id)`, [[id1, id2]], { coach: true });
    expect(seen.map((s) => [s.status, s.decline_reason])).toEqual([['rejected', null], ['rejected', 'too much volume']]);
    expect(seen.every((s) => s.decided_at)).toBe(true);
  });

  it('takes a reason of up to 300 characters and refuses a longer one, changing nothing', async () => {
    const id = await coachCard('exercise', 'library', newEx('Landmine Squeeze'));
    expect(await decide(id, false, { reason: 'x'.repeat(301) })).toMatchObject({ ok: false, code: 'reason_too_long', status: 'pending' });
    expect((await status(id)).status).toBe('pending');
    expect(await decide(id, false, { reason: 'y'.repeat(300) })).toMatchObject({ ok: true, status: 'rejected' });
    expect((await status(id)).decline_reason).toBe('y'.repeat(300));
  });

  it('the pending count goes down after Accept or Decline', async () => {
    const pending = async () => Number((await one<{ n: number }>(`select count(*)::int as n from proposals where user_id = $1 and status = 'pending'`, [a])).n);
    const n0 = await pending();
    const x = await coachCard('exercise', 'library', newEx('Cable Fly Low'));
    const y = await coachCard('exercise', 'library', newEx('Cable Fly High'));
    expect(await pending()).toBe(n0 + 2);
    await decide(x, true);
    expect(await pending()).toBe(n0 + 1);
    await decide(y, false);
    expect(await pending()).toBe(n0);
  });

  it('a card decided once cannot be decided again', async () => {
    const id = await coachCard('exercise', 'library', newEx('Svend Press'));
    await decide(id, false, { reason: 'no' });
    expect(await decide(id, true)).toMatchObject({ ok: false, code: 'already_decided', status: 'rejected' });
    expect(await exByName('Svend Press')).toEqual([]);
  });
});

// ---------------------------------------------------------------- exercises

describe('an exercise card', () => {
  it('Accept adds the exercise, complete with its alternates, to the library', async () => {
    const id = await coachCard('exercise', 'library', newEx('Incline Dumbbell Squeeze Press', { focus_id: null, note: 'Palms in' }));
    const r = await decide(id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted', kind: 'exercise', message: 'Accepted. Incline Dumbbell Squeeze Press is in your library.' });
    const [made] = await exByName('Incline Dumbbell Squeeze Press');
    expect(made.created_via).toBe('proposal');
    const alts = await db.server<{ tier: string; alternate_exercise_id: string | null }>(
      `select tier, alternate_exercise_id from exercise_alternates where exercise_id = $1 order by tier`, [made.id]);
    expect(alts.map((x) => x.tier)).toEqual(['basic_gym', 'bodyweight', 'full_gym']);
    expect(alts.find((x) => x.tier === 'full_gym')!.alternate_exercise_id).toBe(ex['Barbell Bench Press']);
    expect(parse<{ exercise_id: string }>((await status(id)).result).exercise_id).toBe(made.id);
  });

  it('Accept edits only the fields given, and its alternates', async () => {
    const id = await coachCard('exercise', 'library', { exercise_id: ex['Dumbbell Lateral Raise'], rest_seconds: 75, alternates: { bodyweight: 'Bodyweight Push-Up' } },
      [['exercises', ex['Dumbbell Lateral Raise']]]);
    expect(await decide(id, true)).toMatchObject({ ok: true, status: 'accepted' });
    const row = await one<{ rest_seconds: number; work_seconds: number; name: string }>(`select rest_seconds, work_seconds, name from exercises where id = $1`, [ex['Dumbbell Lateral Raise']]);
    expect(row).toMatchObject({ rest_seconds: 75, name: 'Dumbbell Lateral Raise' });
    expect((await one<{ name: string }>(`select name from exercise_alternates where exercise_id = $1 and tier = 'bodyweight'`, [ex['Dumbbell Lateral Raise']])).name).toBe('Bodyweight Push-Up');
  });

  it('becomes out of date when the person edits the exercise first: it cannot be accepted, and can still be declined', async () => {
    const id = await coachCard('exercise', 'library', { exercise_id: ex['Cable Rope Pushdown'], work_seconds: 50 }, [['exercises', ex['Cable Rope Pushdown']]]);
    await db.as(a, `update exercises set note = 'Rope' where id = $1`, [ex['Cable Rope Pushdown']]);
    expect((await status(id)).status).toBe('out_of_date');
    expect(await decide(id, true)).toMatchObject({ ok: false, code: 'out_of_date' });
    expect((await one<{ work_seconds: number }>(`select work_seconds from exercises where id = $1`, [ex['Cable Rope Pushdown']])).work_seconds).not.toBe(50);
    expect(await decide(id, false, { reason: 'already changed it' })).toMatchObject({ ok: true, status: 'rejected' });
    expect((await status(id)).decline_reason).toBe('already changed it');
  });

  it('is also checked at Accept: a version that moved on makes it out of date and applies nothing', async () => {
    const id = await coachCard('exercise', 'library', { exercise_id: ex['Barbell Back Squat'], work_seconds: 55 }, [['exercises', ex['Barbell Back Squat']]]);
    // Moved on without the usual mark (as if two edits raced): the check in Accept catches it.
    await db.server(`update proposal_targets set version_seen = version_seen - 1 where proposal_id = $1`, [id]);
    expect(await decide(id, true)).toMatchObject({ ok: false, code: 'out_of_date', status: 'out_of_date' });
    expect((await one<{ work_seconds: number }>(`select work_seconds from exercises where id = $1`, [ex['Barbell Back Squat']])).work_seconds).not.toBe(55);
  });

  it('a new exercise whose name the person has since used makes the card out of date, never a duplicate', async () => {
    const id = await coachCard('exercise', 'library', newEx('Pec Deck Reverse'));
    await db.as(a, `insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via) values ($1, 'pec deck reverse', $2, $3, 'lb', 'planner')`,
      [a, vocab.Chest, vocab.dumbbell]);
    expect(await decide(id, true)).toMatchObject({ ok: false, code: 'out_of_date', status: 'out_of_date' });
    expect((await exByName('Pec Deck Reverse')).length).toBe(1);
  });
});

// ---------------------------------------------------------------- workouts

describe('a workout card', () => {
  it('that bundles a new exercise adds both on Accept, and neither on Decline', async () => {
    const payload = (name: string, exName: string) => ({
      name, new_exercises: [{ ref: 'n1', ...newEx(exName) }],
      items: [
        { exercise_id: ex['Barbell Bench Press'], sets: 4, reps: 6 },
        { new_exercise: 'n1', sets: 3, reps: 12, rest_seconds: 60, superset_letter: 'A' },
        { exercise_id: ex['Barbell Curl'], sets: 3, reps: 10, superset_letter: 'A' },
      ],
    });
    const declined = await coachCard('workout', 'library', payload('Push C', 'Cable Squeeze Fly'));
    await decide(declined, false);
    expect(await db.server(`select id from workouts where user_id = $1 and name = 'Push C'`, [a])).toEqual([]);
    expect(await exByName('Cable Squeeze Fly')).toEqual([]);

    const accepted = await coachCard('workout', 'library', payload('Push D', 'Cable Squeeze Press'));
    const r = await decide(accepted, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted', message: 'Accepted. Push D is in your library, with 1 new exercise. Workouts already done are unchanged.' });
    const [made] = await exByName('Cable Squeeze Press');
    const w = await one<{ id: string }>(`select id from workouts where user_id = $1 and name = 'Push D'`, [a]);
    const items = await db.server<{ exercise_id: string; sets: number; superset_letter: string | null }>(
      `select exercise_id, sets, superset_letter from workout_items where workout_id = $1 order by position`, [w.id]);
    expect(items).toEqual([
      { exercise_id: ex['Barbell Bench Press'], sets: 4, superset_letter: null },
      { exercise_id: made.id, sets: 3, superset_letter: 'A' },
      { exercise_id: ex['Barbell Curl'], sets: 3, superset_letter: 'A' },
    ]);
    expect(parse<{ new_exercise_ids: string[] }>((await status(accepted)).result).new_exercise_ids).toEqual([made.id]);
  });

  it('is all or nothing: a superset left uneven refuses it, and the new exercise it brings is not kept either', async () => {
    const id = await coachCard('workout', 'library', {
      name: 'Broken', new_exercises: [{ ref: 'n1', ...newEx('Never Kept Press') }],
      items: [{ new_exercise: 'n1', sets: 3, reps: 8, superset_letter: 'A' }, { exercise_id: ex['Barbell Curl'], sets: 4, reps: 8, superset_letter: 'A' }],
    });
    const before = await fingerprint(db);
    const r = await decide(id, true);
    expect(r).toMatchObject({ ok: false, code: 'invalid', status: 'pending' });
    expect(r.message).toMatch(/Superset A/);
    expect(await fingerprint(db)).toEqual(before);
  });

  it('an edit keeps the rows it keeps (and their campaign overrides), and a superset on a day follows the workout again', async () => {
    const w = (await one<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Pull A') returning id`, [a])).id;
    const rows = (await db.server<{ id: string }>(
      `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
       values ($1, $2, 0, $3, 3, 8, null), ($1, $2, 1, $4, 3, 10, null), ($1, $2, 2, $5, 3, 12, null) returning id`,
      [a, w, ex['Barbell Bent-Over Row'], ex['Barbell Curl'], ex['Dumbbell Lateral Raise']])).map((r) => r.id);
    const c = (await one<{ id: string }>(`insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Draft X', '2026-12-07', 2) returning id`, [a])).id;
    const d = (await one<{ id: string }>(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 2, $3) returning id`, [a, c, w])).id;
    await db.server(`insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 6)`, [a, d, w, rows[0]]);
    await db.server(`insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets) values ($1, $2, $3, $4, 5)`, [a, d, w, rows[1]]);
    // Curl and the raise become superset A with 4 sets each; the day had curl at 5 sets.
    const id = await coachCard('workout', 'library', {
      workout_id: w, name: 'Pull A+',
      items: [
        { exercise_id: ex['Barbell Bent-Over Row'], sets: 4, reps: 8 },
        { exercise_id: ex['Barbell Curl'], sets: 4, reps: 10, superset_letter: 'A' },
        { exercise_id: ex['Dumbbell Lateral Raise'], sets: 4, reps: 12, superset_letter: 'A' },
      ],
    }, [['workouts', w]]);
    const r = await decide(id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted' });
    expect(r.message).toMatch(/On 1 campaign day, a superset's sets now follow the workout/);
    const after = await db.server<{ id: string }>(`select id from workout_items where workout_id = $1 order by position`, [w]);
    expect(after.map((x) => x.id)).toEqual(rows);
    const ov = await db.server<{ workout_item_id: string; sets: number | null; reps: number | null }>(
      `select workout_item_id, sets, reps from campaign_day_overrides where campaign_day_id = $1 order by workout_item_id = $2 desc`, [d, rows[0]]);
    expect(ov).toEqual([{ workout_item_id: rows[0], sets: null, reps: 6 }, { workout_item_id: rows[1], sets: null, reps: null }]);
    expect((await one<{ name: string }>(`select name from workouts where id = $1`, [w])).name).toBe('Pull A+');
  });
});

// ---------------------------------------------------------------- campaigns

describe('a campaign card', () => {
  it('a new campaign arrives as a draft, with the exercises and workouts it brings; the active campaign is untouched', async () => {
    const active = (await one<{ id: string; version: number }>(
      `insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Running', $2, 3, 'active') returning id, version`, [a, mondayOf(today)]));
    const id = await coachCard('campaign', 'campaign', {
      name: 'Block 2', start_date: addDays(mondayOf(today), 21), week_count: 2,
      new_exercises: [{ ref: 'n1', ...newEx('Seal Row Pause', { muscle_group_id: vocab.Back }) }],
      new_workouts: [{ ref: 'w1', name: 'Back B', items: [{ new_exercise: 'n1', sets: 3, reps: 10 }, { exercise_id: ex['Barbell Curl'], sets: 3, reps: 10 }] }],
      days: [
        { week: 1, weekday: 1, new_workout: 'w1', overrides: [{ item: 1, reps: 8, weight_lb: 65 }] },
        { week: 2, weekday: 1, new_workout: 'w1' },
        { week: 1, weekday: 3, rest: true },
      ],
    });
    const r = await decide(id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted' });
    expect(r.message).toMatch(/draft campaign/);
    const res = parse<{ campaign_id: string; new_workout_ids: string[]; new_exercise_ids: string[] }>((await status(id)).result);
    const c = await one<{ status: string; week_count: number }>(`select status, week_count from campaigns where id = $1`, [res.campaign_id]);
    expect(c).toEqual({ status: 'draft', week_count: 2 });
    const days = await db.server<{ week: number; weekday: number; workout_id: string }>(`select week, weekday, workout_id from campaign_days where campaign_id = $1 order by week`, [res.campaign_id]);
    expect(days).toEqual([{ week: 1, weekday: 1, workout_id: res.new_workout_ids[0] }, { week: 2, weekday: 1, workout_id: res.new_workout_ids[0] }]);
    const ov = await one<{ reps: number; weight_lb: string; weight_entered_unit: string }>(
      `select o.reps, o.weight_lb, o.weight_entered_unit from campaign_day_overrides o join campaign_days d on d.id = o.campaign_day_id where d.campaign_id = $1`, [res.campaign_id]);
    expect(ov).toMatchObject({ reps: 8, weight_entered_unit: 'lb' });
    expect(Number(ov.weight_lb)).toBe(65);
    expect(await one(`select status, version from campaigns where id = $1`, [active.id])).toEqual({ status: 'active', version: active.version });
    await db.server(`delete from campaigns where id = $1`, [active.id]);
  });

  it('an edit sets the days it lists and their overrides; a shift leaves this week empty', async () => {
    const w = (await one<{ id: string }>(`select id from workouts where user_id = $1 and name = 'Push D'`, [a])).id;
    const c = (await one<{ id: string }>(`insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Live', $2, 4, 'active') returning id`, [a, mondayOf(today)])).id;
    await db.server(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 1, $3), ($1, $2, 4, 2, $3)`, [a, c, w]);
    const id = await coachCard('campaign', 'campaign', {
      campaign_id: c, week_count: 3, shift_forward_weeks: 1,
      days: [{ week: 1, weekday: 1, workout_id: w, overrides: [{ item: 0, sets: 5 }] }, { week: 2, weekday: 4, workout_id: w }],
    }, [['campaigns', c]]);
    expect(await decide(id, true)).toMatchObject({ ok: true, status: 'accepted' });
    const days = await db.server<{ week: number; weekday: number }>(`select week, weekday from campaign_days where campaign_id = $1 order by week, weekday`, [c]);
    expect(days).toEqual([{ week: 1, weekday: 1 }, { week: 2, weekday: 4 }]); // week 4 went with the shorter campaign
    expect((await one<{ sets: number }>(`select o.sets from campaign_day_overrides o join campaign_days d on d.id = o.campaign_day_id where d.campaign_id = $1`, [c])).sets).toBe(5);
    const shift = await one<{ blank_week_starts_on: string; made_by: string }>(`select to_char(blank_week_starts_on, 'YYYY-MM-DD') as blank_week_starts_on, made_by from campaign_shifts where campaign_id = $1`, [c]);
    expect(shift).toEqual({ blank_week_starts_on: mondayOf(today), made_by: `proposal:${id}` });
    await db.server(`delete from campaigns where id = $1`, [c]);
  });
});

// ---------------------------------------------------------------- profile and gyms

describe('a profile card', () => {
  it('changes the coach profile and adds a default gym', async () => {
    const old = await one<{ id: string }>(`insert into gyms (user_id, name, is_default) values ($1, 'Old Gym', true) returning id`, [a]);
    const id = await coachCard('profile_update', 'profile', {
      profile: { progression_pace: 'moderate', priorities: [{ value: 'strength' }, { value: 'muscle' }], workout_minutes: 60, goals: 'Bench 225' },
      gym: { name: 'Garage', equipment: ['barbell', 'dumbbell'], make_default: true },
    }, [['coach_profiles', a]]);
    expect(await decide(id, true)).toMatchObject({ ok: true, status: 'accepted', message: 'Accepted. Your coach profile and gym are updated.' });
    expect(await one(`select progression_pace, workout_minutes, goals, priorities from coach_profiles where user_id = $1`, [a]))
      .toEqual({ progression_pace: 'moderate', workout_minutes: 60, goals: 'Bench 225', priorities: [{ value: 'strength' }, { value: 'muscle' }] });
    const gyms = await db.server<{ name: string; is_default: boolean }>(`select name, is_default from gyms where user_id = $1 order by name`, [a]);
    expect(gyms).toEqual([{ name: 'Garage', is_default: true }, { name: 'Old Gym', is_default: false }]);
    void old;
  });

  it('an answer outside its list refuses the whole card and changes nothing', async () => {
    const id = await coachCard('profile_update', 'profile', { profile: { coach_style: 'shouty', goals: 'Never written' } });
    const before = await fingerprint(db);
    expect(await decide(id, true)).toMatchObject({ ok: false, code: 'invalid', status: 'pending' });
    expect(await fingerprint(db)).toEqual(before);
  });
});

// ---------------------------------------------------------------- who may decide

describe('who may decide', () => {
  it("a coach's pass cannot decide a card or read what Accept needs; another person cannot reach it", async () => {
    const id = await coachCard('exercise', 'library', newEx('Coach Never Applies'));
    await expect(decide(id, true, { coach: true })).rejects.toThrow(/not_signed_in/);
    await expect(db.as(a, `select proposal_context($1)`, [id], { coach: true })).rejects.toThrow(/not_signed_in/);
    expect(await decide(id, true, { user: b })).toMatchObject({ ok: false, code: 'not_found' });
    expect(parse<{ proposal: null }>((await db.as<{ c: unknown }>(b, `select proposal_context($1) as c`, [id]))[0].c).proposal).toBeNull();
    expect((await status(id)).status).toBe('pending');
    expect(await exByName('Coach Never Applies')).toEqual([]);
  });

  it('no one signed out can call it', async () => {
    const rows = await db.server<{ anon: boolean }>(
      `select has_function_privilege('anon', 'public.decide_proposal(uuid, boolean, text, jsonb)', 'execute') as anon`);
    expect(rows[0].anon).toBe(false);
  });

  it('a day sent from the planner is still decided as before, through the same step', async () => {
    const [row] = await db.as<{ id: string }>(a,
      `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'planner', 'today_change', 'today', '{"x"}', $2) returning id`,
      [a, JSON.stringify({ local_date: today, workout_name: 'X', plan_items: [{ exercise_id: ex['Barbell Curl'], sets: 3, reps: 10 }] })]);
    expect(await decide(row.id, false)).toMatchObject({ ok: true, status: 'rejected', message: 'Dismissed. Nothing was changed.' });
  });
});

// ---------------------------------------------------------------- the 3:00 am expiry

describe('a card for today expires at the 3:00 am rollover', () => {
  it('ends at the next rollover, however long the coach asked for; once past, Accept marks it expired and applies nothing', async () => {
    const [row] = await db.as<{ id: string; expires_at: string }>(a,
      `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload, expires_at) values ($1, 'ChatGPT', 'today_change', 'today', '{"x"}', $2, now() + interval '9 days') returning id, expires_at`,
      [a, JSON.stringify({ local_date: today, changes: [] })], { coach: true });
    const ends = new Date(row.expires_at).getTime();
    expect(ends).toBeGreaterThan(Date.now());
    expect(ends - Date.now()).toBeLessThanOrEqual(24 * 3600 * 1000);
    expect(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ends))).toBe('03:00');
    await db.server(`update proposals set expires_at = now() - interval '1 minute' where id = $1`, [row.id]);
    expect(await decide(row.id, true, { today: { mode: 'plan', items: [] } })).toMatchObject({ ok: false, code: 'expired', status: 'expired' });
  });

  it('the scheduled step marks every card past its end as expired, so the coach reads "expired"', async () => {
    const [row] = await db.as<{ id: string }>(a,
      `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'ChatGPT', 'today_change', 'today', '{"x"}', '{}') returning id`, [a], { coach: true });
    await db.server(`update proposals set expires_at = now() - interval '1 second' where id = $1`, [row.id]);
    await db.server(`select app.expire_due_proposals()`);
    expect((await status(row.id)).status).toBe('expired');
  });
});

// ---------------------------------------------------------------- a change to today

/** Everything in A's library and campaigns, versions included. */
async function libraryAndCampaign(user: string) {
  const out: Record<string, unknown> = {};
  for (const t of ['exercises', 'exercise_alternates', 'workouts', 'workout_items', 'campaigns', 'campaign_days', 'campaign_shifts', 'campaign_day_overrides']) {
    out[t] = await db.server(`select to_jsonb(x) as r from ${t} x where user_id = $1 order by 1`, [user]);
  }
  return JSON.stringify(out);
}

const noSeed = (_: string, sets: number) => Array.from({ length: sets }, () => null);
const lbSet = (lb: number, reps = 8) => ({ lb, enteredValue: lb, enteredUnit: 'lb' as const, reps });
const T0 = Date.now() - 20 * 60000;

async function send(cs: NewChange[], user = a): Promise<SyncAnswer> {
  const wire = cs.map((c) => ({ id: crypto.randomUUID(), kind: c.kind, data: c.data }));
  const [row] = await db.as<{ r: unknown }>(user, `select apply_changes($1::jsonb) as r`, [JSON.stringify(wire)]);
  const r = parse<SyncAnswer>(row.r);
  expect(r.rejected).toEqual([]);
  return r;
}

async function contextFor(id: string) {
  return parse<ProposalContext>((await db.as<{ c: unknown }>(a, `select proposal_context($1) as c`, [id]))[0].c);
}

async function accountCopy(sessionId: string, id: string): Promise<Session> {
  const [s] = await db.as<Record<string, unknown>>(a, `select * from sessions where id = $1`, [sessionId]);
  const blocks = await db.as<Record<string, unknown>>(a, `select * from session_blocks where session_id = $1`, [sessionId]);
  const exs = await db.as<Record<string, unknown>>(a, `select * from session_exercises where session_id = $1`, [sessionId]);
  const sets = await db.as<Record<string, unknown>>(a, `select l.* from set_logs l join session_exercises x on x.id = l.session_exercise_id where x.session_id = $1 and l.deleted_at is null`, [sessionId]);
  return sessionFromRows(s, blocks, exs, sets, factsFrom((await contextFor(id)).library));
}

describe('a change to today, before the workout starts', () => {
  let camp: string;
  let w: string;
  beforeAll(async () => {
    await db.server(`update campaigns set status = 'finished' where user_id = $1 and status = 'active'`, [a]);
    w = (await one<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Today A') returning id`, [a])).id;
    const items = (await db.server<{ id: string }>(
      `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
       values ($1, $2, 0, $3, 3, 8, 'A'), ($1, $2, 1, $4, 3, 8, 'A'), ($1, $2, 2, $5, 3, 10, null) returning id`,
      [a, w, ex['Barbell Bench Press'], ex['Barbell Bent-Over Row'], ex['Barbell Curl']])).map((r) => r.id);
    camp = (await one<{ id: string }>(`insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Now', $2, 2, 'active') returning id`, [a, mondayOf(today)])).id;
    const d = (await one<{ id: string }>(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, $3, $4) returning id`, [a, camp, weekday(today), w])).id;
    await db.server(`insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 12)`, [a, d, w, items[2]]);
  });

  it("is held in today's plan; the library, the campaign and its day are unchanged", async () => {
    const before = await libraryAndCampaign(a);
    const changes: TodayChange[] = [
      { action: 'swap', exercise_id: ex['Barbell Curl'], to_exercise_id: ex['Dumbbell Lateral Raise'] },
      { action: 'set_sets', exercise_id: ex['Barbell Bench Press'], sets: 4 },
      { action: 'break_superset', superset_letter: 'A' },
      { action: 'add', exercise_id: ex['Cable Rope Pushdown'], sets: 2, reps: 15, position: 1 },
    ];
    const id = await coachCard('today_change', 'today', { local_date: today, changes });
    const r = await acceptToday(id);
    expect(r).toMatchObject({ ok: true, status: 'accepted', message: "Accepted. Today's workout is changed, for today only. Your library and campaign are unchanged." });
    const plan = await one<{ plan: unknown; made_by: string; campaign_day_id: string }>(`select plan, made_by, campaign_day_id from today_plans where id = $1`, [(r.result as { today_plan_id: string }).today_plan_id]);
    expect(plan.made_by).toBe(`proposal:${id}`);
    expect(planItems(plan.plan).map((i) => [i.exerciseId, i.sets, i.reps, i.superset])).toEqual([
      [ex['Cable Rope Pushdown'], 2, 15, null],
      [ex['Barbell Bench Press'], 4, 8, null],
      [ex['Barbell Bent-Over Row'], 4, 8, null],
      [ex['Dumbbell Lateral Raise'], 3, 12, null],
    ]);
    expect(await libraryAndCampaign(a)).toEqual(before);
  });

  it('a change that no longer fits today becomes out of date, and nothing is applied', async () => {
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'remove', exercise_id: ex['Barbell Back Squat'] }] });
    const before = await fingerprint(db);
    const r = await acceptToday(id);
    expect(r).toMatchObject({ ok: false, code: 'out_of_date', status: 'out_of_date' });
    expect(r.message).toMatch(/Barbell Back Squat is not in today's workout/);
    const after = await fingerprint(db);
    for (const t of Object.keys(before)) if (t !== 'proposals') expect(after[t], t).toEqual(before[t]);
  });

  it('if the plan changed while Accept was worked out, the app is asked to read again', async () => {
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'set_reps', exercise_id: ex['Barbell Bench Press'], reps: 5 }] });
    const d = todayDecision(await contextFor(id), Date.now());
    // Another card was accepted in between, so today's plan moved on.
    const other = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'set_reps', exercise_id: ex['Barbell Bench Press'], reps: 6 }] });
    expect(await acceptToday(other)).toMatchObject({ ok: true });
    expect('send' in d && (await decide(id, true, { today: d.send }))).toMatchObject({ ok: false, code: 'try_again', status: 'pending' });
    expect(await acceptToday(id)).toMatchObject({ ok: true, status: 'accepted' });
  });
});

describe('a change to today, during a running workout', () => {
  const plan = (names: string[], superset: (string | null)[] = []): PlanItem[] => names.map((n, i) => ({
    exerciseId: ex[n], name: n, muscle: '', equipment: '', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 90, sets: 3, reps: 8,
    superset: superset[i] ?? null, alternates: [],
  }));

  /** A's phone, mid-workout: two sets of bench logged; row and curl (superset B) not reached. */
  async function running() {
    let s: Session = startSession('Today A', today, plan(['Barbell Bench Press', 'Barbell Bent-Over Row', 'Barbell Curl'], [null, 'B', 'B']), {}, T0, noSeed);
    const sent: NewChange[] = [...sessionChanges(null, s)];
    const step = (next: Session) => { sent.push(...sessionChanges(s, next)); s = next; };
    step(startExercise(s, T0 + 60000));
    step(logSet(s, lbSet(135), {}, T0 + 120000).session);
    step(logSet(s, lbSet(145), {}, T0 + 240000).session);
    await send(sent);
    return s;
  }
  beforeEach(() => db.server(`update sessions set status = 'finished', ended_at = now(), finish_reason = 'user' where status = 'active'`));

  const loggedSets = (sessionId: string) => db.server(
    `select l.id, l.weight_lb, l.reps, l.set_number, se.exercise_id from set_logs l join session_exercises se on se.id = l.session_exercise_id where se.session_id = $1 and l.deleted_at is null order by l.id`, [sessionId]);

  it('is applied inside the running workout: no new workout, logged sets untouched, library and campaign unchanged', async () => {
    const s = await running();
    const sets = await loggedSets(s.id);
    const lib = await libraryAndCampaign(a);
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [
      { action: 'swap', exercise_id: ex['Barbell Bench Press'], to_exercise_id: ex['Dumbbell Bench Press'] },
      { action: 'set_weight', exercise_id: ex['Barbell Curl'], weight_lb: 50 },
      { action: 'break_superset', superset_letter: 'B' },
      { action: 'remove', exercise_id: ex['Barbell Bent-Over Row'] },
      { action: 'add', exercise_id: ex['Dumbbell Lateral Raise'], sets: 2, reps: 15 },
    ] });
    const r = await acceptToday(id);
    expect(r).toMatchObject({ ok: true, status: 'accepted', result: { mode: 'session', session_id: s.id, plan_revision: 1 } });
    expect(await db.as(a, `select id from sessions where status = 'active'`)).toEqual([{ id: s.id }]);
    expect(await loggedSets(s.id)).toEqual(sets);
    expect(await libraryAndCampaign(a)).toEqual(lib);

    const acct = await accountCopy(s.id, id);
    expect(acct.planRevision).toBe(1);
    const shown = Object.values(acct.exercises).map((e) => [e.exerciseId, e.types.length, e.logs.length, e.plannedWeightLb]);
    expect(shown).toEqual(expect.arrayContaining([
      [ex['Barbell Bench Press'], 2, 2, null], // ends with the two sets done on it
      [ex['Dumbbell Bench Press'], 1, 0, null], // the set left, as the new exercise
      [ex['Barbell Curl'], 3, 0, 50],
      [ex['Dumbbell Lateral Raise'], 2, 0, null],
    ]));
    expect(Object.values(acct.exercises).some((e) => e.exerciseId === ex['Barbell Bent-Over Row'])).toBe(false);
    expect(acct.blocks.filter((x) => !x.closed && x.members.length > 1)).toEqual([]); // superset B broken apart
  });

  it("the phone that accepted it replays the same change and lands on the account's copy exactly", async () => {
    const s = await running();
    const changes: TodayChange[] = [
      { action: 'swap', exercise_id: ex['Barbell Curl'], to_exercise_id: ex['Dumbbell Lateral Raise'] },
      { action: 'add', exercise_id: ex['Cable Rope Pushdown'], sets: 3, reps: 12, position: 2 },
      { action: 'set_rest', exercise_id: ex['Barbell Bench Press'], rest_seconds: 150 },
    ];
    const id = await coachCard('today_change', 'today', { local_date: today, changes });
    expect(await acceptToday(id)).toMatchObject({ ok: true });
    const ctx = await contextFor(id);
    const replayed = replayAccepted(s, [{ proposalId: id, revision: 1, changes }], factsFrom(ctx.library), noSeed, Date.now());
    const changesToSend = sessionChanges(s, replayed);
    const r = await send(changesToSend);
    expect(r.stale ?? []).toEqual([]);
    const acct = await accountCopy(s.id, id);
    const shape = (x: Session) => ({
      blocks: x.blocks.map((b) => [b.id, b.letter, b.members]),
      exercises: Object.values(x.exercises).map((e) => [e.key, e.exerciseId, e.types.length, e.rest]).sort(),
    });
    expect(shape(acct)).toEqual(shape(replayed));
    expect(acct.planRevision).toBe(1);
  });

  it('a phone offline at the time cannot overwrite it: told it is stale, it replays the change and keeps the set it logged meanwhile', async () => {
    const s0 = await running();
    // Accepted elsewhere (the planner, say) while the phone had no signal: curl becomes a lateral raise.
    const changes: TodayChange[] = [{ action: 'swap', exercise_id: ex['Barbell Bench Press'], to_exercise_id: ex['Dumbbell Bench Press'] }];
    const id = await coachCard('today_change', 'today', { local_date: today, changes });
    expect(await acceptToday(id)).toMatchObject({ ok: true });

    // Meanwhile, with no signal, the phone logged bench's third set and moved the superset ahead.
    let s = s0;
    const queued: NewChange[] = [];
    const step = (next: Session) => { queued.push(...sessionChanges(s, next)); s = next; };
    step(logSet(s, lbSet(155), {}, Date.now() - 1000).session);
    // Signal back: the old copy arrives first.
    const r = await send(queued);
    expect(r.stale).toEqual([s.id]);
    const acctBefore = await accountCopy(s.id, id);
    expect(acctBefore.planRevision).toBe(1); // the account kept its plan

    // The phone replays what it missed on its own copy, and sends that.
    const accepted: AcceptedToday[] = (await db.as<{ id: string; result: unknown }>(a,
      `select id, result from proposals where status = 'accepted' and kind = 'today_change' and result ->> 'session_id' = $1`, [s.id]))
      .map((p) => ({ proposalId: p.id, revision: Number(parse<{ plan_revision: number }>(p.result).plan_revision), changes: parse<{ changes: TodayChange[] }>(p.result).changes }));
    const replayed = replayAccepted(s, accepted, factsFrom((await contextFor(id)).library), noSeed, Date.now());
    expect(replayed.planRevision).toBe(1);
    const again = await send(sessionChanges(s, replayed));
    expect(again.stale ?? []).toEqual([]);

    // Bench was finished on the phone, so the swap passed it over; the set logged offline is kept on bench.
    const sets = await loggedSets(s.id);
    expect(sets.length).toBe(3);
    expect(sets.every((x) => x.exercise_id === ex['Barbell Bench Press'])).toBe(true);
    const acct = await accountCopy(s.id, id);
    expect(Object.values(acct.exercises).map((e) => e.exerciseId).sort()).toEqual(Object.values(replayed.exercises).map((e) => e.exerciseId).sort());
    expect(Object.values(acct.exercises).some((e) => e.exerciseId === ex['Dumbbell Bench Press'])).toBe(false);
  });

  it('a phone offline at the time: an exercise it added meanwhile, and its sets, are kept', async () => {
    const s0 = await running();
    const changes: TodayChange[] = [{ action: 'set_sets', exercise_id: ex['Barbell Curl'], sets: 4 }];
    const id = await coachCard('today_change', 'today', { local_date: today, changes });
    expect(await acceptToday(id)).toMatchObject({ ok: true });
    // Offline: the phone breaks superset B and logs a row set.
    let s = s0;
    const queued: NewChange[] = [];
    const step = (next: Session) => { queued.push(...sessionChanges(s, next)); s = next; };
    const b = s.blocks.find((x) => x.letter === 'B')!;
    step(breakSuperset(s, b.id, Date.now() - 5000));
    const rowKey = Object.values(s.exercises).find((e) => e.exerciseId === ex['Barbell Bent-Over Row'])!.key;
    const rowBlock = s.blocks.find((x) => !x.closed && x.members.includes(rowKey))!;
    step({ ...s, curBlock: rowBlock.id, curMember: rowKey });
    step(logSet(startExercise(s, Date.now() - 4000), lbSet(95), {}, Date.now() - 3000).session);
    expect((await send(queued)).stale).toEqual([s.id]);
    const replayed = replayAccepted(s, [{ proposalId: id, revision: 1, changes }], factsFrom((await contextFor(id)).library), noSeed, Date.now());
    await send(sessionChanges(s, replayed));
    const acct = await accountCopy(s.id, id);
    const curl = Object.values(acct.exercises).find((e) => e.exerciseId === ex['Barbell Curl'])!;
    const row = Object.values(acct.exercises).find((e) => e.exerciseId === ex['Barbell Bent-Over Row'])!;
    expect(curl.types.length).toBe(4); // the coach's change, on the broken-out curl
    expect(row.logs.length).toBe(1); // the set logged with no signal
    expect(acct.blocks.filter((x) => !x.closed && x.members.length > 1)).toEqual([]); // the phone's break kept
  });

  it('a swap waits for the end of a superset round, and a change to a finished exercise is out of date', async () => {
    let s = await running();
    // Move to superset B and log the row's first set: the round is part-way.
    const b = s.blocks.find((x) => x.letter === 'B')!;
    const rowKey = b.members[0];
    const sent: NewChange[] = [];
    const step = (next: Session) => { sent.push(...sessionChanges(s, next)); s = next; };
    step({ ...s, curBlock: b.id, curMember: rowKey });
    step(logSet(startExercise(s, Date.now() - 4000), lbSet(95), {}, Date.now() - 3000).session);
    await send(sent);
    // The row has a set logged in this round and the curl not yet: swapping the row waits for the round's end.
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'swap', exercise_id: ex['Barbell Bent-Over Row'], to_exercise_id: ex['Dumbbell Lateral Raise'] }] });
    expect(await acceptToday(id)).toMatchObject({ ok: false, code: 'wait' });
    expect((await status(id)).status).toBe('pending');

    const late = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'set_sets', exercise_id: ex['Barbell Bench Press'], sets: 1 }] });
    expect(await acceptToday(late)).toMatchObject({ ok: false, code: 'out_of_date' });
  });

  it('if a set is logged while Accept is worked out, the app is asked to read again, and nothing logged moves', async () => {
    let s = await running();
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [{ action: 'swap', exercise_id: ex['Barbell Curl'], to_exercise_id: ex['Dumbbell Lateral Raise'] }] });
    const d = todayDecision(await contextFor(id), Date.now());
    const next = logSet(s, lbSet(155), {}, Date.now()).session;
    await send(sessionChanges(s, next));
    s = next;
    expect('send' in d && (await decide(id, true, { today: d.send }))).toMatchObject({ ok: false, code: 'try_again' });
    expect(await acceptToday(id)).toMatchObject({ ok: true });
    expect((await loggedSets(s.id)).length).toBe(3);
  });

  it('rows that would move a logged set to another exercise are refused, whatever the app sends', async () => {
    const s = await running();
    const id = await coachCard('today_change', 'today', { local_date: today, changes: [] });
    const ctx = await contextFor(id);
    const acct = sessionFromRows(ctx.session!, ctx.blocks, ctx.exercises, ctx.sets, factsFrom(ctx.library));
    const benchKey = Object.values(acct.exercises).find((e) => e.exerciseId === ex['Barbell Bench Press'])!.key;
    acct.exercises[benchKey].exerciseId = ex['Dumbbell Bench Press']; // an in-place swap after sets were logged
    const { sessionRows } = await import('@/rules/sync');
    const rows = sessionRows(acct);
    const r = await decide(id, true, { today: { mode: 'session', session_id: s.id, mark: ctx.mark, rows: { session: rows.session, blocks: rows.blocks, exercises: rows.exercises } } });
    expect(r).toMatchObject({ ok: false, code: 'invalid', status: 'pending' });
    expect(r.message).toMatch(/set already logged/);
    expect((await loggedSets(s.id)).every((x) => x.exercise_id === ex['Barbell Bench Press'])).toBe(true);
  });

  it('starting weights for an exercise swapped in come from its last session', async () => {
    const ctx: ProposalContext['memory'] = [{ exercise_id: 'x', session_id: 's', local_date: '2026-11-01', started_at: '2026-11-01T10:00:00Z', set_number: 1,
      weight_lb: 40, entered_value: 40, entered_unit: 'lb', reps: 10, set_type: 'working', recent: true }];
    expect(seedFromMemory(ctx)('x', 2, false)[0]).toBe(40);
  });
});
