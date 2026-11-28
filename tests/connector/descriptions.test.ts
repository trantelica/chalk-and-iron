// Code check (spec Section 8, Coach): every tool's description carries the
// rules of the coach behaviour brief assigned to it, and so do the
// connector's own instructions (design Section 3, "What the connector tells
// the coach"). Stage 4E adds the propose tools and their items.
import { describe, expect, it } from 'vitest';
import { BLOCK_BRIEF, BRIEF_RULES, GUIDE_BRIEF, INSTRUCTIONS, INSTRUCTIONS_BRIEF, TOOL_TEXT } from '@/server/connector/descriptions';
import { allGuides, countWords, findGuide } from '@/server/connector/guides';
import { COACH_INSTRUCTIONS, COACH_INSTRUCTIONS_WORD_LIMIT } from '@/lib/coach-instructions';
import { GUIDE_GROUPS } from '@/lib/coach-guide';
import { TOOLS } from '@/server/connector/tools';

describe('what the connector tells the coach', () => {
  it('the instructions carry every brief item assigned to them', () => {
    for (const item of INSTRUCTIONS_BRIEF) expect(INSTRUCTIONS.toLowerCase(), `brief ${item.brief}: "${item.phrase}"`).toContain(item.phrase.toLowerCase());
  });

  it('every tool has its text, and every text a tool', () => {
    expect(Object.keys(TOOL_TEXT).sort()).toEqual(TOOLS.map((t) => t.name).sort());
    for (const [name, t] of Object.entries(TOOL_TEXT)) expect(t.name).toBe(name);
  });

  it('every tool description carries every brief item assigned to it', () => {
    for (const t of Object.values(TOOL_TEXT)) {
      expect(t.brief.length, `${t.name} has no brief items`).toBeGreaterThan(0);
      for (const item of t.brief) expect(t.description.toLowerCase(), `${t.name}, brief ${item.brief}: "${item.phrase}"`).toContain(item.phrase.toLowerCase());
    }
  });

  it('every brief item is one of the eight', () => {
    for (const item of [...INSTRUCTIONS_BRIEF, ...Object.values(TOOL_TEXT).flatMap((t) => t.brief)]) {
      expect(item.brief).toBeGreaterThanOrEqual(1);
      expect(item.brief).toBeLessThanOrEqual(8);
    }
  });
});

// Coach guides (28 Nov 2026, design Section 3, "Coach guides"): a brief rule
// may live in a guide or in the pasted block as well as in a description, and
// every rule must still have a home; every guide named anywhere exists; the
// block and each guide stay within their word limits.

const TOOL_NAMES = TOOLS.map((t) => t.name);
const named = (text: string) => [...text.matchAll(/get_guide\('([^']+)'\)/g)].map((m) => m[1]);

describe('the coach guides and the brief', () => {
  it('every guide a description, the instructions or the block names exists', () => {
    const texts = [INSTRUCTIONS, COACH_INSTRUCTIONS, ...Object.values(TOOL_TEXT).map((t) => t.description), ...allGuides().map((g) => g.text)];
    for (const topic of texts.flatMap(named)) expect(findGuide(topic), `get_guide('${topic}')`).toBeDefined();
    for (const topic of GUIDE_GROUPS.flatMap((g) => g.coachGuides)) expect(findGuide(topic), topic).toBeDefined();
    // Topics written in backticks in the block or a guide are tools or guides, nothing else.
    for (const text of [COACH_INSTRUCTIONS, ...allGuides().map((g) => g.text)]) {
      for (const m of text.matchAll(/`([a-z]+_[a-z_]+)`/g)) {
        const word = m[1];
        if (/^(get|list|propose)_/.test(word)) expect(TOOL_NAMES, word).toContain(word);
        else if (!['add_equipment', 'remove_equipment', 'new_exercises', 'campaign_id', 'week_of', 'intake_unanswered', 'ad_hoc'].includes(word)) expect(findGuide(word), word).toBeDefined();
      }
    }
  });

  it('each propose tool, the weekly summary and the decline tools name their guide', () => {
    const want: Record<string, string> = {
      propose_campaign: 'campaign_design', propose_workout: 'workout_design', propose_exercise: 'workout_design', propose_today_change: 'today_change',
      propose_profile_update: 'intake', get_weekly_summary: 'weekly_checkin', list_proposals: 'after_decline', get_proposal_status: 'after_decline', get_campaign: 'ontology',
    };
    for (const [tool, topic] of Object.entries(want)) expect(named(TOOL_TEXT[tool].description), tool).toContain(topic);
    expect(TOOL_TEXT.get_profile.description).toContain('call get_guide with no topic for the list');
    expect(INSTRUCTIONS).toContain('call get_guide with its topic first');
    expect(COACH_INSTRUCTIONS).toContain('call `get_guide` with its topic first');
    expect(COACH_INSTRUCTIONS).toContain('Call `get_guide` with no topic for the list');
  });

  it('the block stays under 500 words and each guide under 600', () => {
    expect(countWords(COACH_INSTRUCTIONS), `the block has ${countWords(COACH_INSTRUCTIONS)} words`).toBeLessThan(COACH_INSTRUCTIONS_WORD_LIMIT);
    for (const g of allGuides()) expect(countWords(g.text), g.topic).toBeLessThan(600);
  });

  it('each guide and the block carry the brief rules assigned to them', () => {
    for (const [topic, items] of Object.entries(GUIDE_BRIEF)) {
      const g = findGuide(topic);
      expect(g, topic).toBeDefined();
      for (const item of items) expect(g!.text.toLowerCase(), `${topic}, brief ${item.brief}: "${item.phrase}"`).toContain(item.phrase.toLowerCase());
    }
    for (const item of BLOCK_BRIEF) expect(COACH_INSTRUCTIONS.toLowerCase(), `block, brief ${item.brief}: "${item.phrase}"`).toContain(item.phrase.toLowerCase());
  });

  it('every rule of the brief still has a home: the instructions, a description, a guide or the block', () => {
    const homes = [
      ...INSTRUCTIONS_BRIEF.map((i) => ({ ...i, home: 'instructions' })),
      ...Object.values(TOOL_TEXT).flatMap((t) => t.brief.map((i) => ({ ...i, home: t.name }))),
      ...Object.entries(GUIDE_BRIEF).flatMap(([topic, items]) => items.map((i) => ({ ...i, home: `guide ${topic}` }))),
      ...BLOCK_BRIEF.map((i) => ({ ...i, home: 'block' })),
    ];
    for (const rule of BRIEF_RULES) {
      const found = homes.filter((h) => h.brief === rule.brief && h.phrase.toLowerCase().includes(rule.phrase.toLowerCase()));
      expect(found.length, `brief ${rule.brief}: "${rule.phrase}" has no home`).toBeGreaterThan(0);
    }
    for (let n = 1; n <= 8; n++) expect(BRIEF_RULES.some((r) => r.brief === n), `brief item ${n}`).toBe(true);
    for (const item of [...BLOCK_BRIEF, ...Object.values(GUIDE_BRIEF).flat()]) {
      expect(item.brief).toBeGreaterThanOrEqual(1);
      expect(item.brief).toBeLessThanOrEqual(8);
    }
  });

  it('the block names only real tools, and every tool is named by the block, a guide or the connector instructions', () => {
    const inBlock = [...COACH_INSTRUCTIONS.matchAll(/`((?:get|list|propose)_[a-z_]+)`/g)].map((m) => m[1]);
    for (const t of inBlock) expect(TOOL_NAMES, t).toContain(t);
    const everywhere = [COACH_INSTRUCTIONS, INSTRUCTIONS, ...allGuides().map((g) => g.text)].join('\n');
    for (const t of TOOL_NAMES) expect(everywhere, t).toContain(t);
  });
});
