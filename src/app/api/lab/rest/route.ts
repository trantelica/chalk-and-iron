import { NextResponse } from 'next/server';
import { adminClient } from '@/server/admin-client';
import { labPerson } from '@/server/lab';
import { body, fail } from '@/server/http';

// THROWAWAY (iPhone test page): starts a test rest. The server sends the
// "rest over" notification when it ends (design Section 7).
export async function POST(req: Request) {
  try {
    const me = await labPerson();
    if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const seconds = Number((await body(req)).seconds);
    if (!Number.isInteger(seconds) || seconds < 15 || seconds > 600) {
      return NextResponse.json({ error: 'Choose a rest between 15 and 600 seconds.' }, { status: 400 });
    }
    const due = new Date(Date.now() + seconds * 1000).toISOString();
    const { data, error } = await adminClient().from('lab_rest_alerts').insert({ user_id: me, due_at: due }).select('id, due_at').single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return fail(e);
  }
}

// The last few test rests, with when each was due and when it was sent.
export async function GET() {
  try {
    const me = await labPerson();
    if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const { data, error } = await adminClient().from('lab_rest_alerts')
      .select('id, due_at, handed_at, sent_at, result').eq('user_id', me).order('created_at', { ascending: false }).limit(8);
    if (error) throw error;
    return NextResponse.json({ alerts: data });
  } catch (e) {
    return fail(e);
  }
}
