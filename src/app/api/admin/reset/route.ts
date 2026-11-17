import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { adminClient } from '@/server/admin-client';
import { removePasskeys, setSignInBlocked } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

// Reset a person's sign-in. Decided 17 Nov 2026: a reset cuts off the old
// sign-in at once. This route is the only way to make one: the database
// refuses a reset asked for from a page, so every step below always runs.
//   1. Check who is asking, from their own app sign-in.
//   2. The database checks they are an admin, makes the single-use link,
//      ends sessions it can reach and refuses every older pass.
//   3. Block sign-in in Supabase itself until the link is opened, so no
//      device can fetch a fresh pass or sign in.
//   4. Remove the old passkeys.
// Any failure is reported to the admin, never hidden.
export async function POST(req: Request) {
  try {
    const userId = str((await body(req)).userId, 64);
    const { data: me } = await (await serverClient()).auth.getUser();
    if (!me.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

    const admin = adminClient();
    const { data, error } = await admin.rpc('server_create_reset', { p_admin: me.user.id, p_user: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });

    await setSignInBlocked(userId, true);
    const removed = await removePasskeys(userId);
    const { data: check } = await admin.auth.admin.getUserById(userId);
    const blocked = Boolean(check.user?.banned_until);
    console.log('RESET ' + JSON.stringify({ target: userId.slice(0, 8), by: me.user.id.slice(0, 8), passkeys_removed: removed, blocked }));
    if (!blocked) throw new Error('Sign-in was not blocked for the reset account');

    const row = (data as Array<{ code: string; expires_at: string }>)[0];
    return NextResponse.json({ code: row.code, expires_at: row.expires_at });
  } catch (e) {
    return fail(e);
  }
}
