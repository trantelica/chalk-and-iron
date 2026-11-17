import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { removePasskeys } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

// Reset a locked-out person's sign-in (decided 17 Nov 2026: a reset cuts off
// the old sign-in at once). The database function checks that the caller is
// an admin using their own sign-in, makes the single-use link, signs the
// person out everywhere and refuses every older pass. The server then
// removes their old passkeys, which only Supabase's admin tools can do.
export async function POST(req: Request) {
  try {
    const userId = str((await body(req)).userId, 64);
    const supabase = await serverClient();
    const { data, error } = await supabase.rpc('admin_create_reset', { p_user: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await removePasskeys(userId);
    const row = (data as Array<{ code: string; expires_at: string }>)[0];
    return NextResponse.json({ code: row.code, expires_at: row.expires_at });
  } catch (e) {
    return fail(e);
  }
}
