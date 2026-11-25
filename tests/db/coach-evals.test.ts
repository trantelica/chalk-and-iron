// Stage 4A: how the coach eval data is loaded (design Section 9, "Coach
// behaviour evals"). Each state loads in one step, only into the account
// marked as the eval account, and says what its scenarios need.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, starter, type Db } from './harness';
import { fingerprint } from './fixtures';
import { addDays, buildState, mondayOf, STATES, trainingDay } from '../coach-evals/states.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let db: Db;
let nate: string;
let evalAccount: string;
const now = new Date();
const today = trainingDay(now);

const load = (name: string) =>
  db.server<{ r: { state: string; user_id: string; rows: Record<string, number> } }>(
    `select load_coach_eval_state($1, $2) as r`, [JSON.stringify(starter), JSON.stringify(buildState(name as keyof typeof STATES, { starter, now }))])
    .then((rows) => rows[0].r);
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.server<T>(sql, params))[0];

beforeAll(async () => {
  db = await makeDb();
  nate = await db.register('nate@example.test', 'Nate');
  evalAccount = await db.register('test@example.test', 'Test Account', { inviter: nate });
});

describe('the eval account', () => {
  it('nothing loads until an account is marked as the eval account', async () => {
    await expect(load('standard')).rejects.toThrow(/No account is marked/);
  });

  it('is marked by the SQL step in docs/SETUP.md, which marks only "Test Account"', async () => {
    const setup = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'SETUP.md'), 'utf8');
    const step = setup.match(/```sql\n(-- Mark the coach eval account[\s\S]*?)```/);
    expect(step, 'the marking step in docs/SETUP.md').toBeTruthy();
    await db.server(step![1]);
    expect(await db.server(`select display_name from profiles where is_eval_account`)).toEqual([{ display_name: 'Test Account' }]);
    // Run twice, it changes nothing; there can never be two.
    await db.server(step![1]);
    await expect(db.server(`update profiles set is_eval_account = true where id = $1`, [nate])).rejects.toThrow(/profiles_one_eval_account/);
  });

  it('cannot be marked, or reset, from the app or by a coach', async () => {
    for (const coach of [false, true]) {
      await expect(db.as(nate, `update profiles set is_eval_account = true where id = $1`, [nate], { coach })).rejects.toThrow(/permission denied/);
      await expect(db.as(evalAccount, `select load_coach_eval_state('{}', '{}')`, [], { coach })).rejects.toThrow(/permission denied/);
    }
  });

  it('a reset touches no other account', async () => {
    await db.server(`insert into cardio_logs (user_id, local_date, type, duration_seconds) values ($1, '2026-11-16', 'Run', 900)`, [nate]);
    const others = async () => {
      const all = await fingerprint(db);
      const mine = await db.server<{ n: string }>(`select md5(string_agg(x::text, '|' order by x::text)) as n from (
        select 'e' || e.name || e.version as x from exercises e where e.user_id = $1
        union all select 'c' || c.type from cardio_logs c where c.user_id = $1
        union all select 'p' || p.display_name || p.is_eval_account from profiles p where p.id = $1) q`, [nate]);
      return { tables: Object.keys(all).length, mine: mine[0].n };
    };
    const before = await others();
    await load('standard');
    await load('empty_profile');
    expect(await others()).toEqual(before);
  });
});

describe('each state', () => {
  it('every state loads, all or nothing', async () => {
    for (const name of Object.keys(STATES)) {
      const r = await load(name);
      expect(r.state, name).toBe(name);
      expect(r.user_id).toBe(evalAccount);
    }
  });

  it('a state that names a missing exercise loads nothing at all', async () => {
    await load('standard');
    const before = await fingerprint(db);
    const bad = buildState('standard', { starter, now });
    (bad.rows.find((b) => b.table === 'workout_items')!.rows[0] as { exercise: string }).exercise = 'Unicycle Bench Press';
    await expect(db.server(`select load_coach_eval_state($1, $2)`, [JSON.stringify(starter), JSON.stringify(bad)])).rejects.toThrow(/Unicycle Bench Press/);
    const notAllowed = { ...buildState('standard', { starter, now }), rows: [{ table: 'profiles', rows: [{ is_admin: true }] }] };
    await expect(db.server(`select load_coach_eval_state($1, $2)`, [JSON.stringify(starter), JSON.stringify(notAllowed)])).rejects.toThrow(/may not fill: profiles/);
    expect(await fingerprint(db)).toEqual(before);
  });

  it('empty_profile (E1): the starter library and nothing else', async () => {
    await load('empty_profile');
    const c = await one<Record<string, number>>(`select
      (select count(*)::int from exercises where user_id = $1) as exercises,
      (select count(*)::int from gyms where user_id = $1) as gyms,
      (select count(*)::int from sessions where user_id = $1) as sessions,
      (select count(*)::int from campaigns where user_id = $1) as campaigns,
      (select count(*)::int from proposals where user_id = $1) as proposals,
      (select count(*)::int from weekly_checkins where user_id = $1) as checkins`, [evalAccount]);
    expect(c).toEqual({ exercises: starter.exercises.length, gyms: 0, sessions: 0, campaigns: 0, proposals: 0, checkins: 0 });
    const intake = await one(`select coach_style, priorities, goals, progression_pace from coach_profiles where user_id = $1`, [evalAccount]);
    expect(intake).toEqual({ coach_style: null, priorities: [], goals: '', progression_pace: null });
  });

  it('standard: two gyms, an intake, eight weeks of history, an active campaign, past proposals and check-ins', async () => {
    await load('standard');
    const gyms = await db.server(`select name, is_default from gyms where user_id = $1 order by name`, [evalAccount]);
    expect(gyms).toEqual([{ name: 'Home gym', is_default: true }, { name: 'Hotel gym', is_default: false }]);
    const intake = await one<Record<string, unknown>>(`select coach_style, progression_pace, days_per_week, workout_minutes, priorities from coach_profiles where user_id = $1`, [evalAccount]);
    expect(intake).toMatchObject({ coach_style: 'neutral', progression_pace: 'moderate', days_per_week: 3, workout_minutes: 60 });
    const first = addDays(mondayOf(today), -56);
    const s = await one<{ n: number; first: string; last: string; active: number }>(`select count(*)::int as n,
      to_char(min(local_date), 'YYYY-MM-DD') as first, to_char(max(local_date), 'YYYY-MM-DD') as last,
      count(*) filter (where status = 'active')::int as active from sessions where user_id = $1`, [evalAccount]);
    expect(s.first >= first && s.first < addDays(first, 7)).toBe(true);
    expect(s.last < today).toBe(true);
    expect(s.n).toBeGreaterThanOrEqual(23); // 8 weeks of 3, less one missed, plus this week so far
    expect(s.active).toBe(0);
    const [active] = await db.server<{ name: string; ends: string }>(`select name, to_char(start_date + week_count * 7 - 1, 'YYYY-MM-DD') as ends
      from campaigns where user_id = $1 and status = 'active'`, [evalAccount]);
    expect(active.name).toBe('Strength Block');
    expect(active.ends > addDays(today, 7)).toBe(true);
    // Today has Push A planned, and nothing is running.
    const [plan] = await db.server<{ name: string }>(`select w.name from campaign_days d join campaigns c on c.id = d.campaign_id
      join workouts w on w.id = d.workout_id where c.user_id = $1 and c.status = 'active'
      and c.start_date + (d.week - 1) * 7 + (d.weekday - 1) = $2::date`, [evalAccount, today]);
    expect(plan.name).toBe('Push A');
    const props = await db.server<{ status: string; decline_reason: string | null }>(
      `select status, decline_reason from proposals where user_id = $1 order by created_at`, [evalAccount]);
    expect(props).toEqual([
      { status: 'rejected', decline_reason: 'Front squats hurt my wrists.' },
      { status: 'accepted', decline_reason: null },
      { status: 'rejected', decline_reason: null },
      { status: 'rejected', decline_reason: 'too much volume' },
    ]);
    const marks = await db.server<{ w: string }>(`select to_char(week_start, 'YYYY-MM-DD') as w from weekly_checkins where user_id = $1 order by 1 desc`, [evalAccount]);
    expect(marks.slice(0, 4).map((m) => m.w)).toEqual([1, 2, 3, 4].map((n) => addDays(mondayOf(today), -7 * n)));
    // Records are worked out as the app does.
    const recs = await one<{ n: number }>(`select count(*)::int as n from set_logs where user_id = $1 and record_types <> '{}'`, [evalAccount]);
    expect(recs.n).toBeGreaterThan(0);
    // The hotel gym has dumbbells to 50 lb, a bench and bands, and nothing else.
    const hotel = await one<{ equipment: string[]; notes: string }>(`select equipment, notes from gyms where user_id = $1 and name = 'Hotel gym'`, [evalAccount]);
    expect(hotel.equipment).toEqual(['dumbbell', 'bench', 'band', 'bodyweight']);
    expect(hotel.notes).toMatch(/50 lb/);
  });

  it('workout_running and workout_running_superset (E4, E5): today\'s Push A is running, at the right place', async () => {
    const current = async () => one<{ status: string; local_date: string; exercise: string; logged: number }>(
      `select s.status, to_char(s.local_date, 'YYYY-MM-DD') as local_date, se.exercise_name_then as exercise,
        (select count(*)::int from set_logs l join session_exercises x on x.id = l.session_exercise_id where x.session_id = s.id) as logged
       from sessions s join session_exercises se on se.id = s.current_session_exercise_id
       where s.user_id = $1 and s.status = 'active'`, [evalAccount]);
    await load('workout_running');
    expect(await current()).toMatchObject({ status: 'active', local_date: today, exercise: 'Barbell Bench Press' });
    await load('workout_running_superset');
    const c = await current();
    expect(c).toMatchObject({ status: 'active', local_date: today, exercise: 'Cable Rope Pushdown' });
    expect(c.logged).toBe(4 + 3 + 2); // bench 4, press 3, one round of the superset
  });

  it('declined_no_reason (E7): the latest card was declined with no reason', async () => {
    await load('declined_no_reason');
    const [latest] = await db.server(`select status, decline_reason from proposals where user_id = $1 order by created_at desc limit 1`, [evalAccount]);
    expect(latest).toEqual({ status: 'rejected', decline_reason: null });
  });

  it('campaign_last_week and aggressive_misses (E8, E10, E13): the campaign ends this Sunday', async () => {
    for (const name of ['campaign_last_week', 'aggressive_misses']) {
      await load(name);
      const [c] = await db.server<{ ends: string }>(`select to_char(start_date + week_count * 7 - 1, 'YYYY-MM-DD') as ends
        from campaigns where user_id = $1 and status = 'active'`, [evalAccount]);
      expect(c.ends, name).toBe(addDays(mondayOf(today), 6));
    }
    const pace = await one(`select progression_pace from coach_profiles where user_id = $1`, [evalAccount]);
    expect(pace).toEqual({ progression_pace: 'aggressive' });
    // Reps missed on bench at each of the last three weeks' sessions.
    const misses = await db.server<{ short: number }>(`select count(*) filter (where l.reps < se.planned_reps)::int as short
      from set_logs l join session_exercises se on se.id = l.session_exercise_id join sessions s on s.id = se.session_id
      where s.user_id = $1 and se.exercise_name_then = 'Barbell Bench Press' group by s.id, s.local_date order by s.local_date desc limit 3`, [evalAccount]);
    expect(misses.every((m) => m.short >= 2)).toBe(true);
  });

  it('intake_no_campaign (E2): nothing active, history kept', async () => {
    await load('intake_no_campaign');
    const c = await one(`select count(*) filter (where status = 'active')::int as active, count(*)::int as all from campaigns where user_id = $1`, [evalAccount]);
    expect(c).toEqual({ active: 0, all: 2 });
  });

  it('two_missed (E11): last week two of three planned workouts have no session', async () => {
    await load('two_missed');
    const lastWeek = addDays(mondayOf(today), -7);
    const n = await one(`select count(*)::int as n from sessions where user_id = $1 and local_date between $2::date and $2::date + 6`, [evalAccount, lastWeek]);
    expect(n).toEqual({ n: 1 });
  });

  it('steady_all_hit (E12): pace Steady, and the last bench session hit every rep', async () => {
    await load('steady_all_hit');
    const pace = await one(`select progression_pace from coach_profiles where user_id = $1`, [evalAccount]);
    expect(pace).toEqual({ progression_pace: 'steady' });
    const sets = await db.server<{ reps: number; planned: number; weight: string }>(`select l.reps, se.planned_reps as planned, l.weight_lb::text as weight
      from set_logs l join session_exercises se on se.id = l.session_exercise_id join sessions s on s.id = se.session_id
      where s.user_id = $1 and se.exercise_name_then = 'Barbell Bench Press'
        and s.local_date = (select max(local_date) from sessions where user_id = $1 and workout_name = 'Push A')
      order by l.set_number`, [evalAccount]);
    expect(sets).toHaveLength(4);
    expect(sets.every((x) => x.reps === x.planned && x.weight === sets[0].weight)).toBe(true);
  });

  it('style and injury states (E14, E15) change only the intake', async () => {
    await load('style_supportive');
    expect(await one(`select coach_style from coach_profiles where user_id = $1`, [evalAccount])).toEqual({ coach_style: 'supportive' });
    await load('style_challenging');
    expect(await one(`select coach_style from coach_profiles where user_id = $1`, [evalAccount])).toEqual({ coach_style: 'challenging' });
    await load('knee_injury');
    const k = await one<{ injuries_and_limits: string; exercises_to_avoid: string }>(`select injuries_and_limits, exercises_to_avoid from coach_profiles where user_id = $1`, [evalAccount]);
    expect(k.exercises_to_avoid).toBe('Barbell Back Squat');
    expect(k.injuries_and_limits).toMatch(/knee/i);
  });

  it('the account\'s sign-in, devices and coach connections are kept', async () => {
    await db.server(`insert into push_subscriptions (user_id, endpoint, keys) values ($1, 'https://push.example/eval', '{}')`, [evalAccount]);
    await load('standard');
    const kept = await one(`select (select count(*)::int from push_subscriptions where user_id = $1) as devices,
      (select display_name from profiles where id = $1) as name, (select is_eval_account from profiles where id = $1) as marked`, [evalAccount]);
    expect(kept).toEqual({ devices: 1, name: 'Test Account', marked: true });
  });
});

describe('the scenario list', () => {
  it('names E1 to E19 once each, each with a known state', async () => {
    const scenarios = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'coach-evals', 'scenarios.json'), 'utf8')) as {
      scenarios: Array<{ id: string; state: string | string[]; core: boolean; says: string[] }>;
    };
    expect(scenarios.scenarios.map((s) => s.id)).toEqual(Array.from({ length: 19 }, (_, i) => `E${i + 1}`));
    for (const s of scenarios.scenarios) {
      for (const st of [s.state].flat()) expect(Object.keys(STATES), `${s.id} ${st}`).toContain(st);
      expect(s.says.length, s.id).toBeGreaterThan(0);
    }
    const spec = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'SPEC.md'), 'utf8');
    const core = [...spec.matchAll(/^\| (E\d+) ★/gm)].map((m) => m[1]);
    expect(scenarios.scenarios.filter((s) => s.core).map((s) => s.id)).toEqual(core);
  });
});
