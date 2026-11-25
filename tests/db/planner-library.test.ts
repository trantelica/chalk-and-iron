// What the planner's Library and Vocabulary screens rely on from the database
// (spec Section 5, Section 10; acceptance tests "The library is never changed
// by use"). Each statement here is one request the screen makes.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { fillAccount } from './fixtures';

let db: Db;
let u: string;
let r: Awaited<ReturnType<typeof fillAccount>>;
const one = async <T,>(sql: string, p: unknown[] = []) => (await db.as<T>(u, sql, p))[0];

beforeAll(async () => {
  db = await makeDb();
  u = await db.register('planner@example.test', 'Planner');
  r = await fillAccount(db, u);
});

describe('exercises', () => {
  it('renaming keeps all history and records: the sets still belong to the exercise', async () => {
    await db.as(u, `update exercises set name = 'EZ-Bar Curl' where id = $1`, [r.curl]);
    const rows = await db.as<{ name: string; exercise_name_then: string; reps: number }>(u, `
      select e.name, se.exercise_name_then, l.reps from set_logs l
      join session_exercises se on se.id = l.session_exercise_id join exercises e on e.id = se.exercise_id where e.id = $1`, [r.curl]);
    expect(rows).toEqual([{ name: 'EZ-Bar Curl', exercise_name_then: 'Barbell Curl', reps: 8 }]);
  });
  it('refuses a second live exercise with the same name, ignoring capitals; an archived one does not block', async () => {
    await expect(db.as(u, `update exercises set name = 'barbell bench press' where id = $1`, [r.curl])).rejects.toThrow(/exercises_live_name|duplicate/);
    await db.as(u, `update exercises set archived_at = now() where id = $1`, [r.bench]);
    await db.as(u, `update exercises set name = 'barbell bench press' where id = $1`, [r.curl]);
    await db.as(u, `update exercises set name = 'EZ-Bar Curl' where id = $1`, [r.curl]);
    await expect(db.as(u, `update exercises set archived_at = null where id = $1`, [r.bench])).resolves.toBeDefined();
  });
  it('archives and restores, keeping the row and its history', async () => {
    await db.as(u, `update exercises set archived_at = now() where id = $1`, [r.curl]);
    expect((await one<{ n: number }>(`select count(*)::int as n from set_logs`)).n).toBe(1);
    await db.as(u, `update exercises set archived_at = null where id = $1`, [r.curl]);
    expect((await one<{ archived_at: string | null }>(`select archived_at from exercises where id = $1`, [r.curl])).archived_at).toBeNull();
  });
  it('is never deleted by the person', async () => {
    await expect(db.as(u, `delete from exercises where id = $1`, [r.curl])).rejects.toThrow();
  });
  it('an exercise made by a swap may have an empty muscle group or equipment; one added in the planner may not', async () => {
    await db.as(u, `insert into exercises (user_id, name, default_unit, created_via) values ($1, 'Swapped Thing', 'lb', 'swap')`, [u]);
    const inc = await one<{ incomplete: boolean }>(`select (muscle_group_id is null or equipment_id is null) as incomplete from exercises where name = 'Swapped Thing'`);
    expect(inc.incomplete).toBe(true);
    await expect(db.as(u, `insert into exercises (user_id, name, default_unit, created_via) values ($1, 'By Hand', 'lb', 'planner')`, [u])).rejects.toThrow();
  });
  it('a focus value must belong to the exercise\'s muscle group', async () => {
    const [back] = await db.as<{ id: string }>(u, `select id from vocabulary_terms where name = 'Back' and kind = 'muscle_group'`);
    const [upper] = await db.as<{ id: string }>(u, `select f.id from vocabulary_terms f join vocabulary_terms g on g.id = f.parent_id where g.name = 'Chest' and f.name = 'upper'`);
    await expect(db.as(u, `update exercises set muscle_group_id = $1, focus_id = $2 where id = $3`, [back.id, upper.id, r.bench])).rejects.toThrow(/Focus/);
  });
});

describe('workouts: one request keeps a superset whole', () => {
  it('changing the sets of every member in one statement works; one member alone is refused', async () => {
    await expect(db.as(u, `update workout_items set sets = 4 where id = $1`, [r.items[0]])).rejects.toThrow(/same number of sets/);
    await db.as(u, `update workout_items set sets = 4 where id = any($1)`, [[r.items[0], r.items[1]]]);
    expect(await db.as(u, `select sets from workout_items where workout_id = $1 order by position`, [r.workout])).toEqual([{ sets: 4 }, { sets: 4 }, { sets: 3 }]);
  });
  it('an upsert of the whole list reorders rows and edits them in one request', async () => {
    await db.as(u, `
      insert into workout_items (id, user_id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter)
      select id, user_id, workout_id, 2 - position, exercise_id, sets, reps, rest_seconds, superset_letter from workout_items where workout_id = $1
      on conflict (id) do update set position = excluded.position`, [r.workout]);
    const order = await db.as<{ id: string }>(u, `select id from workout_items where workout_id = $1 order by position`, [r.workout]);
    expect(order.map((x) => x.id)).toEqual([...r.items].reverse());
  });
  it('removing a member first leaves its superset in the same request, then the row can go', async () => {
    const [w] = await db.as<{ id: string }>(u, `insert into workouts (user_id, name) values ($1, 'Pair') returning id`, [u]);
    const ids = (await db.as<{ id: string }>(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
      values ($1, $2, 0, $3, 3, 8, 'A'), ($1, $2, 1, $4, 3, 8, 'A') returning id`, [u, w.id, r.bench, r.row])).map((x) => x.id);
    await expect(db.as(u, `delete from workout_items where id = $1`, [ids[0]])).rejects.toThrow(/two or three/);
    await db.as(u, `update workout_items set superset_letter = null where workout_id = $1`, [w.id]);
    await db.as(u, `delete from workout_items where id = $1`, [ids[0]]);
    expect(await db.as(u, `select superset_letter from workout_items where workout_id = $1`, [w.id])).toEqual([{ superset_letter: null }]);
  });
  it('a copy is its own workout: editing it leaves the original', async () => {
    const [c] = await db.as<{ id: string }>(u, `insert into workouts (user_id, name) values ($1, 'Push A (copy)') returning id`, [u]);
    await db.as(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter)
      select user_id, $2, position, exercise_id, sets, reps, rest_seconds, superset_letter from workout_items where workout_id = $1`, [r.workout, c.id]);
    await db.as(u, `update workout_items set sets = 4 where workout_id = $1 and superset_letter is null`, [c.id]);
    expect(await db.as(u, `select sets from workout_items where workout_id = $1 and superset_letter is null`, [r.workout])).toEqual([{ sets: 3 }]);
  });
  it('an archived workout keeps running in a campaign day, and is never deleted', async () => {
    await db.as(u, `update workouts set archived_at = now() where id = $1`, [r.workout]);
    expect(await db.as(u, `select workout_id from campaign_days where id = $1`, [r.day])).toEqual([{ workout_id: r.workout }]);
    await expect(db.as(u, `delete from workouts where id = $1`, [r.workout])).rejects.toThrow();
    await db.as(u, `update workouts set archived_at = null where id = $1`, [r.workout]);
  });
});

describe('campaigns', () => {
  it('activating a draft while another is active: the other is ended first, then the draft is activated', async () => {
    const [d] = await db.as<{ id: string }>(u, `insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Block 2', '2026-12-14', 4) returning id`, [u]);
    await expect(db.as(u, `update campaigns set status = 'active' where id = $1`, [d.id])).rejects.toThrow();
    await db.as(u, `update campaigns set status = 'finished' where id = $1`, [r.campaign]);
    await db.as(u, `update campaigns set status = 'active' where id = $1`, [d.id]);
    expect(await db.as(u, `select name, status from campaigns order by created_at`)).toEqual(
      expect.arrayContaining([{ name: 'Block 1', status: 'finished' }, { name: 'Block 2', status: 'active' }]));
    await db.as(u, `update campaigns set status = 'finished' where id = $1`, [d.id]);
    await db.as(u, `update campaigns set status = 'active' where id = $1`, [r.campaign]);
  });
  it('a shift adds a blank week and does not count toward the six-week limit', async () => {
    await db.as(u, `insert into campaign_shifts (user_id, campaign_id, blank_week_starts_on, made_by) values ($1, $2, '2026-12-07', 'user')`, [u, r.campaign]);
    expect((await one<{ n: number }>(`select count(*)::int as n from campaign_shifts where campaign_id = $1`, [r.campaign])).n).toBe(2);
    expect((await one<{ week_count: number }>(`select week_count from campaigns where id = $1`, [r.campaign])).week_count).toBe(4);
    await expect(db.as(u, `insert into campaign_shifts (user_id, campaign_id, blank_week_starts_on, made_by) values ($1, $2, '2026-12-08', 'user')`, [u, r.campaign])).rejects.toThrow();
  });
  it('a sets override written to every superset member in one request is accepted', async () => {
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets)
      values ($1, $2, $3, $4, 5), ($1, $2, $3, $5, 5)
      on conflict (campaign_day_id, workout_item_id) do update set sets = excluded.sets`, [u, r.day, r.workout, r.items[0], r.items[1]]);
    expect(await db.as(u, `select sets from campaign_day_overrides where campaign_day_id = $1 and sets is not null order by sets`, [r.day])).toEqual([{ sets: 5 }, { sets: 5 }]);
    // Clearing both (nulls) in one request leaves empty rows, and the library workout is untouched.
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets)
      values ($1, $2, $3, $4, null), ($1, $2, $3, $5, null)
      on conflict (campaign_day_id, workout_item_id) do update set sets = excluded.sets`, [u, r.day, r.workout, r.items[0], r.items[1]]);
    expect(await db.as(u, `select sets from workout_items where workout_id = $1 and superset_letter = 'A'`, [r.workout])).toEqual([{ sets: 4 }, { sets: 4 }]);
  });
  it('removing a day deletes its overrides', async () => {
    await db.as(u, `delete from campaign_days where id = $1`, [r.day]);
    expect(await db.as(u, `select 1 from campaign_day_overrides where campaign_day_id = $1`, [r.day])).toEqual([]);
  });
});

describe('vocabulary', () => {
  it('renaming carries through to every exercise that uses it', async () => {
    const [bb] = await db.as<{ id: string }>(u, `select id from vocabulary_terms where kind = 'equipment' and name = 'barbell'`);
    const n = (await one<{ n: number }>(`select count(*)::int as n from exercises where equipment_id = $1`, [bb.id])).n;
    expect(n).toBeGreaterThan(5);
    await db.as(u, `update vocabulary_terms set name = 'barbell (any)' where id = $1`, [bb.id]);
    expect((await one<{ n: number }>(`select count(*)::int as n from exercises e join vocabulary_terms t on t.id = e.equipment_id where t.name = 'barbell (any)'`)).n).toBe(n);
  });
  it('a value in use cannot be deleted; archiving it leaves the exercises with it, and it can be restored', async () => {
    const [bb] = await db.as<{ id: string }>(u, `select id from vocabulary_terms where kind = 'equipment' and name = 'barbell (any)'`);
    await expect(db.as(u, `delete from vocabulary_terms where id = $1`, [bb.id])).rejects.toThrow(/Archive it instead/);
    await db.as(u, `update vocabulary_terms set archived_at = now() where id = $1`, [bb.id]);
    expect((await one<{ n: number }>(`select count(*)::int as n from exercises where equipment_id = $1`, [bb.id])).n).toBeGreaterThan(5);
    await db.as(u, `update vocabulary_terms set archived_at = null where id = $1`, [bb.id]);
  });
  it('adds a value, refuses a repeat, and deletes an unused one', async () => {
    await db.as(u, `insert into vocabulary_terms (user_id, kind, name, sort_order) values ($1, 'equipment', 'rower', 99)`, [u]);
    await expect(db.as(u, `insert into vocabulary_terms (user_id, kind, name, sort_order) values ($1, 'equipment', 'Rower', 100)`, [u])).rejects.toThrow();
    await db.as(u, `delete from vocabulary_terms where name = 'rower' and kind = 'equipment'`);
  });
  it('another person cannot see or change this vocabulary', async () => {
    const other = await db.register('other@example.test', 'Other', { inviter: u });
    const [t] = await db.as<{ id: string }>(u, `select id from vocabulary_terms where kind = 'equipment' limit 1`);
    expect(await db.as(other, `update vocabulary_terms set name = 'hacked' where id = $1 returning id`, [t.id])).toEqual([]);
  });
});

// Review at high effort (23 Nov): the Workouts screen saves its rows and the
// day overrides that keep each campaign day's supersets even, in one step
// (save_workout), so an exercise joining a superset takes its set count on
// every day too.
describe('saving a workout with the day overrides that keep supersets even', () => {
  let w: string;
  let x: string; let y: string; let z: string;
  let dayId: string;
  type Row = { id: string; exerciseId: string; sets: number; reps: number; rest: number | null; superset: string | null };
  let rows: Row[];
  const daySets = async () => (await db.as<{ workout_item_id: string; sets: number | null }>(u,
    `select workout_item_id, sets from campaign_day_overrides where campaign_day_id = $1`, [dayId]))
    .map((o) => ({ campaignDayId: dayId, workoutItemId: o.workout_item_id, sets: o.sets }));
  const plannedOnDay = async () => (await db.as<{ id: string; sets: number }>(u,
    `select i.id, coalesce(o.sets, i.sets) as sets from workout_items i
     left join campaign_day_overrides o on o.workout_item_id = i.id and o.campaign_day_id = $2
     where i.workout_id = $1 order by i.position`, [w, dayId])).map((q) => q.sets);
  async function save(next: Row[], startedBy: string | null = null, removed: string[] = []) {
    const { daySetsForSupersets } = await import('@/rules/planner');
    const ds = daySetsForSupersets(rows, next, [dayId], await daySets(), startedBy);
    await db.as(u, `select save_workout($1, $2::jsonb, $3::uuid[], $4::jsonb)`, [w,
      JSON.stringify(next.map((q, i) => ({ id: q.id, position: i, exercise_id: q.exerciseId, sets: q.sets, reps: q.reps, rest_seconds: q.rest, superset_letter: q.superset }))),
      removed, JSON.stringify(ds.map((d) => ({ campaign_day_id: d.campaignDayId, workout_item_id: d.workoutItemId, sets: d.sets })))]);
    rows = next;
  }

  beforeAll(async () => {
    w = (await one<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Join') returning id`, [u])).id;
    [x, y, z] = (await db.as<{ id: string }>(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
      values ($1, $2, 0, $3, 3, 8, 'A'), ($1, $2, 1, $4, 3, 8, 'A'), ($1, $2, 2, $5, 3, 8, null) returning id`, [u, w, r.bench, r.row, r.curl])).map((q) => q.id);
    const [c] = await db.as<{ id: string }>(u, `insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Join test', '2026-12-07', 2) returning id`, [u]);
    dayId = (await one<{ id: string }>(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 3, $3) returning id`, [u, c.id, w])).id;
    rows = [x, y, z].map((id, i) => ({ id, exerciseId: [r.bench, r.row, r.curl][i], sets: 3, reps: 8, rest: null, superset: i < 2 ? 'A' : null }));
  });

  it('a row with a day override of its own joins a superset and takes the superset\'s count on that day', async () => {
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets) values ($1, $2, $3, $4, 5)`, [u, dayId, w, z]);
    await save(rows.map((q) => (q.id === z ? { ...q, superset: 'A' } : q)), z);
    expect(await plannedOnDay()).toEqual([3, 3, 3]);
    expect(await db.as(u, `select sets, superset_letter from workout_items where id = $1`, [z])).toEqual([{ sets: 3, superset_letter: 'A' }]);
  });

  it('a row joining a superset that a day overrides takes that day\'s count', async () => {
    await save(rows.map((q) => (q.id === z ? { ...q, superset: null } : q)));
    // The day gives superset A five sets.
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets) values ($1, $2, $3, $4, 5), ($1, $2, $3, $5, 5)
      on conflict (campaign_day_id, workout_item_id) do update set sets = excluded.sets`, [u, dayId, w, x, y]);
    await save(rows.map((q) => (q.id === z ? { ...q, superset: 'A' } : q)), z);
    expect(await plannedOnDay()).toEqual([5, 5, 5]);
    // The library workout keeps its own three sets.
    expect((await db.as<{ sets: number }>(u, `select sets from workout_items where workout_id = $1 order by position`, [w])).map((q) => q.sets)).toEqual([3, 3, 3]);
  });

  it('a save the database refuses keeps none of it', async () => {
    const before = await db.as(u, `select to_jsonb(i) as j from workout_items i where workout_id = $1 order by position`, [w]);
    const ovBefore = await daySets();
    const [ex4] = await db.as<{ id: string }>(u, `select id from exercises where user_id = $1 and archived_at is null and id <> all($2) limit 1`, [u, [r.bench, r.row, r.curl]]);
    const four = [...rows, { id: crypto.randomUUID(), exerciseId: ex4.id, sets: 3, reps: 8, rest: null, superset: 'A' }];
    await expect(db.as(u, `select save_workout($1, $2::jsonb, '{}', '[]')`, [w,
      JSON.stringify(four.map((q, i) => ({ id: q.id, position: i, exercise_id: q.exerciseId, sets: q.sets, reps: q.reps, rest_seconds: q.rest, superset_letter: q.superset })))])).rejects.toThrow(/two or three/);
    expect(await db.as(u, `select to_jsonb(i) as j from workout_items i where workout_id = $1 order by position`, [w])).toEqual(before);
    expect(await daySets()).toEqual(ovBefore);
  });

  it('another person cannot save into this workout, and a coach sign-in cannot save at all', async () => {
    const other = await db.register('other-planner@example.test', 'Other', { inviter: u });
    await expect(db.as(other, `select save_workout($1, '[]', '{}', '[]')`, [w])).rejects.toThrow(/not in your library/);
    await expect(db.as(u, `select save_workout($1, '[]', '{}', '[]')`, [w], { coach: true })).rejects.toThrow(/not_signed_in/);
  });
});
