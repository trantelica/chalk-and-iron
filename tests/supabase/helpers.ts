// Helpers for tests against Supabase's own local version.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';
import pg from 'pg';
import { registerFromInvite } from '@/server/accounts';
import { adminClient } from '@/server/admin-client';

export const url = () => process.env.SUPABASE_TEST_URL!;
const key = () => process.env.SUPABASE_TEST_PUBLISHABLE_KEY!;

/** A plain connection as the database owner, as the SQL Editor and the scheduler run. */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_TEST_DB_URL });
  await c.connect();
  try {
    return (await c.query(text, params)).rows as T[];
  } finally {
    await c.end();
  }
}

export function claims(jwt: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
}

/** A new browser-like client with no stored sign-in. */
export const device = (): SupabaseClient =>
  createClient(url(), key(), { auth: { persistSession: false, autoRefreshToken: false } });

let n = 0;
type Person = Awaited<ReturnType<typeof signInOnNewDevice>> & { email: string };
let firstAdmin: Person | null = null;

/** Makes an account through a real invite, as registration does, and signs one device in.
 *  The first account made is the admin, who invites the rest. */
export async function registerAccount(name = 'Test'): Promise<Person> {
  n += 1;
  const email = `t${Date.now()}${n}@example.test`;
  let code: string;
  let viaSql = false;
  if (!firstAdmin) {
    const { data, error } = await adminClient().rpc('bootstrap_first_admin_invite', { p_label: name });
    if (error && /already exist/i.test(error.message)) {
      // Another test file made the first admin already: an invite made straight in the database, as an admin's would be.
      code = randomBytes(24).toString('hex');
      await sql(`insert into public.invites (code_hash, purpose, label) values (app.hash_code($1), 'invite', $2)`, [code, name]);
      viaSql = true;
    } else {
      if (error) throw error;
      code = data as string;
    }
  } else {
    const { data, error } = await firstAdmin.client.rpc('admin_create_invite', { p_label: name });
    if (error) throw error;
    code = (data as Array<{ code: string }>)[0].code;
  }
  const { tokenHash } = await registerFromInvite({ code, email, name, timeZone: 'America/Denver' });
  const person = await signInOnNewDevice(tokenHash);
  const made = { ...person, email };
  if (!firstAdmin && !viaSql) firstAdmin = made;
  return made;
}

/** This test file's admin: the very first account, or, when another test file
 *  ran first and made that one, an account made an admin straight in the database. */
export async function theAdmin() {
  if (!firstAdmin) {
    const made = await registerAccount('Admin');
    if (!firstAdmin) {
      await sql(`update public.profiles set is_admin = true where id = $1`, [made.id]);
      firstAdmin = made;
    }
  }
  return firstAdmin!;
}

/** Trades a one-time sign-in token for a session on a fresh device. */
export async function signInOnNewDevice(tokenHash: string) {
  const d = device();
  const { data, error } = await d.auth.verifyOtp({ token_hash: tokenHash, type: 'magiclink' });
  if (error || !data.session || !data.user) throw error ?? new Error('no session');
  return { id: data.user.id, client: d, session: data.session };
}

/** Tries to renew a sign-in with its renewal token. Returns the new pass, or the error. */
export async function renew(refreshToken: string) {
  const r = await fetch(`${url()}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: key(), 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const j = await r.json();
  return r.ok ? { ok: true as const, access: j.access_token as string, refresh: j.refresh_token as string } : { ok: false as const, error: JSON.stringify(j) };
}

/** Connects a coach app for a signed-in person, the way ChatGPT and Claude do. */
export async function connectCoach(person: SupabaseClient) {
  const redirect = 'http://localhost:9999/callback';
  const reg = await fetch(`${url()}/auth/v1/oauth/clients/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Test coach', redirect_uris: [redirect], token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
    }),
  });
  const client = await reg.json();
  if (!reg.ok) throw new Error('register: ' + JSON.stringify(client));
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const q = new URLSearchParams({
    response_type: 'code', client_id: client.client_id, redirect_uri: redirect,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'x',
  });
  const auth = await fetch(`${url()}/auth/v1/oauth/authorize?${q}`, { redirect: 'manual', headers: { apikey: key() } });
  const loc = auth.headers.get('location') ?? '';
  const authorizationId = new URL(loc, 'http://x').searchParams.get('authorization_id');
  if (!authorizationId) throw new Error(`authorize: ${auth.status} ${loc} ${await auth.text()}`);
  // As the consent page does: read the request, then approve it.
  const details = await person.auth.oauth.getAuthorizationDetails(authorizationId);
  if (details.error) throw details.error;
  const ok = await person.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true });
  if (ok.error) throw ok.error;
  const redirectUrl = (ok.data as { redirect_url?: string; redirect_to?: string }).redirect_url ?? (ok.data as { redirect_to?: string }).redirect_to ?? '';
  const code = new URL(redirectUrl).searchParams.get('code');
  if (!code) throw new Error('approve: ' + JSON.stringify(ok.data));
  const tok = await fetch(`${url()}/auth/v1/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: client.client_id, code_verifier: verifier }),
  });
  const t = await tok.json();
  if (!tok.ok) throw new Error('token: ' + JSON.stringify(t));
  const renewCoach = async (refresh: string) => {
    const r = await fetch(`${url()}/auth/v1/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh, client_id: client.client_id }),
    });
    const j = await r.json();
    return r.ok ? { ok: true as const, access: j.access_token as string, refresh: j.refresh_token as string } : { ok: false as const, error: JSON.stringify(j) };
  };
  return { clientId: client.client_id as string, access: t.access_token as string, refresh: t.refresh_token as string, renew: renewCoach };
}

/** Reads through the database as the holder of a pass: what does it see of its own profile? */
export async function seesOwnProfile(access: string): Promise<boolean> {
  const c = createClient(url(), key(), { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${access}` } } });
  const { data, error } = await c.from('profiles').select('id');
  if (error) return false;
  return (data ?? []).length > 0;
}
