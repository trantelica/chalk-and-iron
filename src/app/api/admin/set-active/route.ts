import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { setSignInBlocked } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

// Deactivate or reactivate an account. The database function checks that the
// caller is an admin (with their own sign-in) and protects the last admin.
// Only then does the server also block or unblock sign-in itself.
export async function POST(req: Request) {
  try {
    const b = await body(req);
    const userId = str(b.userId, 64);
    const active = b.active === true;
    const supabase = await serverClient();
    const { error } = await supabase.rpc('admin_set_active', { p_user: userId, p_active: active });
    if (error) return NextResponse.json({ error: error.message }, { status: 403 });
    await setSignInBlocked(userId, !active);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
