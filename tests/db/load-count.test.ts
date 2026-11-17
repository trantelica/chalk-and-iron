// Assisted machines and load counts (Nathan, 17 November 2026; spec Section 3):
// supabase/migrations/...0800_assisted_and_load_count.sql adds both and
// brings accounts made before then up to date.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeDb, starter } from './harness';

type Ex = { name: string; load_count: number; assisted: boolean; default_unit: string };
const file = readFileSync(join(import.meta.dirname, '..', '..', 'supabase', 'migrations', '20261117000800_assisted_and_load_count.sql'), 'utf8');
const lib: Ex[] = starter.exercises;
const special = lib.filter((e) => e.load_count !== 1 || e.assisted);

describe('assisted machines and load counts', () => {
  it('the starter library gives every exercise a load count of 1, 2 or 4, and marks only the two assisted machines', () => {
    expect(lib.every((e) => [1, 2, 4].includes(e.load_count))).toBe(true);
    expect(lib.filter((e) => e.assisted).map((e) => e.name).sort()).toEqual(['Selectorized Machine Assisted Dip', 'Selectorized Machine Assisted Pull-Up']);
    expect(lib.filter((e) => e.assisted).every((e) => e.default_unit !== 'bw')).toBe(true);
  });

  it('the update for older accounts holds exactly the data file\'s list', () => {
    const rows = [...file.matchAll(/^\s*\('((?:[^']|'')+)', (\d), (true|false)\)[,;]$/gm)]
      .map((m) => ({ name: m[1].replace(/''/g, "'"), load_count: Number(m[2]), assisted: m[3] === 'true' }));
    expect(rows).toEqual(special.map((e) => ({ name: e.name, load_count: e.load_count, assisted: e.assisted })));
  });

  it('a new account gets both details from the data file', async () => {
    const db = await makeDb();
    const me = await db.register('me@example.test', 'Me');
    const rows = await db.server<Ex>(`select name, load_count, assisted from exercises where user_id = $1`, [me]);
    const got = new Map(rows.map((r) => [r.name, r]));
    for (const e of lib) {
      expect(got.get(e.name)?.load_count, e.name).toBe(e.load_count);
      expect(got.get(e.name)?.assisted, e.name).toBe(e.assisted);
    }
  }, 60000);

  it('brings an older account up to date, leaves renamed and hand-made exercises alone, and is safe to rerun', async () => {
    const db = await makeDb();
    const me = await db.register('me@example.test', 'Me');
    // Put the account back as it was before: every exercise at the plain defaults.
    await db.server(`update exercises set load_count = 1, assisted = false where user_id = $1`, [me]);
    await db.server(`update exercises set name = 'My Bench' where user_id = $1 and name = 'Dumbbell Bench Press'`, [me]);
    const [{ version: before }] = await db.server<{ version: number }>(`select version from exercises where user_id = $1 and name = 'Dumbbell Incline Press'`, [me]);
    await db.pg.exec(file);
    const rows = await db.server<Ex>(`select name, load_count, assisted from exercises where user_id = $1`, [me]);
    const got = new Map(rows.map((r) => [r.name, r]));
    for (const e of lib.filter((x) => x.name !== 'Dumbbell Bench Press')) {
      expect(got.get(e.name)?.load_count, e.name).toBe(e.load_count);
      expect(got.get(e.name)?.assisted, e.name).toBe(e.assisted);
    }
    expect(got.get('My Bench')?.load_count).toBe(1);
    const [{ version: afterRun }] = await db.server<{ version: number }>(`select version from exercises where user_id = $1 and name = 'Dumbbell Incline Press'`, [me]);
    expect(afterRun).toBe(before + 1);
    // A second run changes nothing.
    await db.pg.exec(file);
    const [{ version: again }] = await db.server<{ version: number }>(`select version from exercises where user_id = $1 and name = 'Dumbbell Incline Press'`, [me]);
    expect(again).toBe(afterRun);
  }, 60000);

  it('refuses a load count other than 1, 2 or 4, and an assisted bodyweight exercise', async () => {
    const db = await makeDb();
    const me = await db.register('me@example.test', 'Me');
    await expect(db.as(me, `update exercises set load_count = 3 where name = 'Dumbbell Bench Press'`)).rejects.toThrow(/load_count/);
    await expect(db.as(me, `update exercises set assisted = true where name = 'Bodyweight Pull-Up'`)).rejects.toThrow(/assisted/);
    await db.as(me, `update exercises set load_count = 2 where name = 'Barbell Curl'`);
  }, 60000);
});
