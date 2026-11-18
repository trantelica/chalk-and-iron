import { NextResponse } from 'next/server';
import { adminClient } from '@/server/admin-client';
import { labPerson } from '@/server/lab';
import { body, fail } from '@/server/http';

// THROWAWAY (iPhone test page): remembers this phone's notification address.
export async function POST(req: Request) {
  try {
    const me = await labPerson();
    if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const b = await body(req);
    const sub = b.subscription as { endpoint?: unknown; keys?: unknown } | undefined;
    if (!sub || typeof sub.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || typeof sub.keys !== 'object') {
      return NextResponse.json({ error: 'No notification address was given.' }, { status: 400 });
    }
    const { error } = await adminClient().from('lab_push_subscriptions').upsert({
      endpoint: sub.endpoint, user_id: me, subscription: sub,
      user_agent: (req.headers.get('user-agent') ?? '').slice(0, 300),
    });
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
