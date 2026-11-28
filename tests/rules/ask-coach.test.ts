import { describe, expect, it } from 'vitest';
import { COACH_MESSAGES, LAST_WEEK_MESSAGE, swapMessage } from '@/rules/ask-coach';

// Ask my coach (27 Nov): ready messages the user pastes into their own coach chat.
describe('Ask my coach messages', () => {
  it('has the four ready messages on the Coach screen, in order', () => {
    expect(COACH_MESSAGES.map((m) => m.label)).toEqual([
      'Weekly check-in',
      "Something's taken at the gym, change today's workout",
      'Plan my next campaign',
      'How did my last workout go?',
    ]);
    for (const m of COACH_MESSAGES) expect(m.text.trim().length).toBeGreaterThan(10);
  });
  it("uses Nate's wording for the last-week note and names the exercise in a swap", () => {
    expect(LAST_WEEK_MESSAGE).toBe('My campaign ends this week. Ask me how it went, then propose the next one.');
    expect(swapMessage('Barbell Bench Press')).toContain('Barbell Bench Press');
  });
});
