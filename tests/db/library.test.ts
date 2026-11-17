// The data model's own rules: seeded vocabulary and starter library,
// supersets, day overrides, versions and out-of-date proposals, archiving.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, starter, type Db } from './harness';
import { fillAccount } from './fixtures';

let db: Db;
let u: string;
let r: Awaited<ReturnType<typeof fillAccount>>;
const ex = async (name: string) => (await db.as<{ id: string }>(u, `select id from exercises where name = $1`, [name]))[0].id;

beforeAll(async () => {
  db = await makeDb();
  u = await db.register('nathan@example.test', 'Nathan');
  r = await fillAccount(db, u);
});

describe('a new account is seeded', () => {
  it('with the starter vocabulary from the spec', async () => {
    const counts = await db.as<{ kind: string; n: number }>(u, `select kind, count(*)::int as n from vocabulary_terms group by kind order by kind`);
    expect(counts).toEqual([{ kind: 'equipment', n: 10 }, { kind: 'focus', n: 26 }, { kind: 'muscle_group', n: 13 }]);
    const tri = await db.as<{ name: string }>(u,
      `select f.name from vocabulary_terms f join vocabulary_terms g on g.id = f.parent_id where g.name = 'Triceps' order by f.sort_order`);
    expect(tri.map((x) => x.name)).toEqual(['long head', 'lateral head', 'medial head']);
  });

  it('with the starter library, each exercise complete with three alternates', async () => {
    const rows = await db.as<{ n: number; alts: number; incomplete: number }>(u, `
      select count(*)::int as n,
             (select count(*)::int from exercise_alternates) as alts,
             count(*) filter (where muscle_group_id is null or equipment_id is null)::int as incomplete
      from exercises where created_via = 'starter'`);
    expect(rows[0]).toEqual({ n: starter.exercises.length, alts: starter.exercises.length * 3, incomplete: 0 });
  });

  it('links an alternate to the library exercise of the same name', async () => {
    const [x] = await db.as<{ name: string }>(u, `
      select a2.name from exercise_alternates a join exercises e on e.id = a.exercise_id
      join exercises a2 on a2.id = a.alternate_exercise_id
      where e.name = 'Barbell Bench Press' and a.tier = 'basic_gym'`);
    expect(x.name).toBe('Dumbbell Bench Press');
  });
});

describe('supersets are two or three exercises with equal sets', () => {
  async function addWorkout(rows: Array<[string, number, string | null]>) {
    const [{ id: w }] = await db.as<{ id: string }>(u, `insert into workouts (user_id, name) values ($1, 'Test') returning id`, [u]);
    const values = rows.map((_, i) => `($1, $2, ${i}, $${i * 3 + 3}::uuid, $${i * 3 + 4}::int, 8, $${i * 3 + 5}::text)`).join(', ');
    const params: unknown[] = [u, w];
    for (const [name, sets, ss] of rows) params.push(await ex(name), sets, ss);
    await db.as(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter) values ${values}`, params);
    return w;
  }
  it('accepts a pair and a trio with equal sets', async () => {
    await addWorkout([['Barbell Curl', 4, 'A'], ['Cable Rope Pushdown', 4, 'A']]);
    await addWorkout([['Barbell Curl', 3, 'B'], ['Cable Rope Pushdown', 3, 'B'], ['Dumbbell Lateral Raise', 3, 'B']]);
  });
  it('refuses one member, four members, or different set counts', async () => {
    await expect(addWorkout([['Barbell Curl', 3, 'A'], ['Cable Rope Pushdown', 3, null]])).rejects.toThrow(/two or three/);
    await expect(addWorkout([['Barbell Curl', 3, 'A'], ['Cable Rope Pushdown', 3, 'A'], ['Dumbbell Lateral Raise', 3, 'A'], ['Cable Face Pull', 3, 'A']])).rejects.toThrow(/two or three/);
    await expect(addWorkout([['Barbell Curl', 4, 'A'], ['Cable Rope Pushdown', 3, 'A']])).rejects.toThrow(/same number of sets/);
  });
  it('refuses a day override that would make superset members uneven', async () => {
    await expect(db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets) values ($1, $2, $3, $4, 5)`,
      [u, r.day, r.workout, r.items[0]])).rejects.toThrow(/same number of sets/);
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, sets)
                    values ($1, $2, $3, $4, 5), ($1, $2, $3, $5, 5)`, [u, r.day, r.workout, r.items[0], r.items[1]]);
  });
});

describe('day overrides attach to a workout item and change only that day', () => {
  it('overriding reps to 10 on Monday of week 3 leaves the workout, week 1 and Thursday of week 3 at 8', async () => {
    const [w] = await db.as<{ id: string }>(u, `insert into workouts (user_id, name) values ($1, 'Legs') returning id`, [u]);
    const [item] = await db.as<{ id: string }>(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8) returning id`,
      [u, w.id, await ex('Barbell Back Squat')]);
    const [c] = await db.as<{ id: string }>(u, `insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Draft', '2026-11-16', 4) returning id`, [u]);
    const days = await db.as<{ id: string; week: number; weekday: number }>(u, `
      insert into campaign_days (user_id, campaign_id, week, weekday, workout_id)
      values ($1, $2, 1, 1, $3), ($1, $2, 3, 1, $3), ($1, $2, 3, 4, $3) returning id, week, weekday`, [u, c.id, w.id]);
    const mon3 = days.find((d) => d.week === 3 && d.weekday === 1)!;
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 10)`, [u, mon3.id, w.id, item.id]);
    const planned = await db.as<{ week: number; weekday: number; reps: number }>(u, `
      select d.week, d.weekday, coalesce(o.reps, i.reps) as reps
      from campaign_days d join workout_items i on i.workout_id = d.workout_id
      left join campaign_day_overrides o on o.campaign_day_id = d.id and o.workout_item_id = i.id
      where d.campaign_id = $1 order by d.week, d.weekday`, [c.id]);
    expect(planned).toEqual([{ week: 1, weekday: 1, reps: 8 }, { week: 3, weekday: 1, reps: 10 }, { week: 3, weekday: 4, reps: 8 }]);
    expect(await db.as(u, `select reps from workout_items where id = $1`, [item.id])).toEqual([{ reps: 8 }]);
  });

  it('refuses an override pointing at a row of a different workout', async () => {
    const [other] = await db.as<{ id: string }>(u, `insert into workouts (user_id, name) values ($1, 'Other') returning id`, [u]);
    const [oi] = await db.as<{ id: string }>(u, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8) returning id`,
      [u, other.id, await ex('Barbell Curl')]);
    await expect(db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 5)`,
      [u, r.day, r.workout, oi.id])).rejects.toThrow();
    await expect(db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 5)`,
      [u, r.day, other.id, oi.id])).rejects.toThrow();
  });

  it('changing a day\'s workout removes that day\'s overrides', async () => {
    const [c] = await db.as<{ id: string }>(u, `insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Swap day', '2026-11-16', 2) returning id`, [u]);
    const [d] = await db.as<{ id: string }>(u, `insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 2, $3) returning id`, [u, c.id, r.workout]);
    await db.as(u, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 12)`, [u, d.id, r.workout, r.items[2]]);
    const [legs] = await db.as<{ id: string }>(u, `select id from workouts where name = 'Legs'`);
    await db.as(u, `update campaign_days set workout_id = $1 where id = $2`, [legs.id, d.id]);
    expect(await db.as(u, `select 1 from campaign_day_overrides where campaign_day_id = $1`, [d.id])).toEqual([]);
  });

  it('refuses a day past the campaign\'s length, and a second active campaign', async () => {
    await expect(db.as(u, `insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 5, 1, $3)`, [u, r.campaign, r.workout])).rejects.toThrow(/past the end/);
    await expect(db.as(u, `insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Second', '2026-12-01', 2, 'active')`, [u])).rejects.toThrow();
    await expect(db.as(u, `insert into campaigns (user_id, name, start_date, week_count) values ($1, 'Too long', '2026-12-01', 7)`, [u])).rejects.toThrow();
  });
});

describe('versions and out-of-date proposals', () => {
  it('an edit raises the version and makes a pending proposal for it out of date', async () => {
    const before = (await db.as<{ version: number }>(u, `select version from exercises where id = $1`, [r.bench]))[0].version;
    await db.as(u, `update exercises set note = 'Pause at the chest' where id = $1`, [r.bench]);
    const after = (await db.as<{ version: number }>(u, `select version from exercises where id = $1`, [r.bench]))[0].version;
    expect(after).toBe(before + 1);
    expect(await db.as(u, `select status from proposals where id = $1`, [r.proposal])).toEqual([{ status: 'out_of_date' }]);
  });

  it('the phone\'s lb/kg choice is not an edit to the exercise', async () => {
    const [p] = await db.as<{ id: string }>(u, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'ChatGPT', 'exercise', 'library', '{"x"}', '{}') returning id`, [u], { coach: true });
    await db.as(u, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, 'exercises', $3, 1)`, [u, p.id, r.curl], { coach: true });
    const v = (await db.as<{ version: number }>(u, `select version from exercises where id = $1`, [r.curl]))[0].version;
    await db.as(u, `insert into exercise_display_units (user_id, exercise_id, unit) values ($1, $2, 'kg') on conflict (user_id, exercise_id) do update set unit = 'kg'`, [u, r.curl]);
    expect((await db.as<{ version: number }>(u, `select version from exercises where id = $1`, [r.curl]))[0].version).toBe(v);
    expect(await db.as(u, `select status from proposals where id = $1`, [p.id])).toEqual([{ status: 'pending' }]);
    expect(await db.as(u, `select default_unit from exercises where id = $1`, [r.curl])).toEqual([{ default_unit: 'lb' }]);
  });

  it('changing a workout\'s rows is an edit to the workout', async () => {
    const v = (await db.as<{ version: number }>(u, `select version from workouts where id = $1`, [r.workout]))[0].version;
    await db.as(u, `update workout_items set reps = 9 where id = $1`, [r.items[2]]);
    expect((await db.as<{ version: number }>(u, `select version from workouts where id = $1`, [r.workout]))[0].version).toBe(v + 1);
  });
});

describe('history stays put', () => {
  it('renaming an exercise keeps its history, which follows the exercise', async () => {
    await db.as(u, `update exercises set name = 'Barbell Standing Curl' where id = $1`, [r.curl]);
    const hist = await db.as<{ name: string; then: string; reps: number }>(u, `
      select e.name, se.exercise_name_then as then, s.reps from set_logs s
      join session_exercises se on se.id = s.session_exercise_id join exercises e on e.id = se.exercise_id`);
    expect(hist).toEqual([{ name: 'Barbell Standing Curl', then: 'Barbell Curl', reps: 8 }]);
  });

  it('editing a workout does not change a past session', async () => {
    await db.as(u, `update workouts set name = 'Push A (new)' where id = $1`, [r.workout]);
    expect(await db.as(u, `select workout_name from sessions where id = $1`, [r.session])).toEqual([{ workout_name: 'Push A' }]);
  });

  it('exercises and workouts are archived, never deleted', async () => {
    await expect(db.as(u, `delete from exercises where id = $1`, [r.bench])).rejects.toThrow();
    await expect(db.as(u, `delete from workouts where id = $1`, [r.workout])).rejects.toThrow();
    await db.as(u, `update exercises set archived_at = now() where id = $1`, [r.row]);
    // An archived name is free for a new live exercise.
    await db.as(u, `insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via)
      select $1, 'Barbell Bent-Over Row', muscle_group_id, equipment_id, 'lb', 'planner' from exercises where id = $2`, [u, r.row]);
    await expect(db.as(u, `insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via)
      select $1, 'barbell bent-over row', muscle_group_id, equipment_id, 'lb', 'planner' from exercises where id = $2`, [u, r.row])).rejects.toThrow();
  });
});

describe('sets, sessions and gyms', () => {
  it('weight cannot go below 0 and reps cannot go below 1', async () => {
    const ins = (w: number, reps: number, n: number) => db.as(u,
      `insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at) values ($1, $2, $3, $4, $4, 'lb', $5, now())`,
      [u, r.se, n, w, reps]);
    await expect(ins(-5, 8, 2)).rejects.toThrow();
    await expect(ins(60, 0, 2)).rejects.toThrow();
    await ins(0, 1, 2);
  });

  it('a bodyweight set is 1 BW with no pounds value, and a warm-up holds no record', async () => {
    await expect(db.as(u, `insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at) values ($1, $2, 3, 150, 1, 'bw', 10, now())`, [u, r.se])).rejects.toThrow();
    await db.as(u, `insert into set_logs (user_id, session_exercise_id, set_number, entered_value, entered_unit, reps, logged_at) values ($1, $2, 3, 1, 'bw', 10, now())`, [u, r.se]);
    await expect(db.as(u, `insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, record_types, logged_at) values ($1, $2, 4, 60, 60, 'lb', 5, 'warm_up', '{heaviest}', now())`, [u, r.se])).rejects.toThrow();
  });

  it('27.5 kg is stored as 60.627 lb with the typed value kept', async () => {
    await db.as(u, `insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at) values ($1, $2, 5, 60.627, 27.5, 'kg', 8, now())`, [u, r.se]);
    expect(await db.as(u, `select weight_lb::text as lb, entered_value::text as v, entered_unit from set_logs where set_number = 5`))
      .toEqual([{ lb: '60.627', v: '27.500', entered_unit: 'kg' }]);
  });

  it('only one session can be active, and one gym the default', async () => {
    await expect(db.as(u, `insert into sessions (user_id, local_date, source_kind, workout_name, started_at) values ($1, '2026-11-17', 'ad_hoc', 'Extra', now())`, [u])).rejects.toThrow();
    await expect(db.as(u, `insert into gyms (user_id, name, is_default) values ($1, 'Work', true)`, [u])).rejects.toThrow();
  });
});

describe('the vocabulary', () => {
  it('renaming a value carries through to every exercise that uses it', async () => {
    await db.as(u, `update vocabulary_terms set name = 'pin machine' where kind = 'equipment' and name = 'selectorized machine'`);
    const [x] = await db.as<{ name: string }>(u, `select v.name from exercises e join vocabulary_terms v on v.id = e.equipment_id where e.name = 'Selectorized Machine Leg Extension'`);
    expect(x.name).toBe('pin machine');
  });

  it('a value in use cannot be deleted, only archived; an unused one can be deleted', async () => {
    await expect(db.as(u, `delete from vocabulary_terms where kind = 'focus' and name = 'brachialis'`)).rejects.toThrow(/Archive it/);
    await db.as(u, `update vocabulary_terms set archived_at = now() where kind = 'focus' and name = 'brachialis'`);
    const [x] = await db.as<{ name: string; archived: boolean }>(u,
      `select v.name, v.archived_at is not null as archived from exercises e join vocabulary_terms v on v.id = e.focus_id where e.name = 'Dumbbell Hammer Curl'`);
    expect(x).toEqual({ name: 'brachialis', archived: true });
    await db.as(u, `delete from vocabulary_terms where kind = 'equipment' and name = 'cardio machine'`);
  });

  it('an exercise must use a term of the right kind, and a focus of its own muscle group', async () => {
    const term = async (kind: string, name: string) => (await db.as<{ id: string }>(u, `select id from vocabulary_terms where kind = $1 and name = $2`, [kind, name]))[0].id;
    const chest = await term('muscle_group', 'Chest');
    const cable = await term('equipment', 'cable');
    const lats = await term('focus', 'lats');
    await expect(db.as(u, `insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via) values ($1, 'Odd One', $2, $3, 'lb', 'planner')`, [u, cable, cable])).rejects.toThrow(/muscle group/);
    await expect(db.as(u, `insert into exercises (user_id, name, muscle_group_id, focus_id, equipment_id, default_unit, created_via) values ($1, 'Odd Two', $2, $3, $4, 'lb', 'planner')`, [u, chest, lats, cable])).rejects.toThrow(/Focus/);
  });

  it('only an exercise made by a swap may have an empty muscle group or equipment', async () => {
    await expect(db.as(u, `insert into exercises (user_id, name, default_unit, created_via) values ($1, 'Mystery Lift', 'lb', 'planner')`, [u])).rejects.toThrow();
    await db.as(u, `insert into exercises (user_id, name, default_unit, created_via) values ($1, 'Mystery Lift', 'lb', 'swap')`, [u]);
  });
});
