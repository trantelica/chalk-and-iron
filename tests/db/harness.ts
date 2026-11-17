// Test database: an in-memory Postgres (PGlite) with a stand-in for Supabase,
// the real migrations, and helpers to act as a given person.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
export const starter = JSON.parse(readFileSync(join(root, 'data', 'starter-library.json'), 'utf8'));

export interface Db {
  pg: PGlite;
  /** Runs SQL as the server (service role, skips row-level security). */
  server<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /** Runs SQL as a signed-in person. Pass coach: true for a coach app's pass. */
  as<T = Record<string, unknown>>(user: string, sql: string, params?: unknown[], opts?: { coach?: boolean; issuedAt?: number; signedInAt?: number }): Promise<T[]>;
  /** Creates an account through a real invite, as registration does. */
  register(email: string, name?: string, opts?: { admin?: boolean; inviter?: string }): Promise<string>;
}

export async function makeDb(): Promise<Db> {
  const pg = await PGlite.create();
  await pg.exec(readFileSync(join(import.meta.dirname, 'supabase-shim.sql'), 'utf8'));
  const dir = join(root, 'supabase', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql') && !f.includes('schedules')).sort()) {
    await pg.exec(readFileSync(join(dir, f), 'utf8'));
  }

  async function run<T>(role: string, claims: object, sql: string, params: unknown[] = []): Promise<T[]> {
    return pg.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
      await tx.exec(`set local role ${role}`);
      const r = await tx.query<T>(sql, params);
      return r.rows;
    });
  }

  const db: Db = {
    pg,
    server: (sql, params) => run('service_role', { role: 'service_role' }, sql, params),
    as: (user, sql, params, opts) => {
      // A pass carries the moment it was issued ("iat"). By default it is a fresh one.
      const iat = opts?.issuedAt ?? Math.floor(Date.now() / 1000) + 1;
      // And when its sign-in began ("amr"), which renewing a pass keeps. By default, when it was issued.
      const signedIn = opts?.signedInAt ?? iat;
      const claims: Record<string, unknown> = { sub: user, role: 'authenticated', iat, amr: [{ method: 'otp', timestamp: signedIn }] };
      if (opts?.coach) claims.client_id = 'test-coach-app';
      return run('authenticated', claims, sql, params);
    },
    async register(email, name = email.split('@')[0], opts = {}) {
      let code: string;
      if (opts.inviter) {
        code = (await db.as<{ code: string }>(opts.inviter, `select code from admin_create_invite($1)`, [name]))[0].code;
      } else {
        code = (await db.server<{ c: string }>(`select bootstrap_first_admin_invite($1) as c`, [name]))[0].c;
      }
      // Supabase's own sign-in service makes this record; here we write it directly.
      const id = (await pg.query<{ id: string }>(`insert into auth.users (email) values ($1) returning id`, [email])).rows[0].id;
      await db.server(`select register_with_invite($1, $2, $3, $4, $5, $6)`, [code, id, email, name, 'America/Denver', JSON.stringify(starter)]);
      return id;
    },
  };
  return db;
}
