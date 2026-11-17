// Bringing accounts made with starter library version 1 (the first 42) up to
// version 2 (227 exercises): supabase/migrations/...0600_starter_library_v2.sql.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, starter, type Db } from './harness';
import { nameKey } from '@/rules/names';

const v1 = JSON.parse(readFileSync(join(import.meta.dirname, 'starter-library-v1.json'), 'utf8'));
const upgrade = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261117000600_starter_library_v2.sql'), 'utf8');

async function registerWith(db: Db, admin: string, email: string, library: unknown) {
  const code = (await db.as<{ code: string }>(admin, `select code from admin_create_invite($1)`, [email]))[0].code;
  const id = (await db.pg.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
  await db.server(`select register_with_invite($1, $2, $3, $4, $5, $6)`, [code, id, email, email.split('@')[0], 'America/Denver', JSON.stringify(library)]);
  return id;
}

/** Each live exercise with its details and swaps, by name, for comparing accounts. */
async function library(db: Db, user: string) {
  const rows = (await db.pg.query<Record<string, unknown>>(`
    select e.name, g.name as muscle_group, f.name as focus, q.name as equipment, e.default_unit, e.work_seconds, e.rest_seconds, e.note,
           (select jsonb_object_agg(a.tier, jsonb_build_object('name', a.name, 'linked_to', l.name))
              from exercise_alternates a left join exercises l on l.id = a.alternate_exercise_id
             where a.exercise_id = e.id) as alternates
      from exercises e
      join vocabulary_terms g on g.id = e.muscle_group_id
      left join vocabulary_terms f on f.id = e.focus_id
      join vocabulary_terms q on q.id = e.equipment_id
     where e.user_id = $1 and e.archived_at is null
     order by e.name`, [user])).rows;
  return rows;
}

async function exerciseByName(db: Db, user: string, name: string) {
  return (await db.pg.query<Record<string, any>>(`select * from exercises where user_id = $1 and name = $2`, [user, name])).rows[0];
}

describe('starter library version 2 for existing accounts', () => {
  it('gives an untouched version 1 account exactly what a new account gets, and a second run changes nothing', async () => {
    const db = await makeDb();
    const admin = await db.register('admin@example.test', 'Admin', { admin: true });
    const old = await registerWith(db, admin, 'old@example.test', v1);
    expect((await library(db, old)).length).toBe(42);

    await db.pg.exec(upgrade);
    const fresh = await registerWith(db, admin, 'fresh@example.test', starter);
    const upgraded = await library(db, old);
    expect(upgraded.length).toBe(227);
    expect(upgraded).toEqual(await library(db, fresh));
    for (const e of upgraded) for (const a of Object.values(e.alternates as Record<string, any>)) expect(a.linked_to, `${e.name} -> ${a.name}`).toBe(a.name);

    // The renamed leg press is the same exercise, so it keeps its id and history, and there is only one.
    const press = await exerciseByName(db, old, 'Plate-Loaded Machine Angled Leg Press');
    expect(press.version).toBeGreaterThan(1); // edited, so a coach proposal made before now is out of date
    expect(await exerciseByName(db, old, 'Plate-Loaded Machine Leg Press')).toBeUndefined();

    const before = (await db.pg.query(`select id, version, name from exercises order by id`)).rows;
    const altsBefore = (await db.pg.query(`select id, name, alternate_exercise_id from exercise_alternates order by id`)).rows;
    await db.pg.exec(upgrade);
    expect((await db.pg.query(`select id, version, name from exercises order by id`)).rows).toEqual(before);
    expect((await db.pg.query(`select id, name, alternate_exercise_id from exercise_alternates order by id`)).rows).toEqual(altsBefore);
  }, 60000);

  it('leaves alone what the person changed, and brings back nothing archived', async () => {
    const db = await makeDb();
    const admin = await db.register('admin@example.test', 'Admin', { admin: true });
    const me = await registerWith(db, admin, 'me@example.test', v1);
    const q = (sql: string, p: unknown[] = []) => db.pg.query(sql, [me, ...p]);
    // My own note on the barbell curl, my own rest on the deadlift, my own swap on the hammer curl.
    await q(`update exercises set note = 'My cue' where user_id = $1 and name = 'Barbell Curl'`);
    await q(`update exercises set rest_seconds = 150 where user_id = $1 and name = 'Barbell Deadlift'`);
    await q(`update exercise_alternates set name = 'Bodyweight Towel Row' where user_id = $1 and tier = 'bodyweight'
               and exercise_id = (select id from exercises where user_id = $1 and name = 'Dumbbell Hammer Curl')`);
    // The reverse curl archived; "DB Flys" made by hand; a hand-made "Cable Curl" archived.
    await q(`update exercises set archived_at = now() where user_id = $1 and name = 'Barbell Reverse Curl'`);
    for (const [name, archived] of [['DB Flys', false], ['Cable Curl', true]] as const) {
      await q(`insert into exercises (user_id, name, muscle_group_id, equipment_id, default_unit, created_via, archived_at)
               select $1::uuid, $2::text, (select id from vocabulary_terms where user_id = $1 and kind = 'muscle_group' and name = 'Chest'),
                      (select id from vocabulary_terms where user_id = $1 and kind = 'equipment' and name = 'dumbbell'), 'lb', 'planner',
                      case when $3::boolean then now() end`, [name, archived]);
    }

    await db.pg.exec(upgrade);

    const curl = await exerciseByName(db, me, 'Barbell Curl');
    expect(curl.note).toBe('My cue');
    const curlAlt = (await q(`select name from exercise_alternates where user_id = $1 and exercise_id = $2 and tier = 'basic_gym'`, [curl.id])).rows[0] as any;
    expect(curlAlt.name).toBe('Barbell EZ-Bar Curl'); // the coach's swap still arrives
    expect((await exerciseByName(db, me, 'Barbell Deadlift')).rest_seconds).toBe(150);
    const hammer = await exerciseByName(db, me, 'Dumbbell Hammer Curl');
    expect(((await q(`select name from exercise_alternates where user_id = $1 and exercise_id = $2 and tier = 'bodyweight'`, [hammer.id])).rows[0] as any).name).toBe('Bodyweight Towel Row');

    const reverse = await exerciseByName(db, me, 'Barbell Reverse Curl');
    expect(reverse.archived_at).not.toBeNull();
    const forearms = (await q(`select id from vocabulary_terms where user_id = $1 and kind = 'muscle_group' and name = 'Forearms'`)).rows[0] as any;
    expect(reverse.muscle_group_id).toBe(forearms.id); // archived, so not edited
    for (const name of ['Dumbbell Fly', 'Cable Curl']) {
      expect((await q(`select count(*)::int as n from exercises where user_id = $1 and name = $2`, [name])).rows[0]).toEqual({ n: name === 'Cable Curl' ? 1 : 0 });
    }
    expect((await q(`select count(*)::int as n from exercises where user_id = $1`)).rows[0]).toEqual({ n: 42 + 2 + 185 - 2 });
    // A swap named "Dumbbell Fly" is linked to my "DB Flys".
    const fly = (await q(`select l.name from exercise_alternates a join exercises l on l.id = a.alternate_exercise_id
                           where a.user_id = $1 and a.name = 'Dumbbell Fly' limit 1`)).rows[0] as any;
    expect(fly.name).toBe('DB Flys');
  }, 60000);

  it('reduces names exactly as the app does', async () => {
    const db = await makeDb();
    const names = [...starter.exercises.map((e: { name: string }) => e.name), 'DB incline presses', 'Incline Dumbbell Press', 'RDL', 'Pull-ups', 'Hip Abduction', '  Selectorised   Machine  ', 'Glasses', 'Calories'];
    const fn = upgrade.slice(upgrade.indexOf('create or replace function pg_temp.name_key'), upgrade.indexOf('$fn$;') + 5);
    await db.pg.exec(fn);
    for (const n of names) {
      const r = (await db.pg.query<{ k: string }>(`select pg_temp.name_key($1) as k`, [n])).rows[0];
      expect(r.k, n).toBe(nameKey(n));
    }
  }, 60000);
});
