// Saving and sending on Supabase's own local version (design Section 6): the
// phone's call, through a real signed-in client and real row-level security,
// as the app makes it. The same rules are tested in detail on the quick test
// database (tests/db/sync.test.ts).
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logSet, startExercise, startSession, type PlanItem } from '@/rules/session';
import { enqueue, historyFromMemory, sessionChanges, type Change, type MemoryRow, type SyncAnswer } from '@/rules/sync';
import { connectCoach, registerAccount, sql } from './helpers';

const send = async (c: SupabaseClient, cs: Change[]) => {
  const { data, error } = await c.rpc('apply_changes', { p_changes: cs.map(({ id, kind, data }) => ({ id, kind, data })) });
  if (error) throw new Error(error.message);
  return data as SyncAnswer;
};

describe('the phone\'s changes on real Supabase', () => {
  it('a set sent twice is saved once, records come back, and history reads it', async () => {
    const ana = await registerAccount('Ana');
    const { data: ex } = await ana.client.from('exercises').select('id').eq('name', 'Barbell Curl').single();
    const item: PlanItem = { exerciseId: ex!.id, name: 'Barbell Curl', muscle: '', equipment: '', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 90, sets: 3, reps: 8, alternates: [] };
    const t = Date.now();
    let s = startExercise(startSession('Arms', '2026-11-17', [item], {}, t, () => [null, null, null]), t);
    s = logSet(s, { lb: 60, enteredValue: 60, enteredUnit: 'lb', reps: 8 }, {}, t + 1000).session;
    const batch = enqueue([], sessionChanges(null, s), new Set(), t);
    const first = await send(ana.client, batch);
    expect(first.rejected).toEqual([]);
    expect(first.done.length).toBe(batch.length);
    const again = await send(ana.client, batch);
    expect(again.done.length).toBe(batch.length);
    const [{ n }] = await sql<{ n: number }>(`select count(*)::int as n from public.set_logs where user_id = $1`, [ana.id]);
    expect(n).toBe(1);
    const { data: rest } = await ana.client.from('rest_alerts').select('status').eq('session_id', s.id);
    expect(rest).toEqual([{ status: 'scheduled' }]);
    const mem = await ana.client.rpc('exercise_memory', { p_exclude: null });
    expect(mem.error).toBeNull();
    expect(historyFromMemory(mem.data as MemoryRow[])[ex!.id].length).toBe(1);
  });

  it('another person and a coach cannot use it against Ana\'s data', async () => {
    const ana = await registerAccount('Ana2');
    const ben = await registerAccount('Ben');
    const { data: ex } = await ana.client.from('exercises').select('id, note').eq('name', 'Barbell Curl').single();
    const note = { id: crypto.randomUUID(), kind: 'note.put', data: { exercise_id: ex!.id, note: 'not yours' } };
    const r = await ben.client.rpc('apply_changes', { p_changes: [note] });
    expect(r.error).toBeNull();
    const { data: after } = await ana.client.from('exercises').select('note').eq('id', ex!.id).single();
    expect(after!.note).toBe(ex!.note);
    const coach = await connectCoach(ana.client);
    const res = await fetch(`${process.env.SUPABASE_TEST_URL}/rest/v1/rpc/apply_changes`, {
      method: 'POST',
      headers: { apikey: process.env.SUPABASE_TEST_PUBLISHABLE_KEY!, Authorization: `Bearer ${coach.access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ p_changes: [note] }),
    });
    expect(res.ok).toBe(false);
  });
});
