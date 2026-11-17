// Spec Section 8: "One user's connector cannot read or propose against
// another user's data", and design Section 4: for every table, an automated
// test signs in as user A and tries to read and write user B's data.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { fillAccount, OWNED_TABLES } from './fixtures';

let db: Db;
let a: string;
let b: string;
let bRecords: Awaited<ReturnType<typeof fillAccount>>;
let aRecords: Awaited<ReturnType<typeof fillAccount>>;

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  aRecords = await fillAccount(db, a);
  bRecords = await fillAccount(db, b);
});

describe('every table is fenced off per person', () => {
  it('covers every table in the public schema', async () => {
    const tables = (await db.server<{ t: string }>(
      `select tablename as t from pg_tables where schemaname = 'public' order by 1`)).map((r) => r.t);
    const serverOnly = ['invites', 'admin_actions'];
    expect(tables.sort()).toEqual([...OWNED_TABLES.map(([t]) => t), ...serverOnly].sort());
    const noRls = await db.server(`select tablename from pg_tables where schemaname in ('public', 'app') and not rowsecurity`);
    expect(noRls).toEqual([]);
  });

  for (const [table, owner] of OWNED_TABLES) {
    it(`${table}: B's rows exist, and A can neither see nor change them, by app or coach sign-in`, async () => {
      const total = await db.server<{ n: number }>(`select count(*)::int as n from ${table} where ${owner} = $1`, [b]);
      expect(total[0].n).toBeGreaterThan(0);
      for (const coach of [false, true]) {
        const seen = await db.as(a, `select count(*)::int as n from ${table} where ${owner} = $1`, [b], { coach }).catch(() => [{ n: 0 }]);
        expect(seen[0]).toEqual({ n: 0 });
        const changed = await db.as(a, `update ${table} set ${owner} = ${owner} where ${owner} = $1 returning 1`, [b], { coach }).catch(() => []);
        expect(changed).toEqual([]);
        const removed = await db.as(a, `delete from ${table} where ${owner} = $1 returning 1`, [b], { coach }).catch(() => []);
        expect(removed).toEqual([]);
      }
      const after = await db.server<{ n: number }>(`select count(*)::int as n from ${table} where ${owner} = $1`, [b]);
      expect(after).toEqual(total);
    });
  }

  it('A cannot write a row owned by B', async () => {
    await expect(db.as(a, `insert into cardio_logs (user_id, local_date, type, duration_seconds) values ($1, '2026-11-17', 'Run', 60)`, [b])).rejects.toThrow();
    await expect(db.as(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'x', 'exercise', 'library', '{"x"}', '{}')`, [b], { coach: true })).rejects.toThrow();
  });

  it('A cannot point their own records at B\'s records', async () => {
    // A's workout using B's exercise, and A's override on B's workout item.
    await expect(db.as(a, `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 9, $3, 3, 8)`,
      [a, aRecords.workout, bRecords.bench])).rejects.toThrow();
    await expect(db.as(a, `insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 5)`,
      [a, aRecords.day, bRecords.workout, bRecords.items[0]])).rejects.toThrow();
  });

  it('A person sees their own rows', async () => {
    const mine = await db.as(a, `select count(*)::int as n from set_logs`);
    expect(mine[0]).toEqual({ n: 1 });
    const mineAsCoach = await db.as(a, `select count(*)::int as n from exercises`, [], { coach: true });
    expect(mineAsCoach[0]).toEqual({ n: 42 });
  });
});

describe('a coach sign-in can read and propose, nothing else', () => {
  it('cannot add, change or remove any training record', async () => {
    const writes = [
      `insert into exercises (user_id, name, default_unit, created_via) values ('${a}', 'Coach Lift', 'bw', 'swap')`,
      `insert into workouts (user_id, name) values ('${a}', 'Coach Workout')`,
      `insert into cardio_logs (user_id, local_date, type, duration_seconds) values ('${a}', '2026-11-17', 'Run', 60)`,
      `insert into vocabulary_terms (user_id, kind, name) values ('${a}', 'equipment', 'sled')`,
    ];
    for (const sql of writes) await expect(db.as(a, sql, [], { coach: true })).rejects.toThrow();
    for (const [table, owner] of OWNED_TABLES) {
      const changed = await db.as(a, `update ${table} set ${owner} = ${owner} where ${owner} = $1 returning 1`, [a], { coach: true }).catch(() => []);
      expect(changed, table).toEqual([]);
      const removed = await db.as(a, `delete from ${table} where ${owner} = $1 returning 1`, [a], { coach: true }).catch(() => []);
      expect(removed, table).toEqual([]);
    }
  });

  it('can add a pending proposal with its targets, but never an accepted one', async () => {
    const [p] = await db.as<{ id: string; status: string }>(a,
      `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'Claude', 'exercise', 'library', '{"Rename Barbell Curl"}', '{}') returning id, status`,
      [a], { coach: true });
    expect(p.status).toBe('pending');
    await db.as(a, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, 'exercises', $3, 1)`,
      [a, p.id, aRecords.curl], { coach: true });
    await expect(db.as(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload, status) values ($1, 'Claude', 'exercise', 'library', '{"x"}', '{}', 'accepted')`,
      [a], { coach: true })).rejects.toThrow();
    const accepted = await db.as(a, `update proposals set status = 'accepted' where id = $1 returning 1`, [p.id], { coach: true }).catch(() => []);
    expect(accepted).toEqual([]);
  });

  it('cannot use any admin function, even for an admin', async () => {
    await expect(db.as(a, `select * from admin_list_accounts()`, [], { coach: true })).rejects.toThrow(/admin/);
    await expect(db.as(a, `select * from admin_create_invite('x')`, [], { coach: true })).rejects.toThrow(/admin/);
  });
});

describe('a deactivated account sees nothing', () => {
  it('blocks both the app and the coach connection, and keeps the data', async () => {
    const c = await db.register('c@example.test', 'Casey', { inviter: a });
    await db.as(a, `select admin_set_active($1, false)`, [c]);
    for (const coach of [false, true]) {
      const seen = await db.as(c, `select count(*)::int as n from exercises`, [], { coach });
      expect(seen[0]).toEqual({ n: 0 });
      const profile = await db.as(c, `select count(*)::int as n from profiles`, [], { coach });
      expect(profile[0]).toEqual({ n: 0 });
    }
    await expect(db.as(c, `insert into cardio_logs (user_id, local_date, type, duration_seconds) values ($1, '2026-11-17', 'Run', 60)`, [c])).rejects.toThrow();
    const kept = await db.server<{ n: number }>(`select count(*)::int as n from exercises where user_id = $1`, [c]);
    expect(kept[0].n).toBe(42);
    await db.as(a, `select admin_set_active($1, true)`, [c]);
    const back = await db.as(c, `select count(*)::int as n from exercises`);
    expect(back[0]).toEqual({ n: 42 });
  });
});
