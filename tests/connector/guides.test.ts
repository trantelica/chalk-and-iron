// Coach guides (design Section 3, "Coach guides"; Nate approved the design on
// 28 Nov 2026): the guide files load the way the server reads them, get_guide
// answers from them without touching the database, the call log notes the
// topic, and the optional enforcement is off unless switched on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Caller } from '@/server/connector/auth';
import {
  allGuides, countWords, findGuide, GUIDE_BEFORE, GUIDE_DIR_PARTS, GUIDE_WORD_LIMIT, guideDir, guidesRequired, parseGuide, readGuides,
} from '@/server/connector/guides';
import { callTool, type Deps } from '@/server/connector/mcp';
import nextConfig from '../../next.config';

const TOPICS = ['after_decline', 'campaign_design', 'intake', 'ontology', 'today_change', 'weekly_checkin', 'workout_design'];

/** A database that fails the test if anything touches it. */
const noDb = new Proxy({}, { get: (_t, prop) => { throw new Error(`get_guide touched the database (${String(prop)})`); } }) as unknown as SupabaseClient;

function setup(opts: { required?: boolean; read?: boolean | 'fails' } = {}) {
  const caller = {
    userId: 'u-1', clientId: 'client-1', token: 't', claims: { sub: 'u-1', iss: 'x', exp: 0 },
    me: { id: 'u-1', display_name: 'Nate', totals_unit: 'lb', time_zone: 'America/Denver' }, db: noDb,
  } as Caller;
  const logged: Array<{ tool: string; ok: boolean; topic: string | null | undefined }> = [];
  const asked: Array<{ client: string; topic: string; minutes: number }> = [];
  const deps: Deps = {
    authenticate: async () => caller,
    recentCallTimes: async () => [],
    logCall: async (_c, _n, tool, ok, topic) => { logged.push({ tool, ok, topic }); },
    clientName: async () => 'ChatGPT',
    guidesRequired: () => opts.required ?? false,
    guideReadRecently: async (_c, client, topic, minutes) => {
      asked.push({ client, topic, minutes });
      if (opts.read === 'fails') throw new Error('log unreadable');
      return opts.read ?? false;
    },
  };
  return { caller, deps, logged, asked };
}

const out = (r: { structuredContent?: Record<string, unknown> }) => r.structuredContent as Record<string, unknown>;

describe('the guide files', () => {
  it('load from the project folder at run time, exactly as the server reads them', () => {
    expect(guideDir()).toBe(join(process.cwd(), ...GUIDE_DIR_PARTS));
    expect(allGuides().map((g) => g.topic)).toEqual(TOPICS);
    expect(readGuides(guideDir())).toEqual(allGuides());
  });

  it('each has a version, a line on when to read it, and stays under its word limit', () => {
    for (const g of allGuides()) {
      expect(g.version, g.topic).toBeGreaterThanOrEqual(1);
      expect(g.when.length, g.topic).toBeGreaterThan(10);
      expect(countWords(g.text), `${g.topic} has ${countWords(g.text)} words`).toBeLessThan(GUIDE_WORD_LIMIT);
    }
  });

  it('are shipped with the /mcp server on Vercel (next.config.ts lists them)', () => {
    const includes = (nextConfig as { outputFileTracingIncludes?: Record<string, string[]> }).outputFileTracingIncludes ?? {};
    expect(includes['/mcp']).toContain('./' + GUIDE_DIR_PARTS.join('/') + '/*.md');
    // And the build step that checks the trace runs on GitHub after the build.
    expect(readFileSync('.github/workflows/test.yml', 'utf8')).toContain('node scripts/check-guides-traced.mjs');
  });

  it('refuses a file without its header, a topic that is not its file name, or no version', () => {
    expect(() => parseGuide('a.md', '# no header')).toThrow(/header/);
    expect(() => parseGuide('a.md', '---\ntopic: b\nversion: 1\nwhen: x\n---\ntext')).toThrow(/named b\.md/);
    expect(() => parseGuide('a.md', '---\ntopic: a\nversion: one\nwhen: x\n---\ntext')).toThrow(/version/);
    expect(parseGuide('a.md', '---\ntopic: a\nversion: 2\nwhen: Now.\n---\n\n# A\n')).toEqual({ topic: 'a', version: 2, when: 'Now.', text: '# A' });
  });

  it('the enforcement names only guides that exist', () => {
    for (const topic of Object.values(GUIDE_BEFORE)) expect(findGuide(topic), topic).toBeDefined();
  });
});

describe('get_guide', () => {
  it('with no topic returns the index: topic, when to read it, version; and logs no topic', async () => {
    const { caller, deps, logged } = setup();
    const r = await callTool(deps, caller, 'get_guide', {});
    expect(r.isError).toBeUndefined();
    const guides = out(r).guides as Array<{ topic: string; when: string; version: number }>;
    expect(guides.map((g) => g.topic)).toEqual(TOPICS);
    for (const g of guides) expect(Object.keys(g).sort()).toEqual(['topic', 'version', 'when']);
    expect(logged).toEqual([{ tool: 'get_guide', ok: true, topic: null }]);
  });

  it('with a topic returns that guide, its version and a line to follow it; the log notes the topic', async () => {
    const { caller, deps, logged } = setup();
    const r = await callTool(deps, caller, 'get_guide', { topic: 'campaign_design' });
    const o = out(r);
    expect(o.topic).toBe('campaign_design');
    expect(o.version).toBe(findGuide('campaign_design')!.version);
    expect(String(o.guide)).toContain('# Designing a campaign');
    expect(String(o.follow)).toMatch(/Follow this guide/);
    expect(logged).toEqual([{ tool: 'get_guide', ok: true, topic: 'campaign_design' }]);
  });

  it('an unknown topic is not_found with the list, and its text is never logged', async () => {
    const { caller, deps, logged } = setup();
    const r = await callTool(deps, caller, 'get_guide', { topic: 'my secret plan' });
    expect(r.isError).toBe(true);
    expect(out(r).error).toMatchObject({ code: 'not_found', guides: TOPICS });
    expect(r.content[0].text).toMatch(/The guides are: after_decline, campaign_design/);
    expect(logged).toEqual([{ tool: 'get_guide', ok: false, topic: null }]);
  });

  it('takes nothing but a topic', async () => {
    const { caller, deps } = setup();
    const r = await callTool(deps, caller, 'get_guide', { topic: 'intake', user_id: 'someone' });
    expect(out(r).error).toMatchObject({ code: 'invalid_input' });
  });
});

describe('the optional enforcement', () => {
  it('is off unless the setting COACH_GUIDES_REQUIRED is "on"', () => {
    expect(guidesRequired({})).toBe(false);
    expect(guidesRequired({ COACH_GUIDES_REQUIRED: 'off' })).toBe(false);
    expect(guidesRequired({ COACH_GUIDES_REQUIRED: 'yes' })).toBe(false);
    expect(guidesRequired({ COACH_GUIDES_REQUIRED: ' On ' })).toBe(true);
  });

  it('off: a campaign card goes on to its own checks without asking about guides', async () => {
    const { caller, deps, asked } = setup({ required: false });
    const r = await callTool(deps, caller, 'propose_campaign', {});
    expect(out(r).error).toMatchObject({ code: 'invalid_input' });
    expect(asked).toEqual([]);
  });

  it('on, guide not read: the card is refused with a plain line, and the call is logged as not working', async () => {
    const { caller, deps, logged, asked } = setup({ required: true, read: false });
    const r = await callTool(deps, caller, 'propose_campaign', {});
    expect(out(r).error).toMatchObject({ code: 'guide_not_read', guide: 'campaign_design' });
    expect(r.content[0].text).toMatch(/^Read get_guide\('campaign_design'\) first, then send the card again\./);
    expect(asked).toEqual([{ client: 'ChatGPT', topic: 'campaign_design', minutes: 30 }]);
    expect(logged).toEqual([{ tool: 'propose_campaign', ok: false, topic: null }]);
    const w = await callTool(deps, caller, 'propose_workout', {});
    expect(out(w).error).toMatchObject({ code: 'guide_not_read', guide: 'workout_design' });
  });

  it('on, guide read in the last 30 minutes: the card goes on to its own checks', async () => {
    const { caller, deps } = setup({ required: true, read: true });
    const r = await callTool(deps, caller, 'propose_campaign', {});
    expect(out(r).error).toMatchObject({ code: 'invalid_input' });
  });

  it('on: other tools are never held back, and an unreadable call log lets the card through', async () => {
    const { caller, deps, asked } = setup({ required: true, read: false });
    expect(out(await callTool(deps, caller, 'propose_today_change', {})).error).not.toMatchObject({ code: 'guide_not_read' });
    expect(asked).toEqual([]);
    const f = setup({ required: true, read: 'fails' });
    expect(out(await callTool(f.deps, f.caller, 'propose_campaign', {})).error).toMatchObject({ code: 'invalid_input' });
  });
});
