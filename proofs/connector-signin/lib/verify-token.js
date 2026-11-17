// Checks a Supabase-issued access token (a JWT) without calling Supabase:
// the signature is checked against the project's public keys (JWKS), then
// the issuer, expiry and role. Uses only Node's built-in crypto.
//
// The project must use asymmetric JWT signing keys (ES256 or RS256). Tokens
// signed with the legacy shared secret (HS256) cannot be checked this way.

const crypto = require('node:crypto');

class TokenError extends Error {
  constructor(description) {
    super(description);
    this.description = description;
  }
}

const JWKS_TTL_MS = 10 * 60 * 1000;
const SKEW_S = 30;
const jwksCache = globalThis.__ciJwks || (globalThis.__ciJwks = { url: '', at: 0, keys: [] });

async function loadKeys(jwksUrl, force) {
  const fresh = jwksCache.url === jwksUrl && Date.now() - jwksCache.at < JWKS_TTL_MS;
  if (fresh && !force) return jwksCache.keys;
  const r = await fetch(jwksUrl, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new TokenError('Could not load the sign-in public keys (HTTP ' + r.status + ').');
  const body = await r.json();
  jwksCache.url = jwksUrl;
  jwksCache.at = Date.now();
  jwksCache.keys = Array.isArray(body.keys) ? body.keys : [];
  return jwksCache.keys;
}

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch (e) {
    throw new TokenError('The token is not readable.');
  }
}

// Returns the token's claims if every check passes; throws TokenError if not.
async function verifySupabaseToken(token, { issuer, resource }) {
  if (!issuer) throw new TokenError('The proof is not configured: SUPABASE_URL is missing.');
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new TokenError('The token is not a JWT.');
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);

  if (header.alg !== 'ES256' && header.alg !== 'RS256') {
    throw new TokenError('Token signed with ' + header.alg + '. Switch the Supabase project to asymmetric JWT signing keys (ES256).');
  }

  const jwksUrl = issuer + '/.well-known/jwks.json';
  let keys = await loadKeys(jwksUrl, false);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    keys = await loadKeys(jwksUrl, true); // keys may have just been rotated
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new TokenError('The token was signed by a key this project does not publish.');

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });
  const signed = Buffer.from(parts[0] + '.' + parts[1]);
  const signature = Buffer.from(parts[2], 'base64url');
  const good = header.alg === 'ES256'
    ? crypto.verify('sha256', signed, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature)
    : crypto.verify('sha256', signed, publicKey, signature);
  if (!good) throw new TokenError('The token signature is not valid.');

  const now = Math.floor(Date.now() / 1000);
  if (claims.iss !== issuer) throw new TokenError('The token was issued by a different sign-in service.');
  if (typeof claims.exp !== 'number' || claims.exp < now - SKEW_S) throw new TokenError('The token has expired.');
  if (typeof claims.nbf === 'number' && claims.nbf > now + SKEW_S) throw new TokenError('The token is not valid yet.');
  if (claims.role !== 'authenticated' || !claims.sub) throw new TokenError('The token does not belong to a signed-in user.');

  // Audience. MCP asks the connector to accept only tokens issued for it
  // (RFC 8707). Supabase accepts the "resource" value ChatGPT and Claude send
  // but does not copy it into the token: every token says aud "authenticated".
  // So the audience proves little here. See README, "What is not confirmed".
  // The connector's own address is also accepted, in case a Supabase access
  // token hook is later used to put it there.
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes('authenticated') && !(resource && aud.includes(resource))) throw new TokenError('The token audience is not one this connector accepts.');

  return claims;
}

module.exports = { verifySupabaseToken, TokenError };
