import 'server-only';
import { createClient } from '@supabase/supabase-js';
import starter from '@data/starter-library.json';
import { publicEnv } from '@/lib/supabase/env';
import { adminClient } from './admin-client';

// Registration and reset, on the server. Design Section 4.
//
// Supabase lets a passkey be added only to an existing, signed-in person. So
// opening a valid link (1) creates or finds the sign-in record, (2) makes a
// one-time sign-in token for it, which sends no email, and (3) hands that
// token to the browser, which trades it for a session and then creates the
// passkey. The token is only ever given to someone holding a valid
// single-use link.

export class LinkError extends Error {}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function oneTimeSignIn(email: string): Promise<string> {
  const { data, error } = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
  const token = data?.properties?.hashed_token;
  if (error || !token) throw new Error('Could not start the sign-in: ' + (error?.message ?? 'no token returned'));
  return token;
}

export async function checkLink(code: string) {
  const { data, error } = await adminClient().rpc('check_link', { p_code: code });
  if (error) throw error;
  const row = (data as Array<{ purpose: string; label: string; valid: boolean; reason: string }>)[0];
  return row ?? { purpose: null, label: '', valid: false, reason: 'unknown' };
}

export async function registerFromInvite(input: { code: string; email: string; name: string; timeZone: string }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL.test(email) || email.length > 200) throw new LinkError('Type a valid email address.');
  if (!name || name.length > 80) throw new LinkError('Type your name.');
  const link = await checkLink(input.code);
  if (link.purpose !== 'invite' || !link.valid) throw new LinkError('This invite link is not valid. Ask the person who invited you for a new one.');

  const admin = adminClient();
  const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { display_name: name } });
  if (created.error || !created.data.user) {
    if (/already|exists/i.test(created.error?.message ?? '')) throw new LinkError('An account with this email already exists.');
    throw new Error('Could not create the account: ' + created.error?.message);
  }
  const userId = created.data.user.id;
  const { error } = await admin.rpc('register_with_invite', {
    p_code: input.code, p_user: userId, p_email: email, p_display_name: name,
    p_time_zone: input.timeZone, p_starter: starter,
  });
  if (error) {
    await admin.auth.admin.deleteUser(userId);
    throw new LinkError(error.message);
  }
  return { tokenHash: await oneTimeSignIn(email) };
}

/** Makes a reset link. Decided by Nathan on 17 Nov 2026: a reset cuts off the
 *  old sign-in at once. Only the app's server can make one (the database
 *  refuses a reset asked for from a page), so every step below always runs.
 *    1. The database checks the person asking is an admin, makes the
 *       single-use link and refuses every pass from a sign-in made before now.
 *    2. Remove the old passkeys.
 *    3. Sign the person out everywhere: every device and every coach app.
 *    4. Block sign-in in Supabase until the link is opened.
 *  Any failure is reported to the admin, never hidden. */
export async function createReset(adminId: string, userId: string) {
  const admin = adminClient();
  const { data, error } = await admin.rpc('server_create_reset', { p_admin: adminId, p_user: userId });
  if (error) throw new LinkError(error.message);
  const removed = await removePasskeys(userId);
  // A deactivated account is already blocked, and Supabase will not make it a
  // one-time sign-in; the database's own lock (step 1) covers it.
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', userId).maybeSingle();
  const active = profile?.account_status === 'active';
  if (active) await signOutEverywhere(userId);
  await setSignInBlocked(userId, true);
  const { data: check } = await admin.auth.admin.getUserById(userId);
  const blocked = Boolean(check.user?.banned_until);
  console.log('RESET ' + JSON.stringify({ target: userId.slice(0, 8), by: adminId.slice(0, 8), passkeys_removed: removed, signed_out: active, blocked }));
  if (!blocked) throw new Error('Sign-in was not blocked for the reset account');
  const row = (data as Array<{ code: string; expires_at: string }>)[0];
  return { code: row.code, expires_at: row.expires_at };
}

/** Opens a reset link. Found by the Phase 1 review (17 Nov 2026): lifting the
 *  block alone would let a device or coach app still holding a renewal token
 *  back in. So after the block is lifted, the person is signed out everywhere
 *  again, before the new one-time sign-in is handed out. The database also
 *  refuses any pass from a sign-in made before the link was opened. */
export async function redeemReset(code: string) {
  const admin = adminClient();
  const link = await checkLink(code);
  if (link.purpose !== 'reset' || !link.valid) throw new LinkError('This reset link is not valid. Ask your admin for a new one.');
  const { data: userId, error } = await admin.rpc('redeem_reset', { p_code: code });
  if (error || !userId) throw new LinkError(error?.message ?? 'This reset link is not valid.');
  const id = userId as string;

  // Old passkeys were removed when the link was made. Clear any made since.
  await removePasskeys(id);
  // Lift the sign-in block set when the link was made, unless an admin has
  // deactivated the account, which keeps its own block.
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', id).maybeSingle();
  const active = profile?.account_status === 'active';
  if (active) {
    await setSignInBlocked(id, false);
    await signOutEverywhere(id);
  }
  console.log('RESET_OPENED ' + JSON.stringify({ target: id.slice(0, 8), unblocked: active, signed_out: active }));
  const { data: u } = await admin.auth.admin.getUserById(id);
  if (!u.user?.email) throw new Error('The account has no email to sign in with');
  return { tokenHash: await oneTimeSignIn(u.user.email) };
}

/** Ends every sign-in a person has, on every device and in every coach app,
 *  through Supabase's own "sign out everywhere". That needs a sign-in of the
 *  person's own, so the server makes a one-time one (no email is sent), uses
 *  it once, and it ends with the rest. Supabase's sign-in tables cannot be
 *  changed from the live database, so this is the dependable way. */
export async function signOutEverywhere(userId: string) {
  const admin = adminClient();
  const { data: u, error: ue } = await admin.auth.admin.getUserById(userId);
  if (ue || !u.user?.email) throw new Error('Could not find the account to sign out: ' + (ue?.message ?? 'no email'));
  const { url, key } = publicEnv();
  const temp = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await temp.auth.verifyOtp({ token_hash: await oneTimeSignIn(u.user.email), type: 'magiclink' });
  if (error || !data.session) throw new Error('Could not sign the account out everywhere: ' + (error?.message ?? 'no session'));
  const out = await admin.auth.admin.signOut(data.session.access_token, 'global');
  if (out.error) throw new Error('Could not sign the account out everywhere: ' + out.error.message);
}

/** Removes every passkey a person has, so only a new one can sign them in. */
export async function removePasskeys(userId: string): Promise<number> {
  const admin = adminClient();
  const keys = await admin.auth.admin.passkey.listPasskeys({ userId });
  if (keys.error) throw keys.error;
  const list = Array.isArray(keys.data) ? keys.data : [];
  for (const k of list) {
    const { error } = await admin.auth.admin.passkey.deletePasskey({ userId, passkeyId: k.id });
    if (error) throw error;
  }
  const after = await admin.auth.admin.passkey.listPasskeys({ userId });
  if (after.error) throw after.error;
  if (Array.isArray(after.data) && after.data.length) throw new Error('Old passkeys were not all removed');
  return list.length;
}

/** Blocks or unblocks sign-in for an account, alongside the database's own block. */
export async function setSignInBlocked(userId: string, blocked: boolean) {
  const { error } = await adminClient().auth.admin.updateUserById(userId, { ban_duration: blocked ? '876000h' : 'none' });
  if (error) throw error;
}
