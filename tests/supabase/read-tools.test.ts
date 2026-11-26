// Stage 4C on Supabase's own local version: the other eleven read tools, called
// with real coach passes, each person seeing only their own data, and the weekly
// summary recording one check-in however often it is read (design Section 11, 4C).
import { beforeAll, describe, expect, it } from 'vitest';
import { handleMcp } from '@/server/connector/mcp';
import { connectCoach, registerAccount, sql } from './helpers';

type Person = Awaited<ReturnType<typeof registerAccount>>;
type Coach = Awaited<ReturnType<typeof connectCoach>>;

let n = 0;
async function tool(pass: string, name: string, args: unknown = {}) {
  n += 1;
  const r = await handleMcp(new Request('http://localhost:3000/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: `Bearer ${pass}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name, arguments: args } }),
  }));
  expect(r.status).toBe(200);
  return ((await r.json()).result) as { isError?: boolean; structuredContent: Record<string, any> };
}

let ann: Person, bo: Person;
let annCoach: Coach, boCoach: Coach;
let annBench = '';

beforeAll(async () => {
  ann = await registerAccount('Ann');
  bo = await registerAccount('Bo');
  annCoach = await connectCoach(ann.client);
  boCoach = await connectCoach(bo.client);
  const [ex] = await sql<{ id: string }>(`select id from public.exercises where user_id = $1 and archived_at is null order by name limit 1`, [ann.id]);
  annBench = ex.id;
  const [s] = await sql<{ id: string }>(
    `insert into public.sessions (user_id, local_date, source_kind, workout_name, started_at, ended_at, status, finish_reason, clock_banked_seconds)
     values ($1, '2026-11-09', 'ad_hoc', 'Ann push', '2026-11-09T17:00:00Z', '2026-11-09T18:00:00Z', 'finished', 'user', 3000) returning id`, [ann.id]);
  const [b] = await sql<{ id: string }>(
    `insert into public.session_blocks (user_id, session_id, position, time_budget_seconds, clock_started_at, clock_banked_seconds)
     values ($1, $2, 0, 600, '2026-11-09T17:00:00Z', 600) returning id`, [ann.id, s.id]);
  const [se] = await sql<{ id: string }>(
    `insert into public.session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds, state)
     values ($1, $2, $3, $4, 'Ann lift', '{working}', 8, 120, 45, 'done') returning id`, [ann.id, s.id, b.id, annBench]);
  await sql(`insert into public.set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, set_type, logged_at)
             values ($1, $2, 1, 100, 100, 'lb', 8, 'working', '2026-11-09T17:10:00Z')`, [ann.id, se.id]);
  await sql(`insert into public.cardio_logs (user_id, local_date, type, duration_seconds) values ($1, '2026-11-10', 'Run', 1800)`, [ann.id]);
  await sql(`insert into public.proposals (user_id, source, kind, applies_to, summary_lines, payload, status, decided_at, decline_reason)
             values ($1, 'Test coach', 'workout', 'library', '{Add a pull workout}', '{}', 'rejected', now(), 'too much volume')`, [ann.id]);
});

describe('each person reads only their own data', () => {
  it("Ann's history, sessions, cardio and proposals are hers; Bo sees none of them", async () => {
    const a = await tool(annCoach.access, 'get_exercise_history', { exercise: annBench, from: '2026-11-01', to: '2026-11-30' });
    expect(a.structuredContent.sessions).toHaveLength(1);
    expect((await tool(annCoach.access, 'list_sessions')).structuredContent.sessions).toHaveLength(1);
    expect((await tool(annCoach.access, 'list_cardio', { from: '2026-11-01', to: '2026-11-30' })).structuredContent.cardio).toHaveLength(1);
    const props = (await tool(annCoach.access, 'list_proposals')).structuredContent.proposals as Array<Record<string, unknown>>;
    expect(props[0]).toMatchObject({ status: 'rejected', decline_reason: 'too much volume' });

    expect((await tool(boCoach.access, 'list_sessions')).structuredContent.sessions).toHaveLength(0);
    expect((await tool(boCoach.access, 'list_cardio', { from: '2026-11-01', to: '2026-11-30' })).structuredContent.cardio).toHaveLength(0);
    expect((await tool(boCoach.access, 'list_proposals')).structuredContent.proposals).toHaveLength(0);
    // Ann's exercise id is not found in Bo's library, and Ann's proposal id is not found for Bo.
    expect((await tool(boCoach.access, 'get_exercise_history', { exercise: annBench })).structuredContent.error.code).toBe('not_found');
    const [{ id }] = await sql<{ id: string }>(`select id from public.proposals where user_id = $1`, [ann.id]);
    expect((await tool(boCoach.access, 'get_proposal_status', { proposal_id: id })).structuredContent.error.code).toBe('not_found');
  });

  it('every other read tool answers for the signed-in person alone', async () => {
    for (const name of ['list_exercises', 'list_workouts', 'get_records', 'get_campaign', 'get_today']) {
      const r = await tool(annCoach.access, name);
      expect(r.isError, name).toBeUndefined();
    }
    const ex = (await tool(annCoach.access, 'list_exercises')).structuredContent.exercises as Array<{ name: string }>;
    expect(ex.length).toBeGreaterThan(10);
    expect((await tool(annCoach.access, 'get_records')).structuredContent.exercises).toHaveLength(1);
    expect((await tool(boCoach.access, 'get_records')).structuredContent.exercises).toHaveLength(0);
  });
});

describe('the weekly summary and its check-in', () => {
  it('reading one week twice records one check-in, and the second read counts it', async () => {
    const week = '2026-11-09';
    const first = await tool(annCoach.access, 'get_weekly_summary', { week_of: week });
    expect(first.isError).toBeUndefined();
    expect(first.structuredContent.sessions_done).toBe(1);
    expect(first.structuredContent.check_in).toMatchObject({ recorded: true, recorded_by_this_read: true });
    const again = await tool(annCoach.access, 'get_weekly_summary', { week_of: '2026-11-12' });
    expect(again.structuredContent.check_in).toMatchObject({ recorded: true, recorded_by_this_read: false });
    const rows = await sql(`select 1 from public.weekly_checkins where user_id = $1 and week_start = $2`, [ann.id, week]);
    expect(rows).toHaveLength(1);
    expect(await sql(`select 1 from public.weekly_checkins where user_id = $1`, [bo.id])).toHaveLength(0);
  });

  it('a week that has not started is refused and records nothing', async () => {
    const r = await tool(annCoach.access, 'get_weekly_summary', { week_of: '2999-01-01' });
    expect(r.structuredContent.error.code).toBe('invalid_input');
  });
});
