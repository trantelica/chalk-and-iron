import { describe, expect, it } from 'vitest';
import { CHECK_SETUP_REPLY, COACH_INSTRUCTIONS_VERSION, GUIDE_EXAMPLES, GUIDE_GROUPS } from '@/lib/coach-guide';
import { COACH_INSTRUCTIONS } from '@/lib/coach-instructions';

describe('the guide to what you can ask your coach', () => {
  it('has the five groups, each ending with a line on what happens next', () => {
    expect(GUIDE_GROUPS.map((g) => g.title)).toEqual(['In the gym', 'Planning', 'Checking in', 'After a decline', 'About you and your gyms']);
    for (const g of GUIDE_GROUPS) { expect(g.examples.length).toBeGreaterThan(0); expect(g.next).toMatch(/[Nn]othing changes until you/); }
  });
  it("includes Nate's examples, with the E6 wording", () => {
    for (const x of ['The bench is taken.', 'I only have 30 minutes today.', 'Build me a new pull workout.', 'Plan my next campaign.', 'Weekly check-in.', 'How did my last workout go?', 'Try again with the push workout I declined yesterday.', 'Add a rower to my gym.']) {
      expect(GUIDE_EXAMPLES).toContain(x);
    }
  });
  it('is the same list the coach instructions carry', () => {
    for (const x of GUIDE_EXAMPLES) expect(COACH_INSTRUCTIONS).toContain(x);
  });
});

describe('the coach instructions (client pass rules)', () => {
  it('say what the client pass asked for', () => {
    for (const phrase of ['Never coach from general knowledge', 'Supportive: lead with what went well', 'Challenging: name what I missed plainly', 'Neutral: just the facts', '"go ahead"', 'one card', 'ask two or three short questions', 'how to coach me', 'matches what the card contains']) {
      expect(COACH_INSTRUCTIONS.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
  it('give one fixed reply to "check setup" that names the version', () => {
    expect(CHECK_SETUP_REPLY).toBe(`Chalk and Iron coach ready, instructions version ${COACH_INSTRUCTIONS_VERSION}`);
    expect(COACH_INSTRUCTIONS).toContain(CHECK_SETUP_REPLY);
    expect(COACH_INSTRUCTIONS).toContain('check setup');
  });
});
