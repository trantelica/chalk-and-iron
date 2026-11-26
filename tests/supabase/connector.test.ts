// Stage 4B on Supabase's own local version: the real connector, called with
// real coach passes made the way ChatGPT and Claude get them (design Section
// 11, 4B: "Connector, isolation and sign-in tests pass").
import { beforeAll, describe, expect, it } from 'vitest';
import { handleMcp } from '@/server/connector/mcp';
import { addProposal } from '@/server/connector/repeat';
import { authenticate, type Caller } from '@/server/connector/auth';
import { connectCoach, registerAccount, sql, theAdmin } from './helpers';

type Person = Awaited<ReturnType<typeof registerAccount>>;
type Coach = Awaited<ReturnType<typeof connectCoach>>;

const HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };
let n = 0;
async function mcp(pass: string | null, method: string, params: unknown = {}) {
  n += 1;
  const r = await handleMcp(new Request('http://localhost:3000/mcp', {
    method: 'POST',
    headers: pass ? { ...HEADERS, authorization: `Bearer ${pass}` } : HEADERS,
    body: JSON.stringify({ jsonrpc: '2.0', id: n, method, params }),
  }));
  const body = r.status === 200 ? await r.json() : null;
  return { status: r.status, challenge: r.headers.get('www-authenticate') ?? '', body };
}
async function tool(pass: string, name: string, args: unknown = {}) {
  const r = await mcp(pass, 'tools/call', { name, arguments: args });
  expect(r.status).toBe(200);
  return r.body.result as { isError?: boolean; structuredContent: Record<string, unknown> };
}
async function callerFor(pass: string): Promise<Caller> {
  const c = await authenticate(new Request('http://localhost:3000/mcp', { method: 'POST', headers: { authorization: `Bearer ${pass}` } }));
  if (c instanceof Response) throw new Error('not signed in: ' + c.headers.get('www-authenticate'));
  return c;
}

let ann: Person;
let bo: Person;
let annCoach: Coach;
let boCoach: Coach;

beforeAll(async () => {
  ann = await registerAccount('Ann');
  bo = await registerAccount('Bo');
  annCoach = await connectCoach(ann.client);
  boCoach = await connectCoach(bo.client);
  await sql(`insert into public.gyms (user_id, name, equipment, notes, is_default) values
    ($1, 'Ann home', '{Dumbbell}', 'Garage', true), ($1, 'Ann old', '{}', '', false),
    ($2, 'Bo club', '{Barbell}', '', true)`, [ann.id, bo.id]);
  await sql(`update public.gyms set archived_at = now() where user_id = $1 and name = 'Ann old'`, [ann.id]);
  await sql(`update public.coach_profiles set goals = 'Ann goals', coach_style = 'challenging', progression_pace = 'steady' where user_id = $1`, [ann.id]);
  await sql(`update public.coach_profiles set goals = 'Bo goals' where user_id = $1`, [bo.id]);
});

describe('sign-in on every call', () => {
  it('with no pass, answers 401 and points to the sign-in details', async () => {
    const r = await mcp(null, 'initialize');
    expect(r.status).toBe(401);
    expect(r.challenge).toBe('Bearer resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource"');
  });

  it("refuses the app's own sign-in: only a coach's pass is accepted", async () => {
    const r = await mcp(ann.session.access_token, 'initialize');
    expect(r.status).toBe(401);
    expect(r.challenge).toContain('for coach apps');
  });

  it('refuses a coach pass whose signature was tampered with', async () => {
    const [h, p, s] = annCoach.access.split('.');
    const forged = [h, Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: bo.id })).toString('base64url'), s].join('.');
    const r = await mcp(forged, 'initialize');
    expect(r.status).toBe(401);
  });

  it('accepts a real coach pass, and the connector carries its instructions', async () => {
    const r = await mcp(annCoach.access, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } });
    expect(r.status).toBe(200);
    expect(r.body.result.instructions).toMatch(/nothing changes until the user accepts it in the app/);
  });

  it('Disconnect stops the coach at once', async () => {
    const cy = await registerAccount('Cy');
    const coach = await connectCoach(cy.client);
    expect((await mcp(coach.access, 'tools/list')).status).toBe(200);
    const { error } = await cy.client.auth.oauth.revokeGrant({ clientId: coach.clientId });
    expect(error).toBeNull();
    const after = await mcp(coach.access, 'tools/list');
    expect(after.status).toBe(401);
  });

  it('deactivating the account stops the coach at once, and reactivating lets it back', async () => {
    const di = await registerAccount('Di');
    const coach = await connectCoach(di.client);
    const admin = await theAdmin();
    expect((await admin.client.rpc('admin_set_active', { p_user: di.id, p_active: false })).error).toBeNull();
    expect((await mcp(coach.access, 'tools/list')).status).toBe(401);
    await admin.client.rpc('admin_set_active', { p_user: di.id, p_active: true });
  });
});

describe('the first read tools, each person seeing only their own', () => {
  it("get_profile answers \"who am I?\" with the person's own profile", async () => {
    const a = await tool(annCoach.access, 'get_profile');
    expect(a.isError).toBeUndefined();
    expect(a.structuredContent).toMatchObject({ display_name: 'Ann', goals: 'Ann goals', totals_unit: 'lb', default_gym: { name: 'Ann home' } });
    expect(a.structuredContent.intake).toMatchObject({ coach_style: 'challenging', progression_pace: 'steady' });
    const b = await tool(boCoach.access, 'get_profile');
    expect(b.structuredContent).toMatchObject({ display_name: 'Bo', goals: 'Bo goals', default_gym: { name: 'Bo club' } });
  });

  it("list_gyms gives each person's own gyms, without archived ones", async () => {
    const a = await tool(annCoach.access, 'list_gyms');
    expect((a.structuredContent.gyms as Array<{ name: string }>).map((g) => g.name)).toEqual(['Ann home']);
    expect(a.structuredContent.next).toBeNull();
    const b = await tool(boCoach.access, 'list_gyms');
    expect((b.structuredContent.gyms as Array<{ name: string }>).map((g) => g.name)).toEqual(['Bo club']);
  });

  it('get_vocabulary gives the starter vocabulary copied at registration', async () => {
    const v = await tool(annCoach.access, 'get_vocabulary');
    const groups = v.structuredContent.muscle_groups as Array<{ name: string; focus: string[] }>;
    expect(groups.length).toBeGreaterThan(3);
    expect((v.structuredContent.equipment as string[]).length).toBeGreaterThan(3);
  });

  it('no tool takes a user id: asking for someone else is invalid_input', async () => {
    const r = await tool(annCoach.access, 'get_profile', { user_id: bo.id });
    expect(r.isError).toBe(true);
    expect((r.structuredContent.error as { code: string }).code).toBe('invalid_input');
  });
});

describe('the call log and too many requests', () => {
  it('each tool call is logged for its own person, with the coach app and whether it worked, and no content', async () => {
    const ed = await registerAccount('Ed');
    const coach = await connectCoach(ed.client);
    await tool(coach.access, 'get_profile');
    await tool(coach.access, 'list_gyms', { next: 'bad' });
    const rows = await sql<{ client_name: string; tool: string; ok: boolean }>(
      `select client_name, tool, ok from public.connector_calls where user_id = $1 order by called_at`, [ed.id]);
    expect(rows).toEqual([
      { client_name: 'Test coach', tool: 'get_profile', ok: true },
      { client_name: 'Test coach', tool: 'list_gyms', ok: false },
    ]);
  });

  it("my_coach_app answers a coach with its own app's name, and the app's own sign-in with nothing", async () => {
    const caller = await callerFor(annCoach.access);
    expect((await caller.db.rpc('my_coach_app')).data).toBe('Test coach');
    expect((await ann.client.rpc('my_coach_app')).data).toBeNull();
  });

  it('after 60 calls in a minute the next is refused with when to try again, and is not logged', async () => {
    const fay = await registerAccount('Fay');
    const coach = await connectCoach(fay.client);
    await sql(`insert into public.connector_calls (user_id, client_name, tool, ok, called_at)
               select $1, 'Test coach', 'get_profile', true, now() - (g * interval '200 milliseconds') from generate_series(1, 60) g`, [fay.id]);
    const r = await tool(coach.access, 'get_profile');
    expect(r.isError).toBe(true);
    expect(r.structuredContent.error).toMatchObject({ code: 'too_many_requests' });
    const [{ count }] = await sql<{ count: string }>(`select count(*) from public.connector_calls where user_id = $1`, [fay.id]);
    expect(Number(count)).toBe(60);
    // Another person is not held back.
    expect((await tool(annCoach.access, 'get_profile')).isError).toBeUndefined();
  });
});

describe('the one-minute repeat guard', () => {
  const draft = (line: string) => ({
    source: 'Test coach', kind: 'exercise' as const, applies_to: 'library' as const,
    summary_lines: [line], payload: { note: line },
  });

  it('a call repeated word for word within a minute returns the first proposal and adds nothing', async () => {
    const caller = await callerFor(annCoach.access);
    const first = await addProposal(caller, 'propose_exercise', { name: 'Cable Fly' }, draft('Add Cable Fly'));
    const again = await addProposal(caller, 'propose_exercise', { name: 'Cable Fly' }, draft('Add Cable Fly'));
    expect(first.repeat).toBe(false);
    expect(first.status).toBe('pending');
    expect(again).toEqual({ ...first, repeat: true });
    const [{ count }] = await sql<{ count: string }>(`select count(*) from public.proposals where user_id = $1 and request_hash is not null`, [ann.id]);
    expect(Number(count)).toBe(1);

    const other = await addProposal(caller, 'propose_exercise', { name: 'Pec Deck' }, draft('Add Pec Deck'));
    expect(other.proposal_id).not.toBe(first.proposal_id);
  });

  it('after a minute the same call makes a new proposal', async () => {
    const caller = await callerFor(annCoach.access);
    const first = await addProposal(caller, 'propose_exercise', { name: 'Hip Thrust' }, draft('Add Hip Thrust'));
    await sql(`update public.proposals set created_at = now() - interval '61 seconds' where id = $1`, [first.proposal_id]);
    const later = await addProposal(caller, 'propose_exercise', { name: 'Hip Thrust' }, draft('Add Hip Thrust'));
    expect(later.repeat).toBe(false);
    expect(later.proposal_id).not.toBe(first.proposal_id);
  });

  it("another person's identical call is never taken for a repeat", async () => {
    const annCaller = await callerFor(annCoach.access);
    const boCaller = await callerFor(boCoach.access);
    const a = await addProposal(annCaller, 'propose_exercise', { name: 'Shrug' }, draft('Add Shrug'));
    const b = await addProposal(boCaller, 'propose_exercise', { name: 'Shrug' }, draft('Add Shrug'));
    expect(b.repeat).toBe(false);
    expect(b.proposal_id).not.toBe(a.proposal_id);
    const [row] = await sql<{ user_id: string }>(`select user_id from public.proposals where id = $1`, [b.proposal_id]);
    expect(row.user_id).toBe(bo.id);
  });
});
