import { NextResponse } from 'next/server';
import { adminClient } from '@/server/admin-client';
import { sendToPerson } from '@/server/push';
import { body, fail, str } from '@/server/http';

// THROWAWAY (iPhone test page). Called by Supabase's scheduler a few seconds
// before a test rest ends (migration ...1000). It waits out the last moments
// and sends "rest over" on the second. It needs no key: it acts only on a
// real alert that is about to come due, never early, and only once.
export const maxDuration = 30;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const clock = (d: Date, timeZone: string) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone });

export async function POST(req: Request) {
  try {
    const id = str((await body(req)).id, 64);
    if (!UUID.test(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const admin = adminClient();
    const { data: a } = await admin.from('lab_rest_alerts').select('id, user_id, due_at, sent_at').eq('id', id).maybeSingle();
    if (!a || a.sent_at) return NextResponse.json({ skipped: true });
    const due = new Date(a.due_at as string);
    const wait = due.getTime() - Date.now();
    if (wait > 15000) return NextResponse.json({ error: 'Not due yet' }, { status: 409 });
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    // Claim it, so it is sent once even if called twice.
    const sentAt = new Date();
    const { data: claimed } = await admin.from('lab_rest_alerts').update({ sent_at: sentAt.toISOString() })
      .eq('id', id).is('sent_at', null).select('id');
    if (!claimed?.length) return NextResponse.json({ skipped: true });
    const late = ((sentAt.getTime() - due.getTime()) / 1000).toFixed(1);
    const { data: p } = await admin.from('profiles').select('time_zone').eq('id', a.user_id as string).maybeSingle();
    const tz = (p?.time_zone as string | undefined) ?? 'America/Denver';
    const r = await sendToPerson(a.user_id as string, {
      title: 'Rest over',
      body: `Time for your next set. Due ${clock(due, tz)}, sent ${clock(sentAt, tz)} (${late} s after).`,
      url: '/app/lab', tag: 'lab-rest',
    });
    await admin.from('lab_rest_alerts').update({ result: `sent to ${r.sent} phone(s)` + (r.failed.length ? `, failed: ${r.failed.join(', ')}` : '') }).eq('id', id);
    return NextResponse.json(r);
  } catch (e) {
    return fail(e);
  }
}
