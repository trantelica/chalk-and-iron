// Makes a test account that will sign in by passkey only. No email is sent.
//
// Supabase lets a passkey be added only to an existing, confirmed, signed-in
// user. So this stands in for the real app's invite link:
//   1. Check the invite code (PROOF_INVITE_CODE).
//   2. Create the user with the email marked confirmed (sends no email).
//   3. Generate a one-time sign-in token for them (also sends no email) and
//      hand it to the browser, which trades it for a session with verifyOtp
//      and then registers a passkey.
//
// This is the only place the secret key is used. If the email already has an
// account, this signs that account in, which is how an admin "reset" would
// work. Fine for a throwaway project; the real invite and reset links must be
// single-use and expire.

const crypto = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
const { config } = require('../lib/config');

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

function sameText(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only.' });
  const cfg = config();
  if (!cfg.supabaseUrl || !cfg.secretKey || !cfg.inviteCode) {
    return send(res, 503, { error: 'Not configured: SUPABASE_URL, SUPABASE_SECRET_KEY and PROOF_INVITE_CODE must all be set.' });
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const email = String((body && body.email) || '').trim().toLowerCase();
  const code = String((body && body.code) || '');
  if (!sameText(code, cfg.inviteCode)) return send(res, 403, { error: 'That invite code is not right.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return send(res, 400, { error: 'Type a valid email address.' });

  const admin = createClient(cfg.supabaseUrl, cfg.secretKey, { auth: { persistSession: false, autoRefreshToken: false } }).auth.admin;

  const created = await admin.createUser({ email, email_confirm: true });
  const alreadyThere = created.error && (created.error.code === 'email_exists' || /already/i.test(created.error.message || ''));
  if (created.error && !alreadyThere) return send(res, 502, { error: 'Could not create the account: ' + created.error.message });

  const link = await admin.generateLink({ type: 'magiclink', email });
  if (link.error || !link.data || !link.data.properties || !link.data.properties.hashed_token) {
    return send(res, 502, { error: 'Could not make a sign-in token: ' + ((link.error && link.error.message) || 'no token returned') });
  }

  console.log('BOOTSTRAP ' + JSON.stringify({ new_account: !alreadyThere }));
  send(res, 200, {
    token_hash: link.data.properties.hashed_token,
    type: link.data.properties.verification_type || 'magiclink',
    new_account: !alreadyThere,
  });
};
