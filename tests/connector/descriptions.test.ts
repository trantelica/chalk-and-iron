// Code check (spec Section 8, Coach): every tool's description carries the
// rules of the coach behaviour brief assigned to it, and so do the
// connector's own instructions (design Section 3, "What the connector tells
// the coach"). Stage 4E adds the propose tools and their items.
import { describe, expect, it } from 'vitest';
import { INSTRUCTIONS, INSTRUCTIONS_BRIEF, TOOL_TEXT } from '@/server/connector/descriptions';
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
