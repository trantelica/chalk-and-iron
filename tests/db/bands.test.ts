// Band exercises are bodyweight exercises (Nathan, 17 November 2026):
// supabase/migrations/...0700_bands_are_bodyweight.sql brings accounts made
// before the decision up to date.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, starter } from './harness';

const bands = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261117000700_bands_are_bodyweight.sql'), 'utf8');
const bandNames: string[] = starter.exercises.filter((e: { equipment: string }) => e.equipment === 'band').map((e: { name: string }) => e.name);

describe('band exercises are bodyweight', () => {
  it('a new account gets its 14 band exercises as bodyweight', async () => {
    const db = await makeDb();
    const me = await db.register('me@example.test', 'Me');
    expect(bandNames).toHaveLength(14);
    const rows = await db.server<{ name: string; default_unit: string }>(
      `select name, default_unit from exercises where user_id = $1 and name = any($2)`, [me, bandNames]);
    expect(rows).toHaveLength(14);
    expect(rows.every((r) => r.default_unit === 'bw')).toBe(true);
  }, 60000);

  it('switches an older account, clears the lb/kg switch, leaves logged history alone, and is safe to rerun', async () => {
    const db = await makeDb();
    const me = await db.register('me@example.test', 'Me');
    const id = async (name: string) => (await db.server<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [me, name]))[0].id;
    // Put the account back as it was before the decision: bands in pounds, one with a remembered kg switch.
    await db.server(`update exercises set default_unit = 'lb' where user_id = $1 and name = any($2)`, [me, bandNames]);
    const curl = await id('Band Curl');
    const pushdown = await id('Band Pushdown');
    await db.server(`insert into exercise_display_units (user_id, exercise_id, unit) values ($1, $2, 'kg')`, [me, curl]);
    // One band exercise already has a set logged in pounds.
    const session = (await db.server<{ id: string }>(
      `insert into sessions (user_id, local_date, source_kind, workout_name, started_at) values ($1, '2026-11-17', 'ad_hoc', 'Bands', now()) returning id`, [me]))[0].id;
    const block = (await db.server<{ id: string }>(
      `insert into session_blocks (user_id, session_id, position, time_budget_seconds) values ($1, $2, 0, 300) returning id`, [me, session]))[0].id;
    const se = (await db.server<{ id: string }>(
      `insert into session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds)
       values ($1, $2, $3, $4, 'Band Pushdown', '{working}', 12, 90, 45) returning id`, [me, session, block, pushdown]))[0].id;
    await db.server(`insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at)
                     values ($1, $2, 1, 30, 30, 'lb', 12, now())`, [me, se]);

    await db.pg.exec(bands);

    const after = await db.server<{ name: string; default_unit: string }>(
      `select name, default_unit from exercises where user_id = $1 and name = any($2)`, [me, bandNames]);
    for (const r of after) expect(r.default_unit, r.name).toBe(r.name === 'Band Pushdown' ? 'lb' : 'bw');
    expect(await db.server(`select 1 from exercise_display_units where exercise_id = $1`, [curl])).toEqual([]);
    // Nothing else moved: the other exercises are as a new account has them.
    const others = await db.server<{ n: number }>(
      `select count(*)::int as n from exercises where user_id = $1 and default_unit = 'bw'`, [me]);
    const expected = starter.exercises.filter((e: { default_unit: string }) => e.default_unit === 'bw').length - 1;
    expect(others[0].n).toBe(expected);

    const before = await db.server(`select id, version, default_unit from exercises order by id`);
    await db.pg.exec(bands);
    expect(await db.server(`select id, version, default_unit from exercises order by id`)).toEqual(before);
  }, 60000);
});
