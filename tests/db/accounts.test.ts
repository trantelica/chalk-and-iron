// Accounts, invites, resets, the admin page and deletion (spec Sections 2
// and 10, design Section 4).
import { beforeEach, describe, expect, it } from 'vitest';
import { makeDb, starter, type Db } from './harness';
import { fillAccount } from './fixtures';

let db: Db;
let admin: string;

beforeEach(async () => {
  db = await makeDb();
  admin = await db.register('nathan@example.test', 'Nathan');
});

async function newAuthUser(email: string) {
  return (await db.pg.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
}
const register = (code: string, id: string, email: string) =>
  db.server(`select register_with_invite($1, $2, $3, 'Friend', 'America/Denver', $4)`, [code, id, email, JSON.stringify(starter)]);

describe('the first admin', () => {
  it('is made once, from a bootstrap invite that works only while no account exists', async () => {
    const me = await db.as<{ is_admin: boolean }>(admin, `select is_admin from profiles`);
    expect(me).toEqual([{ is_admin: true }]);
    await expect(db.server(`select bootstrap_first_admin_invite('again')`)).rejects.toThrow(/already exist/);
  });

  it('cannot be bootstrapped by a signed-in person', async () => {
    await expect(db.as(admin, `select bootstrap_first_admin_invite('x')`)).rejects.toThrow();
  });
});

describe('invites', () => {
  it('a link works once, and the link secret is never stored', async () => {
    const [{ code }] = await db.as<{ code: string }>(admin, `select code from admin_create_invite('Sam')`);
    expect(code).toMatch(/^[0-9a-f]{64}$/);
    const stored = await db.server(`select 1 from invites where code_hash = $1`, [code]);
    expect(stored).toEqual([]);
    expect(await db.server(`select valid, reason from check_link($1)`, [code])).toEqual([{ valid: true, reason: 'ok' }]);
    const sam = await newAuthUser('sam@example.test');
    await register(code, sam, 'sam@example.test');
    expect(await db.server(`select valid, reason from check_link($1)`, [code])).toEqual([{ valid: false, reason: 'used' }]);
    const other = await newAuthUser('other@example.test');
    await expect(register(code, other, 'other@example.test')).rejects.toThrow(/not valid/);
  });

  it('a new account is not an admin and cannot invite anyone', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    expect(await db.as(sam, `select is_admin from profiles`)).toEqual([{ is_admin: false }]);
    await expect(db.as(sam, `select * from admin_create_invite('x')`)).rejects.toThrow(/Only an admin/);
    await expect(db.as(sam, `select * from admin_list_accounts()`)).rejects.toThrow(/Only an admin/);
    // Nor can they make themselves an admin by editing their profile.
    await expect(db.as(sam, `update profiles set is_admin = true`)).rejects.toThrow();
  });

  it('a cancelled or expired link does not work', async () => {
    const [{ invite_id, code }] = await db.as<{ invite_id: string; code: string }>(admin, `select * from admin_create_invite('Pat')`);
    await db.as(admin, `select admin_cancel_link($1)`, [invite_id]);
    await expect(register(code, await newAuthUser('pat@example.test'), 'pat@example.test')).rejects.toThrow(/not valid/);
    const [{ invite_id: i2, code: c2 }] = await db.as<{ invite_id: string; code: string }>(admin, `select * from admin_create_invite('Lee')`);
    await db.server(`update invites set expires_at = now() - interval '1 minute' where id = $1`, [i2]);
    expect(await db.server(`select reason from check_link($1)`, [c2])).toEqual([{ reason: 'expired' }]);
    await expect(register(c2, await newAuthUser('lee@example.test'), 'lee@example.test')).rejects.toThrow(/not valid/);
  });

  it('expires 7 days after it is made, and the admin page lists it', async () => {
    const [{ expires_at }] = await db.as<{ expires_at: Date }>(admin, `select expires_at from admin_create_invite('Kim')`);
    const days = (new Date(expires_at).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
    const links = await db.as<{ label: string; state: string }>(admin, `select label, state from admin_list_links()`);
    expect(links).toContainEqual({ label: 'Kim', state: 'waiting' });
  });
});

describe('the admin page holds no training data', () => {
  it('lists account details only', async () => {
    const cols = await db.as<{ c: string }>(admin, `select * from admin_list_accounts() limit 1`);
    expect(Object.keys(cols[0]).sort()).toEqual(
      ['account_status', 'delete_requested_at', 'display_name', 'email', 'id', 'is_admin', 'joined', 'purge_after'].sort());
  });

  it('an admin cannot read another person\'s training data', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await fillAccount(db, sam);
    for (const t of ['exercises', 'sessions', 'set_logs', 'coach_profiles', 'proposals', 'gyms', 'cardio_logs']) {
      const seen = await db.as<{ n: number }>(admin, `select count(*)::int as n from ${t} where user_id = $1`, [sam]);
      expect(seen[0].n, t).toBe(0);
    }
  });

  it('records every admin action', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await db.as(admin, `select admin_set_active($1, false)`, [sam]);
    await db.as(admin, `select admin_set_active($1, true)`, [sam]);
    await db.as(admin, `select admin_set_admin($1, true)`, [sam]);
    const log = await db.server<{ action: string }>(`select action from admin_actions order by at, action`);
    expect(log.map((r) => r.action)).toEqual(expect.arrayContaining(['create_invite', 'deactivate', 'reactivate', 'make_admin']));
  });
});

describe('the last admin is protected', () => {
  it('cannot be deactivated, deleted or unmade', async () => {
    await expect(db.as(admin, `select admin_set_active($1, false)`, [admin])).rejects.toThrow(/last admin/);
    await expect(db.as(admin, `select admin_set_admin($1, false)`, [admin])).rejects.toThrow(/last admin/);
    await expect(db.as(admin, `select admin_request_delete($1)`, [admin])).rejects.toThrow(/last admin/);
    await expect(db.as(admin, `select request_my_account_deletion()`)).rejects.toThrow(/last admin/);
  });

  it('can step down once another admin exists', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await db.as(admin, `select admin_set_admin($1, true)`, [sam]);
    await db.as(sam, `select admin_set_admin($1, false)`, [admin]);
    expect(await db.as(admin, `select is_admin from profiles`)).toEqual([{ is_admin: false }]);
  });
});

describe('resetting a locked-out person', () => {
  it('ends every sign-in and coach connection, leaves a notice, and works once', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await db.pg.query(`insert into auth.sessions (user_id) values ($1), ($1)`, [sam]);
    const [{ code }] = await db.as<{ code: string }>(admin, `select code from admin_create_reset($1)`, [sam]);
    // Nothing happens until the link is opened.
    expect((await db.pg.query(`select 1 from auth.sessions where user_id = $1`, [sam])).rows).toHaveLength(2);
    const [{ who }] = await db.server<{ who: string }>(`select redeem_reset($1) as who`, [code]);
    expect(who).toBe(sam);
    expect((await db.pg.query(`select 1 from auth.sessions where user_id = $1`, [sam])).rows).toHaveLength(0);
    const [notice] = await db.as<{ reset_notice_at: Date | null }>(sam, `select reset_notice_at from profiles`);
    expect(notice.reset_notice_at).not.toBeNull();
    await expect(db.server(`select redeem_reset($1)`, [code])).rejects.toThrow(/not valid/);
    // Training data is untouched.
    expect((await db.server<{ n: number }>(`select count(*)::int as n from exercises where user_id = $1`, [sam]))[0].n).toBe(42);
  });

  it('an invite link cannot be used as a reset, nor a reset as an invite', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    const [{ code: invite }] = await db.as<{ code: string }>(admin, `select code from admin_create_invite('x')`);
    await expect(db.server(`select redeem_reset($1)`, [invite])).rejects.toThrow(/not valid/);
    const [{ code: reset }] = await db.as<{ code: string }>(admin, `select code from admin_create_reset($1)`, [sam]);
    await expect(register(reset, await newAuthUser('z@example.test'), 'z@example.test')).rejects.toThrow(/not valid/);
  });

  it('a newer reset link replaces an older one', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    const [{ code: first }] = await db.as<{ code: string }>(admin, `select code from admin_create_reset($1)`, [sam]);
    await db.as(admin, `select code from admin_create_reset($1)`, [sam]);
    await expect(db.server(`select redeem_reset($1)`, [first])).rejects.toThrow(/not valid/);
  });
});

describe('deleting an account', () => {
  it('waits 14 days, then removes every row the person owns and nothing else', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await fillAccount(db, sam);
    await fillAccount(db, admin);
    const until = await db.as<{ d: Date }>(sam, `select request_my_account_deletion() as d`);
    expect(new Date(until[0].d).getTime() - Date.now()).toBeGreaterThan(13.99 * 86400000);
    expect(await db.server(`select app.purge_deleted_accounts() as n`)).toEqual([{ n: 0 }]);
    await db.server(`update profiles set delete_requested_at = now() - interval '15 days' where id = $1`, [sam]);
    expect(await db.server(`select app.purge_deleted_accounts() as n`)).toEqual([{ n: 1 }]);
    const tables = (await db.server<{ t: string }>(`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'user_id'`)).map((r) => r.t);
    for (const t of tables) {
      const left = await db.server<{ n: number }>(`select count(*)::int as n from ${t} where user_id = $1`, [sam]);
      expect(left[0].n, t).toBe(0);
    }
    expect((await db.server<{ n: number }>(`select count(*)::int as n from set_logs where user_id = $1`, [admin]))[0].n).toBe(1);
  });

  it('can be cancelled by the person, or undone by an admin, during the 14 days', async () => {
    const sam = await db.register('sam@example.test', 'Sam', { inviter: admin });
    await db.as(sam, `select request_my_account_deletion()`);
    await db.as(sam, `select cancel_my_account_deletion()`);
    expect(await db.as(sam, `select delete_requested_at from profiles`)).toEqual([{ delete_requested_at: null }]);
    await db.as(admin, `select admin_request_delete($1)`, [sam]);
    const [row] = await db.as<{ purge_after: Date }>(admin, `select purge_after from admin_list_accounts() where id = $1`, [sam]);
    expect(row.purge_after).not.toBeNull();
    await db.as(admin, `select admin_undo_delete($1)`, [sam]);
    await db.server(`update profiles set delete_requested_at = null where id = $1`, [sam]);
    expect(await db.server(`select app.purge_deleted_accounts() as n`)).toEqual([{ n: 0 }]);
  });
});

describe('profile settings', () => {
  it('a person can change their look and units, but not unlock a gated skin', async () => {
    await db.as(admin, `update profiles set skin = 'arcade', accent = 'green', totals_unit = 'kg'`);
    await db.server(`update profiles set skins_available = '{chalk}', skin = 'chalk' where id = $1`, [admin]);
    await expect(db.as(admin, `update profiles set skin = 'liquid'`)).rejects.toThrow();
    await expect(db.as(admin, `update profiles set skins_available = '{chalk,liquid}'`)).rejects.toThrow();
  });

  it('new accounts default to pounds, the Chalk and Iron skin, all skins available', async () => {
    const [p] = await db.as<Record<string, unknown>>(admin, `select totals_unit, skin, accent, background, skins_available from profiles`);
    expect(p).toEqual({ totals_unit: 'lb', skin: 'chalk', accent: null, background: 'flat', skins_available: ['chalk', 'arcade', 'liquid'] });
  });
});
