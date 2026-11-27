// A stand-in for the Supabase client that runs the connector's queries on the
// test database as a given person (a coach's pass by default), so the real
// connector code meets the real row rules. It speaks only what the connector
// uses: select, eq, neq, in, is, gte, lte, lt, order, range, limit,
// maybeSingle, single, insert and rpc.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from './harness';

type Val = unknown;
const DATE_KEYS = /(^|_)(date|starts_on)$|^week_start$/;

function clean(row: Record<string, Val>): Record<string, Val> {
  const out: Record<string, Val> = {};
  for (const [k, v] of Object.entries(row)) {
    out[k] = v instanceof Date ? (DATE_KEYS.test(k) ? v.toISOString().slice(0, 10) : v.toISOString()) : v;
  }
  return out;
}

const param = (v: Val) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? JSON.stringify(v) : v);
const q = (name: string) => `"${name.replace(/"/g, '')}"`;

export function pgClient(db: Db, user: string, opts: { coach?: boolean } = { coach: true }): SupabaseClient {
  const run = async (sql: string, params: Val[]) => (await db.as<Record<string, Val>>(user, sql, params, opts)).map(clean);

  const from = (table: string) => {
    let cols = '*';
    const where: string[] = [];
    const params: Val[] = [];
    const orders: string[] = [];
    let limit: number | null = null;
    let offset = 0;
    let mode: 'many' | 'maybe' | 'single' = 'many';
    let inserted: Record<string, Val>[] | null = null;
    const add = (frag: (n: number) => string, v: Val) => { params.push(v); where.push(frag(params.length)); };
    const b: Record<string, unknown> = {
      select: (c?: string) => { if (c) cols = c; return b; },
      eq: (k: string, v: Val) => { add((n) => `${q(k)} = $${n}`, v); return b; },
      neq: (k: string, v: Val) => { add((n) => `${q(k)} <> $${n}`, v); return b; },
      in: (k: string, v: Val[]) => { add((n) => `${q(k)} = any ($${n})`, v); return b; },
      is: (k: string, v: Val) => { where.push(v === null ? `${q(k)} is null` : `${q(k)} is ${String(v)}`); return b; },
      gte: (k: string, v: Val) => { add((n) => `${q(k)} >= $${n}`, v); return b; },
      lte: (k: string, v: Val) => { add((n) => `${q(k)} <= $${n}`, v); return b; },
      lt: (k: string, v: Val) => { add((n) => `${q(k)} < $${n}`, v); return b; },
      order: (k: string, o?: { ascending?: boolean }) => { orders.push(`${q(k)} ${o?.ascending === false ? 'desc' : 'asc'}`); return b; },
      range: (a: number, z: number) => { offset = a; limit = z - a + 1; return b; },
      limit: (n: number) => { limit = n; return b; },
      maybeSingle: () => { mode = 'maybe'; return b; },
      single: () => { mode = 'single'; return b; },
      insert: (rows: Record<string, Val> | Record<string, Val>[]) => { inserted = Array.isArray(rows) ? rows : [rows]; return b; },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        (async () => {
          let rows: Record<string, Val>[];
          if (inserted) {
            rows = [];
            for (const r of inserted) {
              const keys = Object.keys(r);
              const sql = `insert into ${q(table)} (${keys.map(q).join(', ')}) values (${keys.map((_, i) => `$${i + 1}`).join(', ')}) returning ${cols}`;
              rows.push(...(await run(sql, keys.map((k) => param(r[k])))));
            }
          } else {
            const sql = `select ${cols} from ${q(table)}${where.length ? ' where ' + where.join(' and ') : ''}${orders.length ? ' order by ' + orders.join(', ') : ''}`
              + `${limit !== null ? ` limit ${limit}` : ''}${offset ? ` offset ${offset}` : ''}`;
            rows = await run(sql, params);
          }
          if (mode === 'many') return { data: rows, error: null };
          if (mode === 'single' && rows.length !== 1) return { data: null, error: { message: 'expected one row' } };
          return { data: rows[0] ?? null, error: null };
        })().then(resolve, (e) => resolve({ data: null, error: { message: String((e as Error).message ?? e) } }) ?? reject?.(e));
      },
    };
    return b;
  };

  const rpc = async (name: string, args: Record<string, Val> = {}) => {
    try {
      const keys = Object.keys(args);
      const rows = await run(`select ${q(name)}(${keys.map((k, i) => `${q(k)} => $${i + 1}`).join(', ')}) as r`, keys.map((k) => param(args[k])));
      return { data: rows[0]?.r ?? null, error: null };
    } catch (e) {
      return { data: null, error: { message: String((e as Error).message ?? e) } };
    }
  };
  return { from, rpc } as unknown as SupabaseClient;
}
