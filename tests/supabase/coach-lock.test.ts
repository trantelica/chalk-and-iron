// Stage 4A on Supabase's own local version: the lock, tried through the real
// API with a real coach pass (made the way ChatGPT and Claude get one), and
// the coach eval reset through the real API (design Sections 3, 9 and 11).
// Supabase opens new functions and tables to everyone by default, which the
// in-memory test database does not copy, so the doors are listed again here.
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { adminClient } from '@/server/admin-client';
import { connectCoach, registerAccount, sql, url } from './helpers';
import { CALLABLE_BY_SIGNED_IN } from '../db/fixtures';
import { buildState } from '../coach-evals/states.mjs';

const starter = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'data', 'starter-library.json'), 'utf8'));
const asPass = (access: string): SupabaseClient => createClient(url(), process.env.SUPABASE_TEST_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${access}` } },
});
const signedOut = () => createClient(url(), process.env.SUPABASE_TEST_PUBLISHABLE_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });

let person: Awaited<ReturnType<typeof registerAccount>>;
let coach: SupabaseClient;

beforeAll(async () => {
  person = await registerAccount('Coached');
  coach = asPass((await connectCoach(person.client)).access);
});

describe('the doors on real Supabase', () => {
  it('signed-in people can call exactly the listed functions, and signed-out people none', async () => {
    const rows = await sql<{ f: string; auth: boolean; anon: boolean }>(
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as f,
              has_function_privilege('authenticated', p.oid, 'execute') as auth,
              has_function_privilege('anon', p.oid, 'execute') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
    expect(rows.filter((r) => r.auth).map((r) => r.f).sort()).toEqual(Object.keys(CALLABLE_BY_SIGNED_IN).sort());
    expect(rows.filter((r) => r.anon).map((r) => r.f)).toEqual([]);
  });

  it('signed-out people can read and write no table at all', async () => {
    const rows = await sql<{ t: string; p: string }>(
      `select table_name as t, privilege_type as p from information_schema.role_table_grants
       where grantee in ('anon', 'PUBLIC') and table_schema = 'public'`);
    expect(rows).toEqual([]);
  });
});

describe('a real coach pass, through the API', () => {
  it('reads its person\'s data', async () => {
    const { data, error } = await coach.from('exercises').select('id');
    expect(error).toBeNull();
    expect(data!.length).toBe(starter.exercises.length);
  });

  it('cannot add, change or remove training data', async () => {
    const add = await coach.from('cardio_logs').insert({ user_id: person.id, local_date: '2026-11-16', type: 'Run', duration_seconds: 60 });
    expect(add.error).not.toBeNull();
    const change = await coach.from('exercises').update({ note: 'coach was here' }).eq('user_id', person.id).select('id');
    expect(change.data ?? []).toEqual([]);
    const intake = await coach.from('coach_profiles').update({ coach_style: 'challenging' }).eq('user_id', person.id).select('user_id');
    expect(intake.data ?? []).toEqual([]);
    const remove = await coach.from('gyms').delete().eq('user_id', person.id).select('id');
    expect(remove.data ?? []).toEqual([]);
    const save = await coach.rpc('apply_changes', { p_changes: [] });
    expect(save.error).not.toBeNull();
    const notes = await sql<{ n: number }>(`select count(*)::int as n from public.exercises where user_id = $1 and note = 'coach was here'`, [person.id]);
    expect(notes).toEqual([{ n: 0 }]);
  });

  it('adds a pending card, but not a decided one and not a decline reason', async () => {
    const card = { user_id: person.id, source: 'Claude', kind: 'exercise', applies_to: 'library', summary_lines: ['Add one'], payload: {} };
    const ok = await coach.from('proposals').insert(card).select('status');
    expect(ok.error).toBeNull();
    expect(ok.data).toEqual([{ status: 'pending' }]);
    expect((await coach.from('proposals').insert({ ...card, status: 'accepted' })).error).not.toBeNull();
    expect((await coach.from('proposals').insert({ ...card, decline_reason: 'x' })).error).not.toBeNull();
  });

  it('records one check-in per week, and the person\'s own sign-in cannot', async () => {
    const first = await coach.rpc('record_weekly_checkin', { p_week_of: '2026-11-11' });
    expect(first.error).toBeNull();
    expect(first.data).toEqual({ week_start: '2026-11-09', added: true });
    const again = await coach.rpc('record_weekly_checkin', { p_week_of: '2026-11-15' });
    expect(again.data).toEqual({ week_start: '2026-11-09', added: false });
    expect((await person.client.rpc('record_weekly_checkin', { p_week_of: '2026-11-02' })).error).not.toBeNull();
    expect((await coach.from('weekly_checkins').insert({ user_id: person.id, week_start: '2026-10-26' })).error).not.toBeNull();
    const marks = await sql<{ n: number }>(`select count(*)::int as n from public.weekly_checkins where user_id = $1`, [person.id]);
    expect(marks).toEqual([{ n: 1 }]);
  });

  it('notes a call through the guarded step only', async () => {
    expect((await coach.rpc('record_connector_call', { p_client_name: 'Claude', p_tool: 'get_profile', p_ok: true })).error).toBeNull();
    expect((await coach.from('connector_calls').insert({ user_id: person.id, tool: 'get_profile', ok: true })).error).not.toBeNull();
  });

  it('signed out, nothing can be called', async () => {
    const out = signedOut();
    expect((await out.rpc('record_weekly_checkin', { p_week_of: '2026-11-11' })).error).not.toBeNull();
    expect((await out.rpc('exercise_memory', { p_exclude: null })).error).not.toBeNull();
    expect((await out.rpc('load_coach_eval_state', { p_starter: {}, p_state: {} })).error).not.toBeNull();
  });
});

describe('the coach eval reset through the real API', () => {
  it('loads a state into the marked account only, in one call from the server', async () => {
    const evalAccount = await registerAccount('Eval');
    expect((await adminClient().rpc('load_coach_eval_state', { p_starter: starter, p_state: buildState('standard', { starter }) })).error?.message)
      .toMatch(/No account is marked/);
    await sql(`update public.profiles set is_eval_account = true where id = $1`, [evalAccount.id]);
    expect((await coach.rpc('load_coach_eval_state', { p_starter: starter, p_state: {} })).error).not.toBeNull();
    for (const state of ['standard', 'workout_running'] as const) {
      const { data, error } = await adminClient().rpc('load_coach_eval_state', { p_starter: starter, p_state: buildState(state, { starter }) });
      expect(error, state).toBeNull();
      expect((data as { user_id: string }).user_id).toBe(evalAccount.id);
    }
    // The eval account's own coach sees the running workout; the other person's data is untouched.
    const evalCoach = asPass((await connectCoach(evalAccount.client)).access);
    const live = await evalCoach.from('sessions').select('workout_name').eq('status', 'active');
    expect(live.data).toEqual([{ workout_name: 'Push A' }]);
    const theirs = await sql<{ n: number }>(`select count(*)::int as n from public.exercises where user_id = $1`, [person.id]);
    expect(theirs).toEqual([{ n: starter.exercises.length }]);
    await sql(`update public.profiles set is_eval_account = false where id = $1`, [evalAccount.id]);
  });
});
