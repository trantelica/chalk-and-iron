// Coach setup, Profile and gyms (stage 4G): the intake's priorities and coach
// link rules, the gym equipment list rules for a large gym, the connection
// test, and that the instructions on the page are the ones in the docs.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  agoText, buildPriorities, checkCoachLink, intakeProgress, safeCoachLink, slotsFromPriorities, testPassed, PRIORITY_CHOICES,
} from '@/rules/coach-intake';
import { checkEquipment, cleanEquipment, filterEquipment, ITEM_MAX, LIST_MAX, parsePasted, previewAdd, renameEquipment } from '@/rules/gym-equipment';
import { COACH_INSTRUCTIONS } from '@/lib/coach-instructions';

const slot = (value: string, text = '') => ({ value, text });

describe('the ranked priorities', () => {
  it('drops empty boxes and keeps the order', () => {
    expect(buildPriorities([slot(''), slot('strength'), slot('')])).toEqual({ ok: true, list: [{ value: 'strength' }] });
    expect(buildPriorities([slot('muscle'), slot('other', ' Rock climbing '), slot('habit')])).toEqual({
      ok: true, list: [{ value: 'muscle' }, { value: 'other', text: 'Rock climbing' }, { value: 'habit' }],
    });
  });
  it('refuses a repeat, an empty or long written-in one, and a value not in the list', () => {
    expect(buildPriorities([slot('strength'), slot('strength')]).ok).toBe(false);
    expect(buildPriorities([slot('other', '  ')]).ok).toBe(false);
    expect(buildPriorities([slot('other', 'x'.repeat(101))]).ok).toBe(false);
    expect(buildPriorities([slot('flexing')]).ok).toBe(false);
  });
  it('lets "other" repeat with different wording only', () => {
    expect(buildPriorities([slot('other', 'Climbing'), slot('other', 'Running')]).ok).toBe(true);
    expect(buildPriorities([slot('other', 'Climbing'), slot('other', 'climbing')]).ok).toBe(false);
  });
  it('always shows three boxes', () => {
    expect(slotsFromPriorities([])).toHaveLength(3);
    expect(slotsFromPriorities([{ value: 'other', text: 'Swimming' }])[0]).toEqual({ value: 'other', text: 'Swimming' });
    expect(slotsFromPriorities(null)).toHaveLength(3);
  });
  it('offers the eight choices of the spec and Other', () => {
    expect(PRIORITY_CHOICES.map(([v]) => v)).toEqual(['strength', 'muscle', 'fat_loss', 'general_fitness', 'endurance', 'mobility', 'sport', 'habit', 'other']);
  });
});

describe('how much of the intake is answered', () => {
  it('counts what is filled in; every field may stay empty', () => {
    expect(intakeProgress(null)).toEqual({ answered: 0, total: 12 });
    expect(intakeProgress({ coach_style: 'neutral', priorities: [{ value: 'habit' }], workout_minutes: 45, goals: '  ' }).answered).toBe(3);
  });
});

describe('the coach link', () => {
  it('keeps only a web address (https); empty clears it', () => {
    expect(checkCoachLink('  https://chatgpt.com/g/abc/project ')).toEqual({ ok: true, value: 'https://chatgpt.com/g/abc/project' });
    expect(checkCoachLink('  ')).toEqual({ ok: true, value: null });
    expect(checkCoachLink('javascript:alert(1)').ok).toBe(false);
    expect(checkCoachLink('http://example.com').ok).toBe(false);
    expect(checkCoachLink('chatgpt.com/project').ok).toBe(false);
  });
  it('the phone shows a stored link only if it is https', () => {
    expect(safeCoachLink('https://claude.ai/project/1')).toBe('https://claude.ai/project/1');
    expect(safeCoachLink('javascript:alert(1)')).toBeNull();
    expect(safeCoachLink(null)).toBeNull();
  });
});

describe('a large gym\'s equipment list', () => {
  it('removes blanks and repeats (ignoring capitals), keeps A to Z', () => {
    expect(cleanEquipment(['Rower', ' ', 'cable machine', 'Rower', 'ROWER', 'Barbell', 'Leg  press'])).toEqual(['Barbell', 'cable machine', 'Leg press', 'Rower']);
  });
  it('splits a pasted list by lines, commas and bullets', () => {
    expect(parsePasted('- Rower\n2. Leg press, Smith machine;  Lat pulldown\n\n• Hack squat')).toEqual(['Rower', 'Leg press', 'Smith machine', 'Lat pulldown', 'Hack squat']);
  });
  it('says what adding would do before it is added', () => {
    expect(previewAdd(['Rower', 'Barbell'], ['rower', 'Leg press', 'leg PRESS', 'Hack squat'])).toEqual({ fresh: ['Leg press', 'Hack squat'], already: ['rower'] });
  });
  it('filters a long list as you type, and renames one item', () => {
    const list = ['Cable crossover', 'Cable row', 'Leg press', 'Rower'];
    expect(filterEquipment(list, ' CABLE ')).toEqual(['Cable crossover', 'Cable row']);
    expect(filterEquipment(list, '')).toEqual(list);
    expect(renameEquipment(list, 'Rower', 'Concept2 rower')).toEqual(['Cable crossover', 'Cable row', 'Leg press', 'Concept2 rower']);
  });
  it('holds a few hundred items and refuses an item or list that is too long', () => {
    const big = Array.from({ length: 300 }, (_, i) => `Machine ${i + 1}`);
    const ok = checkEquipment(big);
    expect(ok.ok && ok.list.length).toBe(300);
    expect(checkEquipment(['x'.repeat(ITEM_MAX + 1)]).ok).toBe(false);
    expect(checkEquipment(Array.from({ length: LIST_MAX + 1 }, (_, i) => `Item ${i}`)).ok).toBe(false);
  });
});

describe('the connection test', () => {
  const t = Date.parse('2026-11-27T12:00:00Z');
  it('passes when a call that worked arrived after the test began', () => {
    expect(testPassed([{ ok: true, called_at: '2026-11-27T12:00:30Z' }], t)).toBe(true);
    expect(testPassed([{ ok: false, called_at: '2026-11-27T12:00:30Z' }], t)).toBe(false);
    expect(testPassed([{ ok: true, called_at: '2026-11-27T11:50:00Z' }], t)).toBe(false);
    expect(testPassed([], t)).toBe(false);
  });
  it('says how long ago in plain words', () => {
    const now = Date.parse('2026-11-27T12:00:00Z');
    expect(agoText(now - 10_000, now)).toBe('just now');
    expect(agoText(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(agoText(now - 3 * 86_400_000, now)).toBe('3 days ago');
  });
});

describe('the instructions on the Coach setup page', () => {
  it('are the block in docs/COACH_INSTRUCTIONS.md, word for word', () => {
    const doc = readFileSync('docs/COACH_INSTRUCTIONS.md', 'utf8');
    const block = doc.slice(doc.indexOf('\n---\n') + 5).trim();
    expect(COACH_INSTRUCTIONS).toBe(block);
  });
});
