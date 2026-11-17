import { NextResponse } from 'next/server';
import { labPerson } from '@/server/lab';
import { sendToPerson } from '@/server/push';
import { fail } from '@/server/http';

// THROWAWAY (iPhone test page): sends a test notification at once.
export async function POST() {
  try {
    const me = await labPerson();
    if (!me) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
    const r = await sendToPerson(me, { title: 'Chalk and Iron', body: 'Test notification. Notifications work.', url: '/app/lab', tag: 'lab-now' });
    return NextResponse.json(r);
  } catch (e) {
    return fail(e);
  }
}
