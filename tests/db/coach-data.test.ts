// Stage 4A: the coach's new data (spec Section 4, "Coach intake" and
// "Proposals in the app"; spec Section 8, Coach; design Section 2,
// coach_profiles, proposals and weekly_checkins).
//   * An intake answer outside its list, or more than three priorities, is refused.
//   * Decline works with no reason and with a reason of up to 300 characters; a longer one is refused.
//   * Reading one week's summary twice records one check-in.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { addDays, trainingDay } from '@/rules/days';

let db: Db;
let a: string;
let b: string;

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
});

const intake = (user: string, set: string, params: unknown[] = [], coach = false) =>
  db.as(user, `update coach_profiles set ${set} where user_id = $1 returning version`, [user, ...params], { coach });

describe('the coach intake', () => {
  it('starts empty, and takes a full set of answers from the person', async () => {
    const [empty] = await db.as<Record<string, unknown>>(a, `select coach_style, experience, priorities, progression_pace, workout_minutes,
      days_per_week, variety, exercises_liked, exercises_to_avoid, how_to_coach_me from coach_profiles`);
    expect(empty).toEqual({
      coach_style: null, experience: null, priorities: [], progression_pace: null, workout_minutes: null,
      days_per_week: null, variety: null, exercises_liked: '', exercises_to_avoid: '', how_to_coach_me: '',
    });
    const priorities = [{ value: 'strength' }, { value: 'other', text: 'Rock climbing' }, { value: 'habit' }];
    const done = await intake(a, `coach_style = 'challenging', experience = 'returning', priorities = $2,
      progression_pace = 'steady', workout_minutes = 60, days_per_week = 3, variety = 'some',
      exercises_liked = 'Deadlifts', exercises_to_avoid = 'Barbell Back Squat', how_to_coach_me = 'Keep it short.'`,
      [JSON.stringify(priorities)]);
    expect(done).toHaveLength(1);
    const [saved] = await db.as<{ priorities: unknown }>(a, `select priorities from coach_profiles`);
    expect(saved.priorities).toEqual(priorities);
  });

  it('takes every answer in each list, and every answer may be cleared again', async () => {
    for (const v of ['supportive', 'challenging', 'neutral']) expect(await intake(a, `coach_style = $2`, [v])).toHaveLength(1);
    for (const v of ['new', 'returning', 'intermediate', 'experienced', 'all_in']) expect(await intake(a, `experience = $2`, [v])).toHaveLength(1);
    for (const v of ['steady', 'moderate', 'aggressive']) expect(await intake(a, `progression_pace = $2`, [v])).toHaveLength(1);
    for (const v of ['familiar', 'some', 'lots']) expect(await intake(a, `variety = $2`, [v])).toHaveLength(1);
    for (const v of ['strength', 'muscle', 'fat_loss', 'general_fitness', 'endurance', 'mobility', 'sport', 'habit']) {
      expect(await intake(a, `priorities = $2`, [JSON.stringify([{ value: v }])])).toHaveLength(1);
    }
    for (const v of [10, 240]) expect(await intake(a, `workout_minutes = $2`, [v])).toHaveLength(1);
    for (const v of [1, 7]) expect(await intake(a, `days_per_week = $2`, [v])).toHaveLength(1);
    expect(await intake(a, `coach_style = null, experience = null, priorities = '[]', progression_pace = null,
      workout_minutes = null, days_per_week = null, variety = null, exercises_liked = '', exercises_to_avoid = '',
      how_to_coach_me = ''`)).toHaveLength(1);
  });

  it('refuses an answer outside its list', async () => {
    const bad: Array<[string, unknown]> = [
      ['coach_style = $2', 'harsh'], ['experience = $2', 'expert'], ['progression_pace = $2', 'fast'],
      ['variety = $2', 'none'], ['workout_minutes = $2', 9], ['workout_minutes = $2', 241],
      ['days_per_week = $2', 0], ['days_per_week = $2', 8],
      ['exercises_liked = $2', 'x'.repeat(2001)], ['exercises_to_avoid = $2', 'x'.repeat(2001)],
      ['how_to_coach_me = $2', 'x'.repeat(2001)],
    ];
    for (const [set, v] of bad) await expect(intake(a, set, [v]), `${set} ${String(v).slice(0, 20)}`).rejects.toThrow(/check/);
    expect(await intake(a, `how_to_coach_me = $2`, ['x'.repeat(2000)])).toHaveLength(1);
  });

  it('refuses more than three priorities, unknown ones, repeats and a badly written "other"', async () => {
    const bad: unknown[] = [
      [{ value: 'strength' }, { value: 'muscle' }, { value: 'habit' }, { value: 'endurance' }],
      [{ value: 'flexibility' }],
      [{ value: 'strength' }, { value: 'strength' }],
      [{ value: 'other' }],
      [{ value: 'other', text: '   ' }],
      [{ value: 'other', text: 'x'.repeat(101) }],
      [{ value: 'other', text: 'Climbing' }, { value: 'other', text: 'climbing ' }],
      [{ value: 'strength', text: 'extra' }],
      [{ value: 'other', text: 'Climbing', rank: 1 }],
      ['strength'],
      { value: 'strength' },
      'strength',
    ];
    for (const p of bad) await expect(intake(a, `priorities = $2`, [JSON.stringify(p)]), JSON.stringify(p)).rejects.toThrow(/check/);
    const two = [{ value: 'other', text: 'Climbing' }, { value: 'other', text: 'Skiing' }, { value: 'strength' }];
    expect(await intake(a, `priorities = $2`, [JSON.stringify(two)])).toHaveLength(1);
    expect(await intake(a, `priorities = $2`, [JSON.stringify([{ value: 'other', text: 'x'.repeat(100) }])])).toHaveLength(1);
  });

  it('is the person\'s to change: a coach reads it, and cannot change it', async () => {
    const [seen] = await db.as<{ n: number }>(a, `select count(*)::int as n from coach_profiles where coach_style is not null or coach_style is null`, [], { coach: true });
    expect(seen.n).toBe(1);
    expect(await intake(a, `coach_style = 'supportive'`, [], true)).toEqual([]);
    expect(await db.as(b, `update coach_profiles set coach_style = 'supportive' where user_id = $1 returning 1`, [a])).toEqual([]);
  });

  it('an edit to the intake makes a pending profile card out of date', async () => {
    const [p] = await db.as<{ id: string }>(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload)
      values ($1, 'Claude', 'profile_update', 'profile', '{"Pace becomes Moderate"}', '{}') returning id`, [a], { coach: true });
    const [{ version }] = await db.as<{ version: number }>(a, `select version from coach_profiles`);
    await db.as(a, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, 'coach_profiles', $1, $3)`,
      [a, p.id, version], { coach: true });
    await intake(a, `progression_pace = 'aggressive'`);
    const [after] = await db.server<{ status: string }>(`select status from proposals where id = $1`, [p.id]);
    expect(after.status).toBe('out_of_date');
  });
});

describe('the decline reason', () => {
  const card = async (source = 'ChatGPT') => (await db.server<{ id: string }>(
    `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, $2, 'workout', 'library', '{"New Push B"}', '{}') returning id`,
    [a, source]))[0].id;
  // Stage 4D's Decline is the only thing that will write it; here the server stands in for it.
  const decline = (id: string, reason: string | null) => db.server(
    `update proposals set status = 'rejected', decided_at = now(), decline_reason = $2 where id = $1 returning decline_reason`, [id, reason]);

  it('may be left out, or be one line of up to 300 characters', async () => {
    expect(await decline(await card(), null)).toEqual([{ decline_reason: null }]);
    expect(await decline(await card(), 'too much volume')).toEqual([{ decline_reason: 'too much volume' }]);
    expect(await decline(await card(), 'x'.repeat(300))).toHaveLength(1);
  });

  it('refuses a longer one, an empty one and one with a line break', async () => {
    for (const r of ['x'.repeat(301), '', '   ', 'too much\nvolume']) {
      await expect(decline(await card(), r), JSON.stringify(r)).rejects.toThrow(/decline_reason/);
    }
  });

  it('belongs only on a declined card from a coach', async () => {
    const id = await card();
    await expect(db.server(`update proposals set decline_reason = 'x' where id = $1`, [id])).rejects.toThrow(/decline_reason/);
    await expect(decline(await card('planner'), 'not today')).rejects.toThrow(/decline_reason/);
  });

  it('a coach can read it, and can neither write it nor change it', async () => {
    const id = await card();
    await decline(id, 'too much volume');
    const seen = await db.as(a, `select status, decline_reason from proposals where id = $1`, [id], { coach: true });
    expect(seen).toEqual([{ status: 'rejected', decline_reason: 'too much volume' }]);
    await expect(db.as(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload, decline_reason)
      values ($1, 'ChatGPT', 'workout', 'library', '{"x"}', '{}', 'x')`, [a], { coach: true })).rejects.toThrow(/permission denied/);
    for (const coach of [true, false]) {
      const changed = await db.as(a, `update proposals set decline_reason = 'changed' where id = $1 returning 1`, [id], { coach }).catch(() => []);
      expect(changed).toEqual([]);
    }
  });
});

describe('weekly check-ins', () => {
  const record = (user: string, weekOf: string, coach = true) =>
    db.as<{ r: { week_start: string; added: boolean } }>(user, `select record_weekly_checkin($1::date) as r`, [weekOf], { coach })
      .then((rows) => rows[0].r);
  const marks = (user: string) =>
    db.server<{ week_start: string }>(`select to_char(week_start, 'YYYY-MM-DD') as week_start from weekly_checkins where user_id = $1 order by 1`, [user]);

  it('reading one week\'s summary twice records one check-in, on that week\'s Monday', async () => {
    expect(await record(a, '2026-11-12')).toEqual({ week_start: '2026-11-09', added: true });
    expect(await record(a, '2026-11-09')).toEqual({ week_start: '2026-11-09', added: false });
    expect(await record(a, '2026-11-15')).toEqual({ week_start: '2026-11-09', added: false });
    expect(await marks(a)).toEqual([{ week_start: '2026-11-09' }]);
    const [first] = await db.server<{ first_read_at: Date }>(`select first_read_at from weekly_checkins where user_id = $1`, [a]);
    expect(first.first_read_at).toBeInstanceOf(Date);
  });

  it('takes the week now running, and refuses a week that has not started', async () => {
    const today = trainingDay(new Date(), 'America/Denver');
    await expect(record(a, today)).resolves.toMatchObject({ added: true });
    const next = addDays(today, 7);
    await expect(record(a, next)).rejects.toThrow(/not started/);
  });

  it('is recorded only by a connected coach, for its own person', async () => {
    await expect(record(a, '2026-11-02', false)).rejects.toThrow(/connected coach/);
    await record(b, '2026-11-02');
    expect(await marks(b)).toEqual([{ week_start: '2026-11-02' }]);
    expect((await marks(a)).map((m) => m.week_start)).not.toContain('2026-11-02');
    const seenByA = await db.as(a, `select count(*)::int as n from weekly_checkins where user_id = $1`, [b], { coach: true });
    expect(seenByA).toEqual([{ n: 0 }]);
  });

  it('cannot be added, changed or removed directly, by the coach or the person', async () => {
    for (const coach of [true, false]) {
      await expect(db.as(a, `insert into weekly_checkins (user_id, week_start) values ($1, '2026-10-26')`, [a], { coach })).rejects.toThrow(/permission denied/);
      await expect(db.as(a, `update weekly_checkins set week_start = '2026-10-26' where user_id = $1`, [a], { coach })).rejects.toThrow(/permission denied/);
      await expect(db.as(a, `delete from weekly_checkins where user_id = $1`, [a], { coach })).rejects.toThrow(/permission denied/);
    }
  });

  it('a deactivated account\'s coach cannot record one', async () => {
    const c = await db.register('c@example.test', 'Casey', { inviter: a });
    await db.as(a, `select admin_set_active($1, false)`, [c]);
    await expect(record(c, '2026-11-09')).rejects.toThrow(/not_signed_in/);
    expect(await marks(c)).toEqual([]);
  });

  it('goes with the account when the account is removed', async () => {
    const d = await db.register('d@example.test', 'Dana', { inviter: a });
    await record(d, '2026-11-09');
    await db.pg.query(`delete from auth.users where id = $1`, [d]);
    expect(await marks(d)).toEqual([]);
  });
});

describe('the call log', () => {
  const log = (user: string, coach = true, tool = 'get_profile', client = 'ChatGPT', ok = true) =>
    db.as(user, `select record_connector_call($1, $2, $3)`, [client, tool, ok], { coach });
  const calls = (user: string) => db.server<{ tool: string; client_name: string; ok: boolean }>(
    `select tool, client_name, ok from connector_calls where user_id = $1 order by called_at`, [user]);

  it('a connected coach notes each call, for its own person, stamped now', async () => {
    const e = await db.register('e@example.test', 'Eli', { inviter: a });
    await log(e);
    await log(e, true, 'list_gyms', 'Claude', false);
    expect(await calls(e)).toEqual([
      { tool: 'get_profile', client_name: 'ChatGPT', ok: true },
      { tool: 'list_gyms', client_name: 'Claude', ok: false },
    ]);
  });

  it('refuses the person\'s own sign-in, a badly named tool and a long client name', async () => {
    await expect(log(a, false)).rejects.toThrow(/connected coach/);
    await expect(log(a, true, 'DROP TABLE')).rejects.toThrow(/tool name/);
    await expect(log(a, true, 'get_profile', 'x'.repeat(81))).rejects.toThrow(/tool name/);
  });

  it('cannot be written directly any more, and keeps only 30 days', async () => {
    for (const coach of [true, false]) {
      await expect(db.as(a, `insert into connector_calls (user_id, tool, ok) values ($1, 'get_profile', true)`, [a], { coach })).rejects.toThrow(/permission denied/);
    }
    const f = await db.register('f@example.test', 'Fran', { inviter: a });
    await db.server(`insert into connector_calls (user_id, tool, ok, called_at) values ($1, 'old_call', true, now() - interval '31 days')`, [f]);
    await log(f);
    expect((await calls(f)).map((c) => c.tool)).toEqual(['get_profile']);
  });
});
