// Stage 4B: the connector's protocol, sign-in refusals, error shape, size
// limits, too-many-requests and the call log, with the database stood in for.
// The same connector against Supabase's own local version, with real coach
// passes and real isolation, is in tests/supabase/connector.test.ts.
import { beforeAll, describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Caller } from '@/server/connector/auth';
import { createMcpHandler, type Deps } from '@/server/connector/mcp';
import { authenticate } from '@/server/connector/auth';

const SUPABASE = 'https://example-project.supabase.co';
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  delete process.env.NEXT_PUBLIC_APP_ORIGIN;
});

/** A stand-in database: every query on a table answers with that table's rows. */
function fakeDb(tables: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      const result = { data: tables[table] ?? null, error: null };
      const chain: unknown = new Proxy({}, {
        get: (_t, prop) => (prop === 'then' ? (resolve: (v: unknown) => void) => resolve(result) : () => chain),
      });
      return chain;
    },
  } as unknown as SupabaseClient;
}

const vocabulary = [
  { id: 'g1', kind: 'muscle_group', name: 'Chest', parent_id: null, sort_order: 1 },
  { id: 'f1', kind: 'focus', name: 'Upper chest', parent_id: 'g1', sort_order: 1 },
  { id: 'g2', kind: 'muscle_group', name: 'Back', parent_id: null, sort_order: 2 },
  { id: 'e1', kind: 'equipment', name: 'Dumbbell', parent_id: null, sort_order: 1 },
];

function setup(opts: { recent?: Date[] } = {}) {
  const logged: Array<{ name: string; tool: string; ok: boolean }> = [];
  const caller: Caller = {
    userId: 'u-1', clientId: 'client-1', token: 't', claims: { sub: 'u-1', iss: SUPABASE + '/auth/v1', exp: 0 },
    me: { id: 'u-1', display_name: 'Nate', totals_unit: 'lb', time_zone: 'America/Denver' },
    db: fakeDb({
      coach_profiles: { goals: 'Get strong', injuries_and_limits: '', weekly_schedule: '', notes: '', priorities: [{ value: 'strength' }], coach_style: 'supportive', exercises_liked: '', exercises_to_avoid: '', how_to_coach_me: '' },
      gyms: [{ id: 'gym-1', name: 'Home', equipment: ['Dumbbell'], notes: '', is_default: true }],
      vocabulary_terms: vocabulary,
    }),
  };
  const deps: Deps = {
    authenticate: async () => caller,
    recentCallTimes: async () => opts.recent ?? [],
    logCall: async (_c, name, tool, ok) => { logged.push({ name, tool, ok }); },
    clientName: async () => 'ChatGPT',
  };
  return { handler: createMcpHandler(deps), logged, deps };
}

const HEADERS = { authorization: 'Bearer x', 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
const post = (body: unknown, headers: Record<string, string> = HEADERS) =>
  new Request('https://chalkandiron.test/mcp', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const call = (name: string, args: unknown = {}) => rpc('tools/call', { name, arguments: args });

async function json(r: Response) {
  return (await r.json()) as { result?: Record<string, unknown> & { structuredContent?: Record<string, unknown>; isError?: boolean }; error?: { code: number; message: string } };
}

describe('sign-in, before anything else', () => {
  const real = createMcpHandler({ ...setup().deps, authenticate });

  it('with no pass, answers 401 and points to who signs coaches in', async () => {
    const r = await real(post(rpc('initialize'), { 'content-type': 'application/json' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://chalkandiron.test/.well-known/oauth-protected-resource"');
    expect(r.headers.get('access-control-expose-headers')).toContain('WWW-Authenticate');
  });

  it('refuses a pass that is not readable', async () => {
    const r = await real(post(rpc('initialize'), { ...HEADERS, authorization: 'Bearer not-a-pass' }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('error="invalid_token"');
  });

  const pass = (claims: Record<string, unknown>) =>
    [{ alg: 'HS256', typ: 'JWT' }, claims, 'sig'].map((p) => (typeof p === 'string' ? p : Buffer.from(JSON.stringify(p)).toString('base64url'))).join('.');
  const future = Math.floor(Date.now() / 1000) + 600;

  it('refuses a pass from another sign-in service', async () => {
    const r = await real(post(rpc('initialize'), { ...HEADERS, authorization: 'Bearer ' + pass({ iss: 'https://other.supabase.co/auth/v1', sub: 'u', role: 'authenticated', aud: 'authenticated', exp: future, client_id: 'c' }) }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('different sign-in service');
  });

  it('refuses an expired pass', async () => {
    const r = await real(post(rpc('initialize'), { ...HEADERS, authorization: 'Bearer ' + pass({ iss: SUPABASE + '/auth/v1', sub: 'u', role: 'authenticated', aud: 'authenticated', exp: 1000, client_id: 'c' }) }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('expired');
  });

  it("refuses the app's own sign-in: the link is for coach apps only", async () => {
    const r = await real(post(rpc('initialize'), { ...HEADERS, authorization: 'Bearer ' + pass({ iss: SUPABASE + '/auth/v1', sub: 'u', role: 'authenticated', aud: 'authenticated', exp: future }) }));
    expect(r.status).toBe(401);
    expect(r.headers.get('www-authenticate')).toContain('for coach apps');
  });
});

describe('the protocol', () => {
  it('initialize names the connector and carries its instructions', async () => {
    const { handler } = setup();
    const r = await handler(post(rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })));
    expect(r.status).toBe(200);
    const j = await json(r);
    expect(j.result?.protocolVersion).toBe('2025-06-18');
    expect(j.result?.serverInfo).toMatchObject({ name: 'chalk-and-iron', title: 'Chalk and Iron' });
    expect(String(j.result?.instructions)).toMatch(/only propose/);
    expect(r.headers.get('mcp-session-id')).toBeNull();
  });

  it('lists the three read tools of stage 4B with read-only labels and closed inputs', async () => {
    const { handler } = setup();
    const j = await json(await handler(post(rpc('tools/list'))));
    const tools = j.result?.tools as Array<{ name: string; inputSchema: Record<string, unknown>; annotations: Record<string, unknown> }>;
    expect(tools.map((t) => t.name)).toEqual(['get_profile', 'list_gyms', 'get_vocabulary']);
    for (const t of tools) {
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
      expect(t.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(t.inputSchema.$schema).toBeUndefined();
    }
  });

  it('answers a notification with 202 and nothing else', async () => {
    const { handler } = setup();
    const r = await handler(post({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(r.status).toBe(202);
  });

  it('takes POST only', async () => {
    const { handler } = setup();
    const r = await handler(new Request('https://chalkandiron.test/mcp', { method: 'GET', headers: HEADERS }));
    expect(r.status).toBe(405);
  });

  it('answers a preflight without a pass', async () => {
    const { handler } = setup();
    const r = await handler(new Request('https://chalkandiron.test/mcp', { method: 'OPTIONS' }));
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-headers')).toContain('authorization');
  });

  it('refuses a request over the size limit and a bundle of more than 20 messages', async () => {
    const { handler } = setup();
    const big = await handler(post(JSON.stringify(rpc('tools/list', { pad: 'x'.repeat(300 * 1024) }))));
    expect(big.status).toBe(413);
    const many = await handler(post(Array.from({ length: 21 }, (_, i) => rpc('ping', {}, i + 1))));
    expect(many.status).toBe(400);
  });

  it('refuses a body that is not JSON', async () => {
    const { handler } = setup();
    expect((await handler(post('{nope'))).status).toBe(400);
  });

  it('names an unknown tool as a protocol error, and logs nothing', async () => {
    const { handler, logged } = setup();
    const j = await json(await handler(post(call('delete_everything'))));
    expect(j.error?.message).toMatch(/no tool called "delete_everything"/);
    expect(logged).toEqual([]);
  });
});

describe('the three read tools', () => {
  it('get_profile returns the profile, the intake and what is unanswered', async () => {
    const { handler, logged } = setup();
    const j = await json(await handler(post(call('get_profile'))));
    const out = j.result?.structuredContent as Record<string, unknown>;
    expect(j.result?.isError).toBeUndefined();
    expect(out.display_name).toBe('Nate');
    expect(out.goals).toBe('Get strong');
    expect(out.totals_unit).toBe('lb');
    expect(out.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((out.intake as Record<string, unknown>).coach_style).toBe('supportive');
    expect(out.intake_unanswered).toContain('progression_pace');
    expect(out.intake_unanswered).not.toContain('coach_style');
    expect(out.intake_unanswered).not.toContain('priorities');
    expect(logged).toEqual([{ name: 'ChatGPT', tool: 'get_profile', ok: true }]);
  });

  it('list_gyms returns each gym with no "next" when all fit', async () => {
    const { handler } = setup();
    const out = (await json(await handler(post(call('list_gyms'))))).result?.structuredContent as { gyms: unknown[]; next: unknown };
    expect(out.gyms).toEqual([{ id: 'gym-1', name: 'Home', equipment: ['Dumbbell'], notes: '', is_default: true }]);
    expect(out.next).toBeNull();
  });

  it('get_vocabulary groups focus values under their muscle group', async () => {
    const { handler } = setup();
    const out = (await json(await handler(post(call('get_vocabulary'))))).result?.structuredContent as Record<string, unknown>;
    expect(out.muscle_groups).toEqual([{ name: 'Chest', focus: ['Upper chest'] }, { name: 'Back', focus: [] }]);
    expect(out.equipment).toEqual(['Dumbbell']);
    expect((out.units as Array<{ value: string }>).map((u) => u.value)).toEqual(['lb', 'kg', 'bw']);
    expect((out.set_types as Array<{ value: string }>).map((u) => u.value)).toEqual(['warm_up', 'working', 'drop']);
  });
});

describe('errors, in one shape', () => {
  it('an input a tool does not take is invalid_input, naming the field, and is logged as not working', async () => {
    const { handler, logged } = setup();
    const j = await json(await handler(post(call('get_profile', { user_id: 'someone-else' }))));
    expect(j.result?.isError).toBe(true);
    const error = (j.result?.structuredContent as { error: { code: string; message: string; problems: Array<{ field: string; problem: string }> } }).error;
    expect(error.code).toBe('invalid_input');
    expect(error.problems).toEqual([{ field: 'user_id', problem: 'get_profile has no input called "user_id". Leave it out.' }]);
    expect(JSON.stringify(j.result?.content)).toContain('user_id');
    expect(logged).toEqual([{ name: 'ChatGPT', tool: 'get_profile', ok: false }]);
  });

  it('a "next" marker the tool never gave out is invalid_input', async () => {
    const { handler } = setup();
    const j = await json(await handler(post(call('list_gyms', { next: 'made-up' }))));
    expect((j.result?.structuredContent as { error: { code: string } }).error.code).toBe('invalid_input');
  });

  it('after 60 calls in a minute, too_many_requests says when to try again, and the refused call is not logged', async () => {
    const now = Date.now();
    const recent = Array.from({ length: 60 }, (_, i) => new Date(now - 500 * (i + 1)));
    const { handler, logged } = setup({ recent });
    const j = await json(await handler(post(call('get_profile'))));
    const error = (j.result?.structuredContent as { error: { code: string; retry_after_seconds: number } }).error;
    expect(error.code).toBe('too_many_requests');
    expect(error.retry_after_seconds).toBeGreaterThan(0);
    expect(error.retry_after_seconds).toBeLessThanOrEqual(60);
    expect(logged).toEqual([]);
  });
});
