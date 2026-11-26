import { createPublicKey, verify, type JsonWebKey } from 'node:crypto';

// Checks a coach's pass (a Supabase-issued JWT), carried over from the Phase 1
// sign-in proof. Two checks, as the proof recommended (design Section 11, 4B):
//   1. Here, without calling anyone: the pass is readable, was issued by this
//      project's sign-in service, has not expired, belongs to a signed-in
//      person, and, when the project signs with its newer public keys (ES256 or
//      RS256), the signature matches one of them.
//   2. In auth.ts, on every call: Supabase is asked whether the sign-in behind
//      the pass still exists, so a Disconnect, a reset or a block takes effect
//      at once. Only this project's Supabase can answer yes, which is what
//      makes "passes only from this project" hold even for a project still on
//      the older shared-secret signing, whose signature cannot be checked here.

export class TokenError extends Error {}

export interface PassClaims {
  sub: string;
  iss: string;
  exp: number;
  iat?: number;
  role?: string;
  aud?: string | string[];
  client_id?: string;
  session_id?: string;
  email?: string;
}

const KEYS_TTL_MS = 10 * 60 * 1000;
const SKEW_S = 30;
type KeyCache = { url: string; at: number; keys: Array<JsonWebKey & { kid?: string; alg?: string }> };
const cache: KeyCache = ((globalThis as { __ciConnectorKeys?: KeyCache }).__ciConnectorKeys ??= { url: '', at: 0, keys: [] });

async function loadKeys(url: string, force: boolean) {
  if (!force && cache.url === url && Date.now() - cache.at < KEYS_TTL_MS) return cache.keys;
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('Could not load the sign-in public keys (HTTP ' + r.status + ').');
  const body = (await r.json()) as { keys?: KeyCache['keys'] };
  cache.url = url;
  cache.at = Date.now();
  cache.keys = Array.isArray(body.keys) ? body.keys : [];
  return cache.keys;
}

function part(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
    if (v && typeof v === 'object') return v as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new TokenError('The pass is not readable.');
}

/** Returns the pass's claims if every local check passes; throws TokenError if not. */
export async function checkPass(token: string, issuer: string): Promise<PassClaims> {
  if (!issuer) throw new Error('The connector is not configured: NEXT_PUBLIC_SUPABASE_URL is missing.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('The pass is not a JWT.');
  const header = part(parts[0]);
  const claims = part(parts[1]) as unknown as PassClaims;

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== issuer) throw new TokenError('The pass was issued by a different sign-in service.');
  if (typeof claims.exp !== 'number' || claims.exp < now - SKEW_S) throw new TokenError('The pass has expired.');
  if (claims.role !== 'authenticated' || typeof claims.sub !== 'string' || !claims.sub) {
    throw new TokenError('The pass does not belong to a signed-in person.');
  }
  // MCP asks a connector to accept only passes made for it. Supabase accepts
  // the "resource" ChatGPT and Claude send but does not write it into the
  // pass: every pass says "authenticated" (found by the sign-in proof).
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes('authenticated')) throw new TokenError('The pass is not for this connector.');

  if (header.alg === 'ES256' || header.alg === 'RS256') {
    const url = issuer + '/.well-known/jwks.json';
    let keys = await loadKeys(url, false);
    let jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      keys = await loadKeys(url, true); // the keys may have just been rotated
      jwk = keys.find((k) => k.kid === header.kid);
    }
    if (!jwk) throw new TokenError('The pass was signed by a key this project does not publish.');
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const signed = Buffer.from(parts[0] + '.' + parts[1]);
    const signature = Buffer.from(parts[2], 'base64url');
    const good = header.alg === 'ES256'
      ? verify('sha256', signed, { key, dsaEncoding: 'ieee-p1363' }, signature)
      : verify('sha256', signed, key, signature);
    if (!good) throw new TokenError('The pass signature is not valid.');
  } else if (header.alg !== 'HS256') {
    throw new TokenError('The pass is signed in a way this connector does not accept.');
  }
  return claims;
}
