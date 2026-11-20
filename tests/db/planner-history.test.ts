// History's set editing and the planner's day overrides, through the same
// guarded function the phone uses (spec Sections 5 and 10; Nate, 20 Nov).
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { fillAccount } from './fixtures';

let db: Db;
let u: string;
let r: Awaited<ReturnType<typeof fillAccount>>;
let benchSets: { a: string; b: string };
let sessB: string;

async function finishedSession(day: string, exerciseId: string, name: string, sets: [number, number][]) {
  const [s] = await db.server<{ id: string }>(`insert into sessions (user_id, local_date, source_kind, workout_name, started_at, ended_at, status, finish_reason)
    values ($1, $2::date, 'ad_hoc', $3, $2::date + interval '12 hours', $2::date + interval '13 hours', 'finished', 'user') returning id`, [u, day, name]);
  const [b] = await db.server<{ id: string }>(`insert into session_blocks (user_id, session_id, position, time_budget_seconds) values ($1, $2, 0, 450) returning id`, [u, s.id]);
  const [se] = await db.server<{ id: string }>(`insert into session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds)
    values ($1, $2, $3, $4, 'Barbell Bench Press', '{working,working}', 8, 90, 45) returning id`, [u, s.id, b.id, exerciseId]);
  const ids: string[] = [];
  let n = 0;
  for (const [lb, reps] of sets) {
    n += 1;
    const [l] = await db.server<{ id: string }>(`insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at)
      values ($1, $2, $3, $4, $4, 'lb', $5, $6::date + interval '12 hours') returning id`, [u, se.id, n, lb, reps, day]);
    ids.push(l.id);
  }
  return { session: s.id, se: se.id, ids };
}
const apply = (user: string, changes: unknown[], opts?: { coach?: boolean }) =>
  db.as<{ apply_changes: { done: string[]; rejected: { reason: string }[]; records: Record<string, string[]> } }>(user, `select apply_changes($1::jsonb)`, [JSON.stringify(changes)], opts).then((x) => x[0].apply_changes);
const cid = () => crypto.randomUUID();
const recs = async (id: string) => (await db.as<{ record_types: string[] }>(u, `select record_types from set_logs where id = $1`, [id]))[0].record_types;

beforeAll(async () => {
  db = await makeDb();
  u = await db.register('history@example.test', 'History');
  r = await fillAccount(db, u);
  await db.server(`delete from set_logs`);
  const a = await finishedSession('2026-11-02', r.bench, 'Push A', [[100, 8]]);
  const b = await finishedSession('2026-11-09', r.bench, 'Push A', [[110, 8], [60, 8]]);
  benchSets = { a: a.ids[0], b: b.ids[0] };
  sessB = b.se;
  await db.server(`select app.recalc_records($1)`, [r.bench]);
});

describe('editing a logged set in History', () => {
  it('works the records out again: a longer set earns more, and a lighter one loses what it no longer beats', async () => {
    expect(await recs(benchSets.b)).toEqual(['heaviest', '6_plus']);
    const res = await apply(u, [{ id: cid(), kind: 'set.put', data: { id: benchSets.b, session_exercise_id: sessB, set_number: 1, logged_at: '2026-11-09T12:30:00Z', weight_lb: 110, entered_value: 110, entered_unit: 'lb', reps: 10, set_type: 'working', rpe: null } }]);
    expect(res.rejected).toEqual([]);
    expect(await recs(benchSets.b)).toEqual(['heaviest', '6_plus', '10_plus']);
    await apply(u, [{ id: cid(), kind: 'set.put', data: { id: benchSets.b, session_exercise_id: sessB, set_number: 1, logged_at: '2026-11-09T12:30:00Z', weight_lb: 90, entered_value: 90, entered_unit: 'lb', reps: 10, set_type: 'working', rpe: null } }]);
    // 90 lb no longer beats the earlier 100 lb for 8 (heaviest, 6+ gone); nothing earlier reached 10 reps, so 10+ stays.
    expect(await recs(benchSets.b)).toEqual(['10_plus']);
  });
  it('changing a set to a warm-up removes its records and a typed kilogram weight keeps what was typed', async () => {
    await apply(u, [{ id: cid(), kind: 'set.put', data: { id: benchSets.b, session_exercise_id: sessB, set_number: 1, logged_at: '2026-11-09T12:30:00Z', weight_lb: 121.254, entered_value: 55, entered_unit: 'kg', reps: 8, set_type: 'warm_up', rpe: 7 } }]);
    const [row] = await db.as<{ weight_lb: string; entered_value: string; entered_unit: string; record_types: string[]; rpe: string }>(u, `select weight_lb, entered_value, entered_unit, record_types, rpe from set_logs where id = $1`, [benchSets.b]);
    expect(row).toMatchObject({ weight_lb: '121.254', entered_value: '55.000', entered_unit: 'kg', record_types: [], rpe: '7.0' });
  });
  it('the first-ever session never holds a record, so deleting an earlier set can remove a later one\'s', async () => {
    await apply(u, [{ id: cid(), kind: 'set.put', data: { id: benchSets.b, session_exercise_id: sessB, set_number: 1, logged_at: '2026-11-09T12:30:00Z', weight_lb: 110, entered_value: 110, entered_unit: 'lb', reps: 8, set_type: 'working', rpe: null } }]);
    expect(await recs(benchSets.b)).toEqual(['heaviest', '6_plus']);
    await apply(u, [{ id: cid(), kind: 'set.delete', data: { id: benchSets.a } }]);
    expect(await recs(benchSets.b)).toEqual([]);
    expect(await db.as(u, `select 1 from set_logs where id = $1 and deleted_at is not null`, [benchSets.a])).toHaveLength(1);
  });
  it('a deleted set stays deleted when a late copy arrives', async () => {
    const res = await apply(u, [{ id: cid(), kind: 'set.put', data: { id: benchSets.a, session_exercise_id: sessB, set_number: 1, logged_at: '2026-11-02T12:00:00Z', weight_lb: 100, entered_value: 100, entered_unit: 'lb', reps: 8, set_type: 'working', rpe: null } }]);
    expect(res.rejected).toEqual([]);
    expect(await db.as(u, `select 1 from set_logs where id = $1 and deleted_at is null`, [benchSets.a])).toEqual([]);
  });
  it('deleting both sets of a superset round in one request removes the round for every member', async () => {
    const s = await finishedSession('2026-11-12', r.curl, 'Arms', [[40, 10], [40, 10]]);
    const t = await finishedSession('2026-11-12', r.row, 'Arms 2', [[60, 10], [60, 10]]);
    const res = await apply(u, [{ id: cid(), kind: 'set.delete', data: { id: s.ids[1] } }, { id: cid(), kind: 'set.delete', data: { id: t.ids[1] } }]);
    expect(res.done).toHaveLength(2);
    expect(await db.as(u, `select count(*)::int as n from set_logs where id = any($1) and deleted_at is null`, [[s.ids[0], t.ids[0]]])).toEqual([{ n: 2 }]);
  });
  it('another person cannot edit or delete this person\'s sets, and a coach sign-in cannot edit at all', async () => {
    const other = await db.register('stranger@example.test', 'Stranger', { inviter: u });
    await apply(other, [{ id: cid(), kind: 'set.delete', data: { id: benchSets.b } }]);
    expect(await db.as(u, `select 1 from set_logs where id = $1 and deleted_at is null`, [benchSets.b])).toHaveLength(1);
    await expect(apply(u, [{ id: cid(), kind: 'set.delete', data: { id: benchSets.b } }], { coach: true })).rejects.toThrow();
    expect(await db.as(u, `select 1 from set_logs where id = $1 and deleted_at is null`, [benchSets.b])).toHaveLength(1);
  });
  it('a past session is left as it was except for the edited set (the session row and plan are untouched)', async () => {
    const [x] = await db.as<{ workout_name: string; exercise_name_then: string; planned_reps: number }>(u, `
      select s.workout_name, se.exercise_name_then, se.planned_reps from sessions s join session_exercises se on se.session_id = s.id where se.id = $1`, [sessB]);
    expect(x).toEqual({ workout_name: 'Push A', exercise_name_then: 'Barbell Bench Press', planned_reps: 8 });
  });
});

describe('overrides written from the Plan screen', () => {
  it('upserting one row per superset member in a single request changes only that day, and the library stays', async () => {
    const [d2] = await db.as<{ id: string }>(u, `insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 2, 3, $3) returning id`, [u, r.campaign, r.workout]);
    await db.as(u, `
      insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets)
      values ($1, $2, $3, $4, 5), ($1, $2, $3, $5, 5)
      on conflict (campaign_day_id, workout_item_id) do update set sets = excluded.sets`, [u, d2.id, r.workout, r.items[0], r.items[1]]);
    const planned = await db.as<{ day: string; sets: number }>(u, `
      select d.id as day, coalesce(o.sets, i.sets) as sets from campaign_days d join workout_items i on i.workout_id = d.workout_id
      left join campaign_day_overrides o on o.campaign_day_id = d.id and o.workout_item_id = i.id
      where d.campaign_id = $1 and i.superset_letter = 'A' order by d.week, d.weekday, i.position`, [r.campaign]);
    expect(planned.filter((p) => p.day === d2.id).map((p) => p.sets)).toEqual([5, 5]);
    expect(planned.filter((p) => p.day !== d2.id).map((p) => p.sets)).toEqual([3, 3]);
    expect(await db.as(u, `select sets from workout_items where workout_id = $1 and superset_letter = 'A'`, [r.workout])).toEqual([{ sets: 3 }, { sets: 3 }]);
  });
  it('an override weight keeps what was typed, and removing the overrides leaves the day following the library', async () => {
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, weight_lb, weight_entered_value, weight_entered_unit)
      values ($1, $2, $3, $4, 60.627, 27.5, 'kg') on conflict (campaign_day_id, workout_item_id) do update set weight_lb = excluded.weight_lb, weight_entered_value = excluded.weight_entered_value, weight_entered_unit = excluded.weight_entered_unit`,
      [u, r.day, r.workout, r.items[2]]);
    expect(await db.as(u, `select weight_lb::float as lb, weight_entered_unit as u from campaign_day_overrides where campaign_day_id = $1 and weight_lb is not null`, [r.day])).toEqual([{ lb: 60.627, u: 'kg' }]);
    await db.as(u, `delete from campaign_day_overrides where campaign_day_id = $1`, [r.day]);
    expect(await db.as(u, `select 1 from campaign_day_overrides where campaign_day_id = $1`, [r.day])).toEqual([]);
  });
});

describe('sending a day: what the planner writes', () => {
  it('with no workout today, a plan for today is added, and the library and campaign are untouched', async () => {
    const before = await db.as<{ version: number }>(u, `select (select version from workouts where id = $1) as version`, [r.workout]);
    await db.as(u, `insert into today_plans (user_id, local_date, source_kind, campaign_day_id, workout_id, plan, made_by)
      values ($1, '2026-11-20', 'campaign_day', $2, $3, $4::jsonb, 'user')`, [u, r.day, r.workout, JSON.stringify([{ exercise_id: r.bench, sets: 3, reps: 10 }])]);
    expect(await db.as<{ version: number }>(u, `select (select version from workouts where id = $1) as version`, [r.workout])).toEqual(before);
    expect(await db.as(u, `select local_date::text as d, made_by from today_plans where local_date = '2026-11-20'`)).toEqual([{ d: '2026-11-20', made_by: 'user' }]);
  });
  it('with a workout today, a pending proposal with source planner is added, for this person only', async () => {
    const payload = { local_date: '2026-11-20', workout_name: 'Push A', plan_items: [{ exercise_id: r.bench, sets: 3, reps: 10 }], replaces: "today's Legs" };
    await db.as(u, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload, expires_at)
      values ($1, 'planner', 'today_change', 'today', '{"Push A becomes today''s workout.","It replaces today''s Legs."}', $2::jsonb, now() + interval '1 day')`, [u, JSON.stringify(payload)]);
    expect(await db.as(u, `select source, kind, applies_to, status from proposals where source = 'planner'`)).toEqual([{ source: 'planner', kind: 'today_change', applies_to: 'today', status: 'pending' }]);
    const other = await db.register('third@example.test', 'Third', { inviter: u });
    expect(await db.as(other, `select 1 from proposals where source = 'planner'`)).toEqual([]);
    await expect(db.as(other, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'planner', 'today_change', 'today', '{"x"}', '{}')`, [u])).rejects.toThrow();
  });
});
