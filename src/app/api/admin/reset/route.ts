import { NextResponse } from 'next/server';
import { serverClient } from '@/lib/supabase/server';
import { createReset } from '@/server/accounts';
import { body, fail, str } from '@/server/http';

// Reset a person's sign-in. Every step is in createReset (src/server/accounts.ts).
// This route checks who is asking, from their own app sign-in.
export async function POST(req: Request) {
  try {
    const userId = str((await body(req)).userId, 64);
    const { data: me } = await (await serverClient()).auth.getUser();
    if (!me.user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    return NextResponse.json(await createReset(me.user.id, userId));
  } catch (e) {
    return fail(e);
  }
}
