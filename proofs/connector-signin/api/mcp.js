// Chalk and Iron sign-in proof: the connector endpoint at /mcp.
//
// - With no pass (token), every request gets 401 and a pointer to the
//   protected resource metadata. That is what starts sign-in in ChatGPT and Claude.
// - With a pass, the token is checked against Supabase's public keys, then
//   Supabase is asked whether the sign-in behind it is still active, so a
//   Disconnect takes effect at once.
// - One read tool, get_profile, says who is signed in and whether the pass is
//   a coach pass (issued to an OAuth client such as ChatGPT or Claude) or an
//   ordinary app sign-in.
//
// The connector reads with the user's own pass, never with the secret key.
// No call to any LLM service is made from here.

const { config, baseUrl } = require('../lib/config');
const { verifySupabaseToken, TokenError } = require('../lib/verify-token');

const PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26'];

const GET_PROFILE = {
  name: 'get_profile',
  title: 'Get profile (sign-in proof)',
  description: 'Returns who is signed in to Chalk and Iron through this connector: user id, email, and whether this connection uses a coach pass. Test connector for checking sign-in only; it holds no training data.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
};

const clip = (v, n = 200) => String(v == null ? '' : v).slice(0, n);

function challenge(req, res, description) {
  const metadataUrl = baseUrl(req) + '/.well-known/oauth-protected-resource';
  // With no token presented, RFC 6750 says to send no error code.
  const parts = ['resource_metadata="' + metadataUrl + '"'];
  if (description) parts.push('error="invalid_token"', 'error_description="' + description.replace(/"/g, "'") + '"');
  res.statusCode = 401;
  res.setHeader('WWW-Authenticate', 'Bearer ' + parts.join(', '));
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: description ? 'invalid_token' : 'unauthorized', error_description: description || 'Sign in to Chalk and Iron first.' }));
}

// Asks Supabase whether the session behind the token still exists and the
// user is not blocked. Local signature checks cannot see a Disconnect.
async function sessionStillActive(token) {
  const { supabaseUrl, publishableKey } = config();
  const r = await fetch(supabaseUrl + '/auth/v1/user', { headers: { apikey: publishableKey, authorization: 'Bearer ' + token } });
  return r.ok;
}

// What the database itself sees for this pass. Needs setup.sql to have been run.
async function databaseView(token) {
  const { supabaseUrl, publishableKey } = config();
  try {
    const r = await fetch(supabaseUrl + '/rest/v1/rpc/proof_whoami', {
      method: 'POST',
      headers: { apikey: publishableKey, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: '{}',
    });
    if (r.status === 404) return { note: 'proof_whoami not found: run setup.sql in the Supabase SQL editor to see what the database sees.' };
    const body = await r.json().catch(() => null);
    return r.ok ? body : { error: 'HTTP ' + r.status, detail: body };
  } catch (e) {
    return { error: clip(e && e.message) };
  }
}

async function getProfile(claims, token) {
  const clientId = claims.client_id || null;
  const amr = Array.isArray(claims.amr) ? claims.amr.map((m) => (m && m.method) || m) : [];
  return {
    user_id: claims.sub,
    email: claims.email || null,
    is_coach_pass: Boolean(clientId),
    pass_kind: clientId ? 'coach pass (issued to an OAuth client)' : 'app sign-in (not an OAuth client)',
    client_id: clientId,
    session_id: claims.session_id || null,
    signed_in_with: amr,
    assurance_level: claims.aal || null,
    audience: claims.aud,
    issued_at: claims.iat ? new Date(claims.iat * 1000).toISOString() : null,
    expires_at: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
    database_sees: await databaseView(token),
    note: 'Sign-in proof only. No training data here.',
  };
}

async function handle(msg, ctx) {
  const { id, method, params } = msg || {};
  if (id === undefined || id === null) return null; // a notification: no reply
  const reply = (result) => ({ jsonrpc: '2.0', id, result });
  const error = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
  if (method === 'initialize') {
    const asked = params && params.protocolVersion;
    return reply({
      protocolVersion: PROTOCOLS.includes(asked) ? asked : PROTOCOLS[0],
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'chalk-and-iron-signin-proof', title: 'Chalk and Iron (sign-in proof)', version: '0.1.0' },
      instructions: 'Test connector for checking sign-in to the Chalk and Iron lifting app. It has one read tool, get_profile, which says who is signed in. There is no training data.',
    });
  }
  if (method === 'ping') return reply({});
  if (method === 'tools/list') return reply({ tools: [GET_PROFILE] });
  if (method === 'tools/call') {
    if (!params || params.name !== 'get_profile') return error(-32602, 'Unknown tool: ' + clip(params && params.name, 60));
    const out = await getProfile(ctx.claims, ctx.token);
    return reply({ content: [{ type: 'text', text: JSON.stringify(out, null, 2) }], structuredContent: out });
  }
  if (method === 'resources/list') return reply({ resources: [] });
  if (method === 'prompts/list') return reply({ prompts: [] });
  return error(-32601, 'Method not found: ' + clip(method, 60));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'WWW-Authenticate, Mcp-Session-Id');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }

  // 1. A pass is required for everything, including "initialize".
  const auth = String((req.headers && req.headers.authorization) || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return challenge(req, res, '');
  const token = match[1].trim();

  // 2. Check the pass.
  let claims;
  try {
    claims = await verifySupabaseToken(token, { issuer: config().issuer, resource: baseUrl(req) + '/mcp' });
    if (!(await sessionStillActive(token))) throw new TokenError('This sign-in has ended or the account is blocked. Connect again.');
  } catch (e) {
    if (e instanceof TokenError) return challenge(req, res, e.description);
    console.error('VERIFY_FAILED', clip(e && e.message));
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ error: 'server_error', error_description: 'Could not check the sign-in.' }));
  }

  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST, OPTIONS');
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'This endpoint accepts MCP requests by POST only.' } }));
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = undefined; } }
  if (!body || typeof body !== 'object') {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: expected a JSON-RPC message.' } }));
  }

  const batch = Array.isArray(body);
  const messages = batch ? body.slice(0, 20) : [body];
  // Log enough to read the results, but no email addresses.
  console.log('RPC ' + JSON.stringify({
    methods: messages.map((m) => clip(m && m.method, 40)),
    coach_pass: Boolean(claims.client_id),
    client_id: claims.client_id || null,
    user: clip(claims.sub, 8),
    agent: clip(req.headers && req.headers['user-agent'], 80),
  }));
  const replies = (await Promise.all(messages.map((m) => handle(m, { claims, token })))).filter(Boolean);
  if (!replies.length) { res.statusCode = 202; return res.end(); }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(batch ? replies : replies[0]));
};
