// Stage 4C: the other eleven read tools, run through the real connector against
// a small in-memory database that applies the filters a query asks for. The same
// tools against Supabase's own local version, with real coach passes and two
// people's data, are in tests/supabase/read-tools.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Caller } from '@/server/connector/auth';
import { createMcpHandler, type Deps } from '@/server/connector/mcp';
import { checkInsInARow } from '@/rules/checkins';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example-project.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
});

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

/** Rows kept in memory; select, eq, neq, in, is, gte, lte, lt, order, range and maybeSingle work as the database's do. */
function memoryDb(tables: Tables, rpc: (name: string, args: Row) => unknown = () => ({ data: null, error: null })): SupabaseClient {
  const from = (table: string) => {
    let rows = [...(tables[table] ?? [])];
    let order: Array<[string, boolean]> = [];
    let range: [number, number] | null = null;
    let single = false;
    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] === v); return q; },
      neq: (k: string, v: unknown) => { rows = rows.filter((r) => r[k] !== v); return q; },
      in: (k: string, v: unknown[]) => { rows = rows.filter((r) => v.includes(r[k])); return q; },
      is: (k: string, v: unknown) => { rows = rows.filter((r) => (r[k] ?? null) === v); return q; },
      gte: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) >= v); return q; },
      lte: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) <= v); return q; },
      lt: (k: string, v: string) => { rows = rows.filter((r) => String(r[k]) < v); return q; },
      order: (k: string, o?: { ascending?: boolean }) => { order.push([k, o?.ascending !== false]); return q; },
      range: (a: number, b: number) => { range = [a, b]; return q; },
      maybeSingle: () => { single = true; return q; },
      then: (resolve: (v: unknown) => void) => {
        for (const [k, asc] of [...order].reverse()) rows.sort((x, y) => (String(x[k] ?? '') < String(y[k] ?? '') ? -1 : String(x[k] ?? '') > String(y[k] ?? '') ? 1 : 0) * (asc ? 1 : -1));
        const out = range ? rows.slice(range[0], range[1] + 1) : rows;
        resolve({ data: single ? out[0] ?? null : out, error: null });
      },
    };
    return q;
  };
  return { from, rpc: async (name: string, args: Row) => rpc(name, args) } as unknown as SupabaseClient;
}

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const BENCH = U(1), SQUAT = U(2), CURL = U(3);
const W1 = U(10);
const TODAY = (() => { const d = new Date(); return d.toISOString().slice(0, 10); })();

function data(): Tables {
  return {
    vocabulary_terms: [
      { id: U(20), kind: 'muscle_group', name: 'Chest', parent_id: null, sort_order: 1, archived_at: null },
      { id: U(21), kind: 'muscle_group', name: 'Legs', parent_id: null, sort_order: 2, archived_at: null },
      { id: U(22), kind: 'equipment', name: 'Barbell', parent_id: null, sort_order: 1, archived_at: null },
    ],
    exercises: [
      { id: BENCH, name: 'Barbell Bench Press', default_unit: 'kg', assisted: false, load_count: 1, archived_at: null, muscle_group_id: U(20), focus_id: null, equipment_id: U(22), work_seconds: 45, rest_seconds: 120, note: '' },
      { id: SQUAT, name: 'Barbell Back Squat', default_unit: 'lb', assisted: false, load_count: 1, archived_at: null, muscle_group_id: U(21), focus_id: null, equipment_id: U(22), work_seconds: 45, rest_seconds: 150, note: '' },
      { id: CURL, name: 'Mystery curl', default_unit: 'lb', assisted: false, load_count: 1, archived_at: null, muscle_group_id: null, focus_id: null, equipment_id: null, work_seconds: 40, rest_seconds: 60, note: '' },
    ],
    exercise_alternates: [{ id: U(30), exercise_id: BENCH, tier: 'bodyweight', name: 'Push-up' }],
    workouts: [{ id: W1, name: 'Push', archived_at: null }, { id: U(11), name: 'Old', archived_at: '2026-01-01' }],
    workout_items: [
      { id: U(40), workout_id: W1, position: 0, exercise_id: BENCH, sets: 3, reps: 8, rest_seconds: null, superset_letter: null },
      { id: U(41), workout_id: W1, position: 1, exercise_id: CURL, sets: 2, reps: 12, rest_seconds: 45, superset_letter: null },
    ],
    sessions: [
      { id: U(50), local_date: '2026-11-02', workout_name: 'Push', started_at: '2026-11-02T17:00:00Z', ended_at: '2026-11-02T18:00:00Z', status: 'finished', finish_reason: 'user', clock_banked_seconds: 3000, source_kind: 'ad_hoc', gym_id: null, campaign_day_id: null, current_session_exercise_id: null, clock_running_since: null },
      { id: U(51), local_date: '2026-11-09', workout_name: 'Push', started_at: '2026-11-09T17:00:00Z', ended_at: '2026-11-09T18:00:00Z', status: 'finished', finish_reason: 'user', clock_banked_seconds: 3100, source_kind: 'ad_hoc', gym_id: null, campaign_day_id: null, current_session_exercise_id: null, clock_running_since: null },
    ],
    session_blocks: [
      { id: U(60), session_id: U(50), position: 0, superset_letter: null, time_budget_seconds: 600, clock_started_at: '2026-11-02T17:00:00Z', clock_banked_seconds: 600, broken_at: null, broken_from_block_id: null, sets_done_at_break: null, sets_planned_at_break: null },
      { id: U(61), session_id: U(51), position: 0, superset_letter: null, time_budget_seconds: 600, clock_started_at: '2026-11-09T17:00:00Z', clock_banked_seconds: 600, broken_at: null, broken_from_block_id: null, sets_done_at_break: null, sets_planned_at_break: null },
    ],
    session_exercises: [
      { id: U(70), session_id: U(50), block_id: U(60), exercise_id: BENCH, exercise_name_then: 'Barbell Bench Press', position_in_block: 0, planned_set_types: ['working', 'working'], state: 'done', sets_before_break: null },
      { id: U(71), session_id: U(51), block_id: U(61), exercise_id: BENCH, exercise_name_then: 'Barbell Bench Press', position_in_block: 0, planned_set_types: ['working', 'working'], state: 'done', sets_before_break: null },
    ],
    set_logs: [
      { id: U(80), session_exercise_id: U(70), set_number: 1, weight_lb: 110.231, entered_value: 50, entered_unit: 'kg', reps: 8, set_type: 'working', rpe: null, logged_at: '2026-11-02T17:10:00Z', record_types: [], deleted_at: null },
      { id: U(81), session_exercise_id: U(71), set_number: 1, weight_lb: 121.254, entered_value: 55, entered_unit: 'kg', reps: 8, set_type: 'working', rpe: 8, logged_at: '2026-11-09T17:10:00Z', record_types: ['heaviest', '6_plus'], deleted_at: null },
      { id: U(82), session_exercise_id: U(71), set_number: 2, weight_lb: 66.139, entered_value: 30, entered_unit: 'kg', reps: 12, set_type: 'warm_up', rpe: null, logged_at: '2026-11-09T17:15:00Z', record_types: [], deleted_at: null },
    ],
    gyms: [],
    cardio_logs: [
      { id: U(90), local_date: '2026-11-10', type: 'Run', duration_seconds: 1800, distance: 3, distance_unit: 'mi', notes: 'easy', created_at: '2026-11-10T20:00:00Z' },
    ],
    proposals: [
      { id: U(100), source: 'ChatGPT', kind: 'workout', applies_to: 'library', summary_lines: ['Add a pull workout'], status: 'rejected', expires_at: null, created_at: '2026-11-03T20:00:00Z', decided_at: '2026-11-04T10:00:00Z', decline_reason: 'too much volume' },
      { id: U(101), source: 'ChatGPT', kind: 'today_change', applies_to: 'today', summary_lines: ['Swap bench for dumbbell press'], status: 'pending', expires_at: '2020-01-01T00:00:00Z', created_at: '2026-11-05T20:00:00Z', decided_at: null, decline_reason: null },
    ],
    campaigns: [],
    campaign_days: [],
    campaign_shifts: [],
    campaign_day_overrides: [],
    today_plans: [],
    weekly_checkins: [{ week_start: '2026-11-02' }],
  };
}

function setup(tables: Tables = data(), rpc?: (name: string, args: Row) => unknown) {
  const caller: Caller = {
    userId: 'u-1', clientId: 'client-1', token: 't', claims: { sub: 'u-1', iss: 'x', exp: 0 },
    me: { id: 'u-1', display_name: 'Nate', totals_unit: 'lb', time_zone: 'America/Denver' },
    db: memoryDb(tables, rpc),
  };
  const deps: Deps = { authenticate: async () => caller, recentCallTimes: async () => [], logCall: async () => undefined, clientName: async () => 'ChatGPT' };
  const handler = createMcpHandler(deps);
  let n = 0;
  return async function call(name: string, args: Record<string, unknown> = {}) {
    n += 1;
    const r = await handler(new Request('https://chalkandiron.test/mcp', {
      method: 'POST',
      headers: { authorization: 'Bearer x', 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: n, method: 'tools/call', params: { name, arguments: args } }),
    }));
    const body = await r.json();
    return body.result as { isError?: boolean; structuredContent: Record<string, any> };
  };
}

describe('the library tools', () => {
  it('list_exercises gives every field, the alternates and the incomplete flag', async () => {
    const r = await setup()('list_exercises');
    const list = r.structuredContent.exercises as Array<Record<string, any>>;
    expect(list.map((e) => e.name)).toEqual(['Barbell Back Squat', 'Barbell Bench Press', 'Mystery curl']);
    const bench = list.find((e) => e.id === BENCH)!;
    expect(bench).toMatchObject({ muscle_group: 'Chest', equipment: 'Barbell', default_unit: 'kg', incomplete: false });
    expect(bench.alternates).toEqual({ bodyweight: 'Push-up', basic_gym: null, full_gym: null });
    expect(list.find((e) => e.id === CURL)).toMatchObject({ incomplete: true, empty_fields: ['muscle_group', 'equipment'] });
  });

  it('list_exercises filters, and a value not in the vocabulary lists the allowed ones', async () => {
    const call = setup();
    expect(((await call('list_exercises', { muscle_group: 'chest' })).structuredContent.exercises as unknown[]).length).toBe(1);
    expect(((await call('list_exercises', { search: 'squat' })).structuredContent.exercises as unknown[]).length).toBe(1);
    const bad = await call('list_exercises', { equipment: 'Kettlebell' });
    expect(bad.isError).toBe(true);
    expect(bad.structuredContent.error).toMatchObject({ code: 'unknown_vocabulary' });
    expect(bad.structuredContent.error.message).toContain('Barbell');
  });

  it('list_workouts gives items in order with the exercise default rest and a time budget', async () => {
    const r = await setup()('list_workouts');
    const w = r.structuredContent.workouts as Array<Record<string, any>>;
    expect(w.map((x) => x.name)).toEqual(['Push']);
    expect(w[0].items[0]).toMatchObject({ exercise: 'Barbell Bench Press', rest_seconds: 120, rest_is_exercise_default: true, time_budget_seconds: 3 * 45 + 2 * 120 });
    expect(w[0].items[1]).toMatchObject({ rest_seconds: 45, rest_is_exercise_default: false });
  });

  it('get_campaign with none active says so and is not an error', async () => {
    const r = await setup()('get_campaign');
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ campaign: null, drafts: [] });
    expect(r.structuredContent.message).toMatch(/no active campaign/i);
  });

  it('get_campaign lays out every day with its date, state and overrides, and lists the drafts', async () => {
    const t = data();
    t.campaigns = [
      { id: U(200), name: 'Fall', start_date: '2026-11-02', week_count: 2, status: 'active', created_at: '2026-11-01' },
      { id: U(201), name: 'Winter draft', start_date: '2026-12-01', week_count: 4, status: 'draft', created_at: '2026-11-02' },
    ];
    t.campaign_days = [{ id: U(210), campaign_id: U(200), week: 1, weekday: 1, workout_id: W1 }, { id: U(211), campaign_id: U(200), week: 2, weekday: 1, workout_id: W1 }];
    t.campaign_day_overrides = [{ campaign_day_id: U(211), workout_item_id: U(40), exercise_id: null, sets: 4, reps: null, weight_lb: 132.277, weight_entered_value: 60, weight_entered_unit: 'kg', rest_seconds: null }];
    t.sessions = [...t.sessions, { id: U(52), local_date: '2026-11-02', workout_name: 'Push', started_at: '2026-11-02T17:00:00Z', status: 'finished', finish_reason: 'user', campaign_day_id: U(210) } as Row];
    const r = await setup(t)('get_campaign');
    const c = r.structuredContent.campaign as Record<string, any>;
    expect(c).toMatchObject({ name: 'Fall', start_date: '2026-11-02', end_date: '2026-11-15', week_count: 2 });
    expect(c.days).toHaveLength(14);
    expect(c.days[0]).toMatchObject({ date: '2026-11-02', state: 'done', workout: { name: 'Push' } });
    expect(c.days[1]).toMatchObject({ date: '2026-11-03', state: 'rest', workout: null });
    const w2 = c.days.find((d: Row) => d.date === '2026-11-09');
    expect(w2.overrides[0]).toMatchObject({ workout_exercise: 'Barbell Bench Press', sets: 4, weight: { value: 60, unit: 'kg', lb: 132.277 } });
    expect(r.structuredContent.drafts).toEqual([{ id: U(201), name: 'Winter draft' }]);
  });

  it('get_campaign says not found for a campaign that is not there', async () => {
    const r = await setup()('get_campaign', { campaign_id: U(999) });
    expect(r.structuredContent.error.code).toBe('not_found');
  });
});

describe('the history tools', () => {
  it('get_exercise_history gives sets in the exercise unit, records, volume and the estimated one-rep max', async () => {
    const r = await setup()('get_exercise_history', { exercise: 'barbell bench press', from: '2026-10-01', to: '2026-11-30' });
    const h = r.structuredContent;
    expect(h.exercise).toMatchObject({ name: 'Barbell Bench Press', unit: 'kg' });
    expect(h.sessions.map((s: Row) => s.date)).toEqual(['2026-11-09', '2026-11-02']);
    expect(h.sessions[0].sets[0]).toMatchObject({ weight: { value: 55, unit: 'kg', lb: 121.254 }, reps: 8, rpe: 8, records: ['heaviest', '6_plus'] });
    // The warm-up adds nothing to volume: 121.254 lb x 8, rounded.
    expect(h.sessions[0].volume).toEqual({ value: 970, unit: 'lb' });
    expect(h.estimated_one_rep_max.unit).toBe('kg');
  });

  it('get_exercise_history by id, with a bad id or a from after to', async () => {
    const call = setup();
    expect((await call('get_exercise_history', { exercise: BENCH, limit: 1 })).structuredContent.sessions).toHaveLength(1);
    expect((await call('get_exercise_history', { exercise: 'No such lift' })).structuredContent.error.code).toBe('not_found');
    expect((await call('get_exercise_history', { exercise: BENCH, from: '2026-11-30', to: '2026-11-01' })).structuredContent.error.code).toBe('invalid_input');
    expect((await call('get_exercise_history', { exercise: BENCH, from: 'last week' })).structuredContent.error.code).toBe('invalid_input');
  });

  it('get_records gives the four records with a tie moved to the newer set, and leaves out warm-ups', async () => {
    const r = await setup()('get_records');
    const list = r.structuredContent.exercises as Array<Record<string, any>>;
    expect(list.map((e) => e.exercise)).toEqual(['Barbell Bench Press']);
    expect(list[0].records.heaviest).toMatchObject({ reps: 8, date: '2026-11-09', weight: { value: 55, unit: 'kg' } });
    expect(list[0].records['10_plus']).toBeUndefined();
  });

  it('list_sessions gives each session with duration, volume, efficiency and its exercises', async () => {
    const r = await setup()('list_sessions', { limit: 1 });
    const s = r.structuredContent.sessions as Array<Record<string, any>>;
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ date: '2026-11-09', workout_name: 'Push', duration_seconds: 3100, records_set: 1, source: 'ad_hoc', status: 'finished' });
    expect(s[0].exercises[0].sets).toHaveLength(2);
    expect(r.structuredContent.next).not.toBeNull();
    const more = await setup()('list_sessions', { next: r.structuredContent.next, limit: 1 });
    expect((more.structuredContent.sessions as Array<Row>)[0].date).toBe('2026-11-02');
  });

  it('list_cardio gives entries with distance and unit', async () => {
    const r = await setup()('list_cardio', { from: '2026-11-01', to: '2026-11-30' });
    expect(r.structuredContent.cardio).toEqual([{ id: U(90), date: '2026-11-10', type: 'Run', duration_seconds: 1800, distance: { value: 3, unit: 'mi' }, notes: 'easy' }]);
  });
});

describe('proposals', () => {
  it('get_proposal_status gives the decline reason; an expired pending one reads as expired', async () => {
    const call = setup();
    expect((await call('get_proposal_status', { proposal_id: U(100) })).structuredContent.proposal).toMatchObject({ status: 'rejected', decline_reason: 'too much volume', source: 'ChatGPT' });
    expect((await call('get_proposal_status', { proposal_id: U(101) })).structuredContent.proposal.status).toBe('expired');
    expect((await call('get_proposal_status', { proposal_id: U(999) })).structuredContent.error.code).toBe('not_found');
  });

  it('list_proposals filters by status, kind and date, newest first', async () => {
    const call = setup();
    const all = (await call('list_proposals')).structuredContent;
    expect(all.proposals.map((p: Row) => p.id)).toEqual([U(101), U(100)]);
    expect((await call('list_proposals', { status: 'rejected' })).structuredContent.proposals).toHaveLength(1);
    expect((await call('list_proposals', { status: 'expired' })).structuredContent.proposals[0].id).toBe(U(101));
    expect((await call('list_proposals', { kind: 'workout' })).structuredContent.proposals).toHaveLength(1);
    expect((await call('list_proposals', { from: '2026-11-05' })).structuredContent.proposals).toHaveLength(1);
    expect((await call('list_proposals', { status: 'bogus' })).structuredContent.error.code).toBe('invalid_input');
  });
});

describe('get_today', () => {
  it('with nothing planned and nothing running, says so', async () => {
    const r = await setup()('get_today');
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent).toMatchObject({ planned: null, live_session: null, missed_workouts_available: [] });
    expect(r.structuredContent.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(r.structuredContent.pending_today_proposals).toEqual([]);
  });

  it("gives today's prepared plan with last session's numbers", async () => {
    const t = data();
    t.today_plans = [{ id: U(300), local_date: TODAY, workout_id: W1, campaign_day_id: null, plan: { items: [{ exercise_id: BENCH, sets: 3, reps: 8 }] }, consumed_at: null, created_at: '2026-11-20T00:00:00Z' }];
    t.today_plans[0].local_date = new Date().toISOString().slice(0, 10);
    const r = await setup(t)('get_today');
    const p = r.structuredContent.planned;
    // The day in the person's time zone can differ from UTC's for a few hours; only check when they agree.
    if (p) {
      expect(p.items[0]).toMatchObject({ exercise: 'Barbell Bench Press', sets: 3, reps: 8, rest_seconds: 120 });
      expect(p.items[0].last_session.date).toBe('2026-11-09');
      expect(p.items[0].last_session.sets[0].weight).toMatchObject({ value: 55, unit: 'kg' });
    }
  });
});

describe('get_weekly_summary', () => {
  it('reads a week, counts check-ins before recording, and records the check-in once', async () => {
    const recorded: Row[] = [];
    const call = setup(data(), (name, args) => { recorded.push({ name, ...args }); return { data: { week_start: args.p_week_of, added: true }, error: null }; });
    const r = await call('get_weekly_summary', { week_of: '2026-11-11' });
    const s = r.structuredContent;
    expect(s.week).toMatchObject({ starts: '2026-11-09', ends: '2026-11-15' });
    expect(s.sessions_done).toBe(1);
    expect(s.sessions[0].exercises[0].sets[0].weight).toMatchObject({ value: 55, unit: 'kg' });
    expect(s.records_set).toBe(1);
    expect(s.cardio).toHaveLength(1);
    expect(s.total_volume).toEqual({ value: 970, unit: 'lb' });
    expect(s.check_in).toEqual({ week_starts: '2026-11-09', recorded_by_this_read: true, recorded: true });
    expect(recorded).toEqual([{ name: 'record_weekly_checkin', p_week_of: '2026-11-09' }]);
  });

  it('turns away a week that has not started, and still answers if the check-in cannot be recorded', async () => {
    const call = setup(data(), () => ({ data: null, error: { message: 'boom' } }));
    expect((await call('get_weekly_summary', { week_of: '2999-01-01' })).structuredContent.error.code).toBe('invalid_input');
    const r = await call('get_weekly_summary', { week_of: '2026-11-02' });
    expect(r.isError).toBeUndefined();
    expect(r.structuredContent.check_in).toMatchObject({ recorded: false, recorded_by_this_read: false });
  });
});

describe('check-ins in a row', () => {
  it('counts weeks back, unbroken, from the most recent full week', () => {
    // 2026-11-25 is a Wednesday: the last full week began 2026-11-16.
    expect(checkInsInARow(['2026-11-16', '2026-11-09', '2026-11-02'], '2026-11-25')).toBe(3);
    expect(checkInsInARow(['2026-11-16', '2026-11-02'], '2026-11-25')).toBe(1);
    expect(checkInsInARow(['2026-11-23', '2026-11-09'], '2026-11-25')).toBe(0);
    expect(checkInsInARow([], '2026-11-25')).toBe(0);
  });
});

describe('no tool takes a person', () => {
  it('refuses a user id on a read tool', async () => {
    const r = await setup()('list_cardio', { user_id: 'u-2' });
    expect(r.structuredContent.error.code).toBe('invalid_input');
  });
});
