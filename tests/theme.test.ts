// Theme tokens (spec Section 6, design Section 8).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
// @ts-expect-error plain JavaScript build script
import { buildCss, loadTokens, TOKEN_NAMES, EXTRA_NAMES } from '../scripts/build-tokens.mjs';

const root = join(import.meta.dirname, '..');

describe('theme tokens', () => {
  const { skins, accents } = loadTokens();

  it('every skin defines the same nineteen tokens and three extras', () => {
    expect(TOKEN_NAMES).toHaveLength(19);
    expect(skins.map((s: { id: string }) => s.id).sort()).toEqual(['arcade', 'chalk', 'liquid']);
    for (const s of skins) {
      expect(Object.keys(s.tokens).sort()).toEqual([...TOKEN_NAMES].sort());
      expect(Object.keys(s.extras).sort()).toEqual([...EXTRA_NAMES].sort());
    }
  });

  it('the Chalk and Iron skin is the default, with Anton, Inter, square corners and capitals', () => {
    const css = buildCss();
    const root = css.slice(css.indexOf(':root, [data-skin="chalk"]'));
    expect(root).toMatch(/--display-font: 'Anton'/);
    expect(root).toMatch(/--body-font: 'Inter'/);
    expect(root).toMatch(/--radius: 0px/);
    expect(root).toMatch(/--display-case: uppercase/);
    expect(root).toMatch(/--accent: #ff5a26/);
  });

  it('has the seven accents from the spec, with near-black text on each', () => {
    expect(accents.accents.map((a: { id: string; value: string }) => [a.id, a.value])).toEqual([
      ['ember', '#ff5a26'], ['purple', '#a855f7'], ['pink', '#ff4fa3'], ['crimson', '#ff2d55'],
      ['blue', '#2d7dff'], ['yellow', '#ffd60a'], ['green', '#39e75f']]);
    expect(accents['on-accent']).toBe('#0d0d0d');
  });

  it('a skin sets only token values, never a position or size property', () => {
    const css = buildCss();
    expect(css).not.toMatch(/\b(width|height|margin|padding|top|left|right|bottom|position|display|flex|grid)\s*:/);
  });

  it('the checked-in style sheet uses tokens for every color and font', () => {
    const globals = readFileSync(join(root, 'src', 'styles', 'globals.css'), 'utf8');
    expect(globals).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(globals).not.toMatch(/font-family:(?!\s*var\()/);
  });
});
