import { NextResponse } from 'next/server';
import { adminClient } from '@/server/admin-client';
import { sendToPerson } from '@/server/push';
import { body, fail, str } from '@/server/http';

// The real rest alert (design Section 7). Supabase's scheduler calls this a
// few seconds before a rest ends (migration ...1200). It waits out the last
// moments and sends "Rest over. Time for your next set." on the second, to a
// phone whose app is in the background. It is the method the iPhone test page
// proved. It needs no key: it acts only on a real alert about to come due,
// never early, only once, and only while it is still wanted (the phone may
// have cancelled it with +0:15, Skip, or because the app is on screen).
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export async function POST(req: Request) {
  try {
    const id = str((await body(req)).id, 64);
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const admin = adminClient();
    const { data: a } = await admin.from('rest_alerts').select('id, user_id, fire_at, status').eq('id', id).maybeSingle();
    if (!a || a.status !== 'scheduled') return NextResponse.json({ skipped: true });
    const due = new Date(a.fire_at as string);
    const wait = due.getTime() - Date.now();
    if (wait > 15000) return NextResponse.json({ error: 'Not due yet' }, { status: 409 });
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    // Claim it, so it is sent once even if called twice, and not at all if it was cancelled meanwhile.
    const sentAt = new Date();
    const { data: claimed } = await admin.from('rest_alerts').update({ status: 'sent', sent_at: sentAt.toISOString() })
      .eq('id', id).eq('status', 'scheduled').select('id');
    if (!claimed?.length) return NextResponse.json({ skipped: true });
    const r = await sendToPerson(a.user_id as string, {
      title: 'Rest over',
      body: 'Time for your next set.',
      url: '/app/workout',
      tag: 'rest',
    });
    const late = ((sentAt.getTime() - due.getTime()) / 1000).toFixed(1);
    await admin.from('rest_alerts').update({
      result: `sent to ${r.sent} phone(s), ${late} s after the end` + (r.failed.length ? `; failed: ${r.failed.join(', ')}` : ''),
    }).eq('id', id);
    return NextResponse.json(r);
  } catch (e) {
    return fail(e);
  }
}
