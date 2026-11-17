// Local self-check:   node check-local.js
// Starts a stand-in for Supabase (public keys, session check, database call,
// sign-in server details) and the proof itself, then checks the connector's
// answers. Proves the code paths only. The real test is with ChatGPT and Claude.

const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'ES256', use: 'sig' };

function sign(claims, { alg = 'ES256', kid = 'test-key' } = {}) {
  const head = Buffer.from(JSON.stringify({ alg, kid, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const data = Buffer.from(head + '.' + body);
  const sig = alg === 'ES256'
    ? crypto.sign('sha256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' })
    : crypto.createHmac('sha256', 'secret').update(data).digest();
  return head + '.' + body + '.' + sig.toString('base64url');
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function main() {
  // Stand-in Supabase
  const fake = http.createServer((req, res) => {
    const send = (code, obj) => { res.statusCode = code; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); };
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const claims = token.split('.').length === 3 ? JSON.parse(Buffer.from(token.split('.')[1], 'base64url')) : {};
    if (req.url === '/auth/v1/.well-known/jwks.json') return send(200, { keys: [jwk] });
    if (req.url === '/.well-known/oauth-authorization-server/auth/v1') {
      return send(200, { issuer: process.env.SUPABASE_URL + '/auth/v1', code_challenge_methods_supported: ['S256', 'plain'], registration_endpoint: process.env.SUPABASE_URL + '/auth/v1/oauth/clients/register', token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'] });
    }
    if (req.url === '/auth/v1/user') return claims.session_id === 'revoked' ? send(403, { error_code: 'session_not_found' }) : send(200, { id: claims.sub });
    if (req.url === '/rest/v1/rpc/proof_whoami') return send(200, { user_id: claims.sub, role: 'authenticated', client_id: claims.client_id || null, is_coach_pass: Boolean(claims.client_id) });
    send(404, { error: 'not found' });
  });
  const fakePort = await listen(fake);
  process.env.SUPABASE_URL = 'http://127.0.0.1:' + fakePort;
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  delete process.env.PUBLIC_BASE_URL;

  const proof = require('./dev-server').createServer();
  const port = await listen(proof);
  const base = 'http://localhost:' + port;
  const issuer = process.env.SUPABASE_URL + '/auth/v1';
  const now = Math.floor(Date.now() / 1000);
  const user = { sub: '11111111-2222-3333-4444-555555555555', email: 'test@example.com', role: 'authenticated', aud: 'authenticated', iss: issuer, iat: now, exp: now + 3600, session_id: 'live', aal: 'aal1', amr: [{ method: 'webauthn', timestamp: now }] };

  const rpc = (token, method, params) => fetch(base + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: params || {} }),
  });
  const results = [];
  const check = async (name, fn) => {
    try { await fn(); results.push('PASS  ' + name); } catch (e) { results.push('FAIL  ' + name + ': ' + e.message); }
  };

  await check('no pass: 401 with resource_metadata pointer', async () => {
    const r = await rpc(null, 'initialize');
    assert.equal(r.status, 401);
    assert.equal(r.headers.get('www-authenticate'), 'Bearer resource_metadata="' + base + '/.well-known/oauth-protected-resource"');
  });
  await check('no pass on GET: 401 too', async () => {
    const r = await fetch(base + '/mcp');
    assert.equal(r.status, 401);
  });
  for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
    await check('metadata at ' + path, async () => {
      const r = await fetch(base + path);
      const j = await r.json();
      assert.equal(r.status, 200);
      assert.equal(j.resource, base + '/mcp');
      assert.deepEqual(j.authorization_servers, [issuer]);
    });
  }
  await check('garbage pass: 401 invalid_token', async () => {
    const r = await rpc('not-a-token', 'initialize');
    assert.equal(r.status, 401);
    assert.match(r.headers.get('www-authenticate'), /error="invalid_token"/);
  });
  await check('HS256 pass refused', async () => {
    assert.equal((await rpc(sign(user, { alg: 'HS256' }), 'initialize')).status, 401);
  });
  await check('expired pass refused', async () => {
    assert.equal((await rpc(sign({ ...user, exp: now - 600 }), 'initialize')).status, 401);
  });
  await check('pass from another issuer refused', async () => {
    assert.equal((await rpc(sign({ ...user, iss: 'https://evil.example/auth/v1' }), 'initialize')).status, 401);
  });
  await check('tampered pass refused', async () => {
    const t = sign(user).split('.');
    t[1] = Buffer.from(JSON.stringify({ ...user, sub: 'someone-else' })).toString('base64url');
    assert.equal((await rpc(t.join('.'), 'initialize')).status, 401);
  });
  await check('disconnected (revoked) sign-in refused', async () => {
    assert.equal((await rpc(sign({ ...user, session_id: 'revoked', client_id: 'c1' }), 'initialize')).status, 401);
  });
  const coach = sign({ ...user, client_id: '9b1c0e6e-0000-4000-8000-00000000c0ac' });
  await check('coach pass: initialize and tools/list', async () => {
    const init = await (await rpc(coach, 'initialize', { protocolVersion: '2025-06-18' })).json();
    assert.equal(init.result.protocolVersion, '2025-06-18');
    const list = await (await rpc(coach, 'tools/list')).json();
    assert.deepEqual(list.result.tools.map((t) => t.name), ['get_profile']);
    assert.equal(list.result.tools[0].annotations.readOnlyHint, true);
  });
  await check('coach pass: get_profile says coach', async () => {
    const out = (await (await rpc(coach, 'tools/call', { name: 'get_profile', arguments: {} })).json()).result.structuredContent;
    assert.equal(out.user_id, user.sub);
    assert.equal(out.is_coach_pass, true);
    assert.equal(out.database_sees.is_coach_pass, true);
  });
  await check('app sign-in: get_profile says not coach', async () => {
    const out = (await (await rpc(sign(user), 'tools/call', { name: 'get_profile', arguments: {} })).json()).result.structuredContent;
    assert.equal(out.is_coach_pass, false);
    assert.deepEqual(out.signed_in_with, ['webauthn']);
  });
  await check('pages load', async () => {
    for (const p of ['/', '/oauth/consent?authorization_id=x', '/passkey', '/manifest.webmanifest']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 200, p);
    }
    const home = await (await fetch(base + '/')).text();
    assert.match(home, /Dynamic client registration is on/);
    assert.doesNotMatch(home, /NOT YET<\/span> Issuer/);
  });

  console.log(results.join('\n'));
  proof.close();
  fake.close();
  process.exit(results.some((l) => l.startsWith('FAIL')) ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
