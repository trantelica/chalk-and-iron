// Stage 4A, the lock (design Section 3, "What the connector may not do"):
// a coach's pass can read its person's rows, add a pending proposal with its
// targets, record a weekly check-in and note a call in the call log. The
// database refuses every other write, through every door: each table, and
// each function a signed-in person can call. Checked two ways: by listing the
// doors (so a new one cannot appear unnoticed), and by trying each one with a
// coach's pass and comparing the whole database before and after.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { CALLABLE_BY_SIGNED_IN, fillAccount, fingerprint, OWNED_TABLES } from './fixtures';

let db: Db;
let a: string;
let b: string;
let aRecords: Awaited<ReturnType<typeof fillAccount>>;

beforeAll(async () => {
  db = await makeDb();
  // A is the first admin: the admin functions are tried with an admin's coach pass.
  a = await db.register('a@example.test', 'Alex');
  b = await db.register('b@example.test', 'Blair', { inviter: a });
  aRecords = await fillAccount(db, a);
  await fillAccount(db, b);
});


/** The only tables a coach's pass may add rows to directly. */
const COACH_MAY_ADD_TO = ['proposals', 'proposal_targets'];

describe('the doors, listed', () => {
  it('signed-in people can call exactly the listed functions, and signed-out people none', async () => {
    const rows = await db.server<{ f: string; auth: boolean; anon: boolean }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    expect(rows.filter((r) => r.auth).map((r) => r.f).sort()).toEqual(Object.keys(CALLABLE_BY_SIGNED_IN).sort());
    expect(rows.filter((r) => r.anon).map((r) => r.f)).toEqual([]);
  });

  it('every write rule outside proposals and their targets needs the app\'s own sign-in', async () => {
    const rules = await db.server<{ tablename: string; policyname: string; qual: string | null; with_check: string | null }>(
      `select tablename, policyname, qual, with_check from pg_policies
       where schemaname = 'public' and cmd <> 'SELECT' and permissive = 'PERMISSIVE'`);
    const loose = rules.filter((r) => !COACH_MAY_ADD_TO.includes(r.tablename))
      .filter((r) => ![r.qual, r.with_check].filter(Boolean).every((x) => x!.includes('app.can_write_uid()')));
    expect(loose).toEqual([]);
    const coachRules = rules.filter((r) => COACH_MAY_ADD_TO.includes(r.tablename)).map((r) => `${r.tablename}.${r.policyname}`);
    expect(coachRules.sort()).toEqual(['proposal_targets.add_targets_to_pending', 'proposals.add_pending_proposal']);
  });

  it('a coach\'s pass may change or remove nothing in proposals', async () => {
    const grants = await db.server<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public' and table_name = any ($1) and privilege_type in ('UPDATE', 'DELETE')`,
      [COACH_MAY_ADD_TO]);
    expect(grants).toEqual([]);
  });
});

describe('the doors, tried with a coach\'s pass', () => {
  it('adding to any table but proposals and their targets is refused', async () => {
    const before = await fingerprint(db);
    for (const [table, owner] of OWNED_TABLES) {
      if (COACH_MAY_ADD_TO.includes(table)) continue;
      // A copy of one of the person's own rows, under a new id where the table has one.
      const cols = (await db.server<{ c: string }>(
        `select column_name as c from information_schema.columns where table_schema = 'public' and table_name = $1
           and column_name not in ('id', 'change_id', 'created_at', 'updated_at') order by ordinal_position`, [table])).map((r) => r.c);
      const list = cols.map((c) => `"${c}"`).join(', ');
      const err = await db.as(a, `insert into ${table} (${list}) select ${list} from ${table} where ${owner} = $1 limit 1`, [a], { coach: true })
        .then(() => null, (e: Error) => e.message);
      expect(err, table).toMatch(/row-level security|permission denied/);
    }
    expect(await fingerprint(db)).toEqual(before);
  });

  it('changing or removing any row is refused, in every table', async () => {
    const before = await fingerprint(db);
    for (const [table, owner] of OWNED_TABLES) {
      const changed = await db.as(a, `update ${table} set ${owner} = ${owner} where ${owner} = $1 returning 1`, [a], { coach: true }).catch(() => []);
      expect(changed, table).toEqual([]);
      const removed = await db.as(a, `delete from ${table} where ${owner} = $1 returning 1`, [a], { coach: true }).catch(() => []);
      expect(removed, table).toEqual([]);
    }
    expect(await fingerprint(db)).toEqual(before);
  });

  it('every function that changes anything refuses it, and changes nothing', async () => {
    // Clearing the reset notice never errors; with a coach's pass it simply finds nothing to clear.
    await db.server(`update profiles set reset_notice_at = now() where id = $1`, [a]);
    const before = await fingerprint(db);
    await db.as(a, `select dismiss_reset_notice()`, [], { coach: true });
    expect(await fingerprint(db)).toEqual(before);
    const someone = b;
    const calls: Record<string, [string, unknown[]]> = {
      'admin_cancel_link(p_invite uuid)': [`select admin_cancel_link(gen_random_uuid())`, []],
      'admin_create_invite(p_label text)': [`select * from admin_create_invite('x')`, []],
      'admin_list_accounts()': [`select * from admin_list_accounts()`, []],
      'admin_list_links()': [`select * from admin_list_links()`, []],
      'admin_request_delete(p_user uuid)': [`select admin_request_delete($1)`, [someone]],
      'admin_set_active(p_user uuid, p_active boolean)': [`select admin_set_active($1, false)`, [someone]],
      'admin_set_admin(p_user uuid, p_admin boolean)': [`select admin_set_admin($1, true)`, [someone]],
      'admin_undo_delete(p_user uuid)': [`select admin_undo_delete($1)`, [someone]],
      'apply_changes(p_changes jsonb)': [`select apply_changes($1)`, [JSON.stringify([{ id: crypto.randomUUID(), kind: 'cardio_add', data: {} }])]],
      'cancel_my_account_deletion()': [`select cancel_my_account_deletion()`, []],
      'decide_planner_proposal(p_proposal uuid, p_accept boolean)': [`select decide_planner_proposal($1, true)`, [aRecords.proposal]],
      'request_my_account_deletion()': [`select request_my_account_deletion()`, []],
      'save_workout(p_workout uuid, p_items jsonb, p_removed uuid[], p_day_sets jsonb)':
        [`select save_workout($1, '[]', '{}', '[]')`, [aRecords.workout]],
    };
    for (const [f, kind] of Object.entries(CALLABLE_BY_SIGNED_IN)) {
      if (kind !== 'refuses a coach' || f === 'dismiss_reset_notice()') continue;
      const [sql, params] = calls[f];
      await expect(db.as(a, sql, params, { coach: true }), f).rejects.toThrow();
    }
    // Reading what was lifted before changes nothing.
    await db.as(a, `select * from exercise_memory(null)`, [], { coach: true });
    expect(await fingerprint(db)).toEqual(before);
    await db.server(`update profiles set reset_notice_at = null where id = $1`, [a]);
  });

  it('what it may do, it may do only for its own person', async () => {
    // A proposal or target for someone else, a check-in or a call logged for them: none of these can name them.
    await expect(db.as(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'Claude', 'exercise', 'library', '{"x"}', '{}')`,
      [b], { coach: true })).rejects.toThrow(/row-level security/);
    const [mine] = await db.as<{ id: string }>(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'Claude', 'exercise', 'library', '{"x"}', '{}') returning id`,
      [a], { coach: true });
    await expect(db.as(a, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id) values ($1, $2, 'exercises', $3)`,
      [b, mine.id, aRecords.bench], { coach: true })).rejects.toThrow(/row-level security/);
    await expect(db.as(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'planner', 'today_change', 'today', '{"x"}', '{}')`,
      [a], { coach: true })).rejects.toThrow(/row-level security/);
    const before = await db.server(`select count(*)::int as n from weekly_checkins where user_id = $1`, [b]);
    await db.as(a, `select record_weekly_checkin('2026-10-12')`, [], { coach: true });
    expect(await db.server(`select count(*)::int as n from weekly_checkins where user_id = $1`, [b])).toEqual(before);
  });

  it('the step that marks cards out of date does nothing with a coach\'s pass', async () => {
    const [p] = await db.as<{ id: string }>(a, `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'Claude', 'exercise', 'library', '{"x"}', '{}') returning id`,
      [a], { coach: true });
    await db.as(a, `insert into proposal_targets (user_id, proposal_id, record_kind, record_id) values ($1, $2, 'exercises', $3)`, [a, p.id, aRecords.curl], { coach: true });
    await db.as(a, `select app.mark_proposals_out_of_date('exercises', $1)`, [aRecords.curl], { coach: true });
    expect(await db.server(`select status from proposals where id = $1`, [p.id])).toEqual([{ status: 'pending' }]);
  });
});
