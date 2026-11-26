import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { baseUrl, connectorEnv } from './config';
import { checkPass, TokenError, type PassClaims } from './token';

// Sign-in for every call (design Section 3, "Rules shared by every tool", and
// Section 4, "Signing the coach in to the connector").
//
// - No pass: 401 with a pointer to the protected resource metadata, which is
//   what starts sign-in in ChatGPT and Claude.
// - A pass: checked here (token.ts), then Supabase is asked whether the
//   sign-in behind it still exists, and the database whether the account is
//   active. A Disconnect, a reset or a deactivation stops the coach at once.
// - Only a coach's pass is accepted: one Supabase issued to a coach app (it
//   carries a client_id). The app's own sign-in is refused here.
// - The person comes from the pass, never from anything the coach sends. The
//   connector reads with the coach's own pass, so the database's rules and the
//   coach lock (stage 4A) apply to everything it does.

export interface Me {
  id: string;
  display_name: string;
  totals_unit: 'lb' | 'kg';
  time_zone: string;
}

export interface Caller {
  userId: string;
  clientId: string;
  token: string;
  claims: PassClaims;
  /** The database, as the coach's pass. Row-level security and the coach lock apply. */
  db: SupabaseClient;
  me: Me;
}

export function dbAs(token: string): SupabaseClient {
  const { supabaseUrl, publishableKey } = connectorEnv();
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** 401 with the sign-in pointer. With no pass presented, RFC 6750 says to send no error code. */
export function challenge(request: Request, description = ''): Response {
  const metadata = baseUrl(request) + '/.well-known/oauth-protected-resource';
  const parts = [`resource_metadata="${metadata}"`];
  if (description) parts.push('error="invalid_token"', `error_description="${description.replace(/["\\]/g, "'")}"`);
  return Response.json(
    { error: description ? 'invalid_token' : 'unauthorized', error_description: description || 'Sign in to Chalk and Iron first.', code: 'not_signed_in' },
    { status: 401, headers: { 'WWW-Authenticate': 'Bearer ' + parts.join(', ') } },
  );
}

/** Does the sign-in behind this pass still exist? A local check cannot see a Disconnect. */
async function signInStillActive(token: string): Promise<boolean> {
  const { supabaseUrl, publishableKey } = connectorEnv();
  const r = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: publishableKey, authorization: 'Bearer ' + token } });
  if (r.ok) return true;
  if (r.status === 401 || r.status === 403 || r.status === 404) return false;
  throw new Error('Supabase sign-in check answered HTTP ' + r.status);
}

/** The person's own profile row, seen through the pass. None when the account is inactive or was reset since. */
async function loadMe(db: SupabaseClient): Promise<Me | null> {
  const { data, error } = await db.from('profiles').select('id, display_name, totals_unit, time_zone').limit(2);
  if (error) {
    if (/JWT|jwt|token/.test(error.message)) return null;
    throw new Error('profile read: ' + error.message);
  }
  return data && data.length === 1 ? (data[0] as Me) : null;
}

export async function authenticate(request: Request): Promise<Caller | Response> {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)\s*$/i);
  if (!m) return challenge(request);
  const token = m[1];
  try {
    const claims = await checkPass(token, connectorEnv().issuer);
    if (!claims.client_id) {
      throw new TokenError('This link is for coach apps. Connect it from ChatGPT or Claude, which sign in for you.');
    }
    const db = dbAs(token);
    const [active, me] = await Promise.all([signInStillActive(token), loadMe(db)]);
    if (!active) throw new TokenError('This sign-in has ended: the coach app was disconnected, or the account was reset or blocked. Connect again.');
    if (!me || me.id !== claims.sub) throw new TokenError('This account is not active. Ask your admin, then connect again.');
    return { userId: claims.sub, clientId: claims.client_id, token, claims, db, me };
  } catch (e) {
    if (e instanceof TokenError) return challenge(request, e.message);
    console.error('CONNECTOR_SIGNIN_CHECK_FAILED', String((e as Error)?.message ?? e).slice(0, 200));
    return Response.json({ error: 'server_error', error_description: 'Could not check the sign-in. Try again in a minute.', code: 'server_problem' }, { status: 500 });
  }
}
