import 'server-only';
import starter from '@data/starter-library.json';
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

export async function redeemReset(code: string) {
  const admin = adminClient();
  const link = await checkLink(code);
  if (link.purpose !== 'reset' || !link.valid) throw new LinkError('This reset link is not valid. Ask your admin for a new one.');
  const { data: userId, error } = await admin.rpc('redeem_reset', { p_code: code });
  if (error || !userId) throw new LinkError(error?.message ?? 'This reset link is not valid.');

  // Old passkeys were removed when the link was made. Clear any made since.
  await removePasskeys(userId as string);
  // Lift the sign-in block set when the link was made, unless an admin has
  // deactivated the account, which keeps its own block.
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', userId as string).maybeSingle();
  if (profile?.account_status === 'active') await setSignInBlocked(userId as string, false);
  console.log('RESET_OPENED ' + JSON.stringify({ target: (userId as string).slice(0, 8), unblocked: profile?.account_status === 'active' }));
  const { data: u } = await admin.auth.admin.getUserById(userId as string);
  if (!u.user?.email) throw new Error('The account has no email to sign in with');
  return { tokenHash: await oneTimeSignIn(u.user.email) };
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
