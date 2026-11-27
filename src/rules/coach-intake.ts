// The coach intake (spec Section 4, "Coach intake"): the choices, how the
// ranked priorities are built and checked (the same rules the database holds),
// and the coach link check. Pure rules, used by Coach setup and Profile and gyms.

export type Choice = readonly [value: string, label: string];

export const COACH_STYLES: Choice[] = [['supportive', 'Supportive'], ['challenging', 'Challenging'], ['neutral', 'Neutral']];
export const EXPERIENCE: Choice[] = [
  ['new', 'New to lifting'], ['returning', 'Returning after a break'], ['intermediate', 'Intermediate'], ['experienced', 'Experienced'], ['all_in', 'All in'],
];
export const PRIORITY_CHOICES: Choice[] = [
  ['strength', 'Build strength'], ['muscle', 'Build muscle'], ['fat_loss', 'Lose fat'], ['general_fitness', 'General fitness'],
  ['endurance', 'Endurance'], ['mobility', 'Mobility and joint health'], ['sport', 'Sport performance'], ['habit', 'Build the habit'], ['other', 'Other (write it in)'],
];
export const PACES: Choice[] = [['steady', 'Steady'], ['moderate', 'Moderate'], ['aggressive', 'Aggressive']];
export const VARIETY: Choice[] = [['familiar', 'Keep it familiar'], ['some', 'Some variety'], ['lots', 'Lots of variety']];

export const PRIORITY_SLOTS = 3;
export const OTHER_MAX = 100;
export const FREE_TEXT_MAX = 2000;
export const MINUTES_RANGE = [10, 240] as const;
export const DAYS_RANGE = [1, 7] as const;

export type Priority = { value: string; text?: string };
export type PrioritySlot = { value: string; text: string };

/** The three boxes on screen, filled from what is stored (empty boxes at the end). */
export function slotsFromPriorities(list: unknown): PrioritySlot[] {
  const have = (Array.isArray(list) ? list : []).slice(0, PRIORITY_SLOTS).map((p) => {
    const o = (p ?? {}) as Priority;
    return { value: String(o.value ?? ''), text: typeof o.text === 'string' ? o.text : '' };
  });
  while (have.length < PRIORITY_SLOTS) have.push({ value: '', text: '' });
  return have;
}

/**
 * The stored list from the three boxes. Empty boxes are dropped (so a gap
 * closes up and rank order is kept). A value may appear once, except "other"
 * with different wording; a written-in one needs words, up to 100 characters.
 */
export function buildPriorities(slots: PrioritySlot[]): { ok: true; list: Priority[] } | { ok: false; error: string } {
  const list: Priority[] = [];
  const seen = new Set<string>();
  for (const s of slots) {
    if (!s.value) continue;
    const known = PRIORITY_CHOICES.some(([v]) => v === s.value);
    if (!known) return { ok: false, error: 'That priority is not one of the choices.' };
    if (s.value === 'other') {
      const text = s.text.trim();
      if (!text) return { ok: false, error: 'Write in your own priority, or pick one from the list.' };
      if (text.length > OTHER_MAX) return { ok: false, error: `A written-in priority is at most ${OTHER_MAX} characters.` };
      const key = 'other:' + text.toLowerCase();
      if (seen.has(key)) return { ok: false, error: `"${text}" is already one of your priorities.` };
      seen.add(key);
      list.push({ value: 'other', text });
    } else {
      if (seen.has(s.value)) return { ok: false, error: 'Each priority can be chosen once.' };
      seen.add(s.value);
      list.push({ value: s.value });
    }
  }
  return { ok: true, list };
}

export function labelOf(choices: Choice[], value: unknown): string {
  return choices.find(([v]) => v === value)?.[1] ?? '';
}

export function priorityLabel(p: Priority): string {
  return p.value === 'other' ? (p.text ?? '').trim() || 'Other' : labelOf(PRIORITY_CHOICES, p.value) || p.value;
}

export type Intake = {
  coach_style: string | null; experience: string | null; priorities: unknown; progression_pace: string | null;
  workout_minutes: number | null; days_per_week: number | null; variety: string | null;
  goals: string; injuries_and_limits: string; weekly_schedule: string;
  exercises_liked: string; exercises_to_avoid: string; how_to_coach_me: string;
};

/** How much of the intake is filled in, in the order Coach setup asks (every field may stay empty). */
export function intakeProgress(i: Partial<Intake> | null): { answered: number; total: number } {
  const x = i ?? {};
  const checks = [
    !!x.coach_style, !!x.experience, Array.isArray(x.priorities) && x.priorities.length > 0, !!x.progression_pace,
    x.workout_minutes != null, x.days_per_week != null, !!x.variety,
    !!x.goals?.trim(), !!x.injuries_and_limits?.trim(), !!x.exercises_liked?.trim(), !!x.exercises_to_avoid?.trim(), !!x.how_to_coach_me?.trim(),
  ];
  return { answered: checks.filter(Boolean).length, total: checks.length };
}

/**
 * The coach link the Coach button opens. Only a web address (https) is kept:
 * the phone opens it as a link, so nothing else may be stored. Empty clears it.
 */
export function checkCoachLink(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: true, value: null };
  if (t.length > 500) return { ok: false, error: 'That link is too long.' };
  let u: URL;
  try { u = new URL(t); } catch { return { ok: false, error: 'That is not a web address. Paste the link of your coach project, starting with https://' }; }
  if (u.protocol !== 'https:') return { ok: false, error: 'The link must start with https://' };
  return { ok: true, value: u.toString() };
}

/** The link as the phone may use it: a stored value is shown as a link only if it is https. */
export function safeCoachLink(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const r = checkCoachLink(stored);
  return r.ok ? r.value : null;
}

/** "just now", "5 minutes ago", "3 days ago": for the call log lines. */
export function agoText(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** The connection test passes when a coach's call that worked arrived after the test began (a little slack for clocks that differ). */
export const TEST_SLACK_MS = 15000;
export function testPassed(calls: { ok: boolean; called_at: string }[], startedAt: number): boolean {
  return calls.some((c) => c.ok && Date.parse(c.called_at) >= startedAt - TEST_SLACK_MS);
}
