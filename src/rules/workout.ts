// The rules of a running workout (spec Sections 2, 3 and 10): time budgets,
// the dial, efficiency, records, the seeded weight, the warm-up switch and
// breaking a superset. Plain arithmetic with no screen and no clock of its own,
// so every acceptance test for these can run directly. Shared by the phone and
// the server.

import type { ExerciseUnit } from './units';

// ---------------------------------------------------------------- clocks

/** A clock is two numbers: seconds banked, and when it last started running. */
export interface Clock {
  banked: number;
  since: number | null; // milliseconds since 1970, empty while stopped
}

export const newClock = (): Clock => ({ banked: 0, since: null });

/** Reading now = banked seconds + (now - the moment it started running). */
export function readClock(c: Clock, now: number): number {
  return c.banked + (c.since === null ? 0 : Math.max(0, (now - c.since) / 1000));
}
export function startClock(c: Clock, now: number): Clock {
  return c.since === null ? { banked: c.banked, since: now } : c;
}
export function pauseClock(c: Clock, now: number): Clock {
  return c.since === null ? c : { banked: readClock(c, now), since: null };
}

// ---------------------------------------------------------------- budgets

/** Time budget of one exercise: sets x work + (sets - 1) x rest. */
export function budgetSingle(sets: number, work: number, rest: number): number {
  if (sets <= 0) return 0;
  return sets * work + (sets - 1) * rest;
}

/**
 * Time budget of a superset: rounds x the sum of each member's work seconds +
 * (rounds - 1) x the first member's rest.
 */
export function budgetSuperset(rounds: number, works: number[], firstRest: number): number {
  if (rounds <= 0) return 0;
  return rounds * works.reduce((a, b) => a + b, 0) + (rounds - 1) * firstRest;
}

// ---------------------------------------------------------------- the dial

export interface Dial {
  /** 0 to 1, how much of the inner circle is filled. */
  fill: number;
  /** True once the budget is used up: the fill is the overage red. */
  red: boolean;
  /** Seconds left (positive) or over (negative). */
  remaining: number;
}

/**
 * The inner fill starts full and drains as the budget is used. At zero it is
 * empty. Past zero it refills in red at the same pace and is full red at double
 * the budget. Beyond double it stays full red and the counter keeps counting.
 */
export function dial(budget: number, elapsed: number, started = true): Dial {
  if (!started || budget <= 0) return { fill: 1, red: false, remaining: budget };
  const remaining = budget - elapsed;
  if (remaining >= 0) return { fill: remaining / budget, red: false, remaining };
  return { fill: Math.min(1, -remaining / budget), red: true, remaining };
}

// ---------------------------------------------------------------- efficiency

export interface EfficiencyPart {
  budget: number; // seconds
  planned: number; // sets planned
  done: number; // sets completed
  actual: number; // seconds on the exercise clock
}

/**
 * Exercise efficiency = time allocated for the sets completed / time actually
 * spent. Allocated time = budget x done / planned. A workout's efficiency sums
 * both across every started exercise. Null (shown "n/a") until one has started.
 */
export function efficiency(parts: EfficiencyPart[]): number | null {
  let allocated = 0;
  let actual = 0;
  let any = false;
  for (const p of parts) {
    if (p.planned <= 0) continue;
    any = true;
    allocated += (p.budget * Math.min(p.done, p.planned)) / p.planned;
    actual += p.actual;
  }
  if (!any || actual <= 0) return null;
  return Math.round((allocated / actual) * 100);
}

// ---------------------------------------------------------------- sets

export type SetType = 'warm_up' | 'working' | 'drop';
export type RecordType = 'heaviest' | '6_plus' | '10_plus' | '20_plus' | 'most_reps';

export interface SetFacts {
  id: string;
  /** Pounds (or pounds of assistance). Null for a bodyweight set. */
  lb: number | null;
  reps: number;
  type: SetType;
  /** Training day, 2026-11-17. Sorting by (day, order) gives "earlier". */
  day: string;
  order: number;
}

export interface ExerciseKind {
  unit: ExerciseUnit;
  assisted: boolean;
  loadCount: number;
}

const THRESHOLDS: { type: RecordType; reps: number }[] = [
  { type: 'heaviest', reps: 1 },
  { type: '6_plus', reps: 6 },
  { type: '10_plus', reps: 10 },
  { type: '20_plus', reps: 20 },
];

export const RECORD_LABEL: Record<RecordType, string> = {
  heaviest: 'Heaviest set',
  '6_plus': '6+ rep record',
  '10_plus': '10+ rep record',
  '20_plus': '20+ rep record',
  most_reps: 'Most reps',
};

const counts = (s: SetFacts) => s.type !== 'warm_up'; // warm-ups never count (spec decision 7)

/** True when `a` beats `b` for this kind of exercise (less assistance wins). */
const beats = (kind: ExerciseKind, a: number, b: number) => (kind.assisted ? a < b : a > b);

/** Which record types a new set earns, checked against the sets before it. */
export function recordsEarned(prior: SetFacts[], next: SetFacts, kind: ExerciseKind): RecordType[] {
  if (!counts(next)) return [];
  // No record is awarded in an exercise's first-ever session.
  if (!prior.some((s) => s.day !== next.day)) return [];
  const before = prior.filter(counts);
  if (kind.unit === 'bw') {
    const best = Math.max(0, ...before.map((s) => s.reps));
    return next.reps > best ? ['most_reps'] : [];
  }
  if (next.lb === null || next.lb <= 0) return [];
  const earned: RecordType[] = [];
  for (const t of THRESHOLDS) {
    if (next.reps < t.reps) continue;
    const eligible = before.filter((s) => s.reps >= t.reps && s.lb !== null).map((s) => s.lb as number);
    if (eligible.length === 0 || eligible.every((w) => beats(kind, next.lb as number, w))) earned.push(t.type);
  }
  return earned;
}

/** The celebration names the highest rep threshold beaten. */
export function celebrationName(earned: RecordType[]): RecordType | null {
  for (const t of ['20_plus', '10_plus', '6_plus', 'heaviest', 'most_reps'] as RecordType[]) {
    if (earned.includes(t)) return t;
  }
  return null;
}

export interface RecordEntry {
  lb: number | null;
  reps: number;
  day: string;
  setId: string;
}

/**
 * The current records, worked out from every set. A tie moves the record to the
 * most recent set, so weight, reps and date always come from one set.
 */
export function currentRecords(sets: SetFacts[], kind: ExerciseKind): Partial<Record<RecordType, RecordEntry>> {
  const ordered = sets.filter(counts).sort((a, b) => (a.day === b.day ? a.order - b.order : a.day < b.day ? -1 : 1));
  const out: Partial<Record<RecordType, RecordEntry>> = {};
  if (kind.unit === 'bw') {
    for (const s of ordered) {
      const cur = out.most_reps;
      if (!cur || s.reps >= cur.reps) out.most_reps = { lb: null, reps: s.reps, day: s.day, setId: s.id };
    }
    return out;
  }
  for (const t of THRESHOLDS) {
    for (const s of ordered) {
      if (s.lb === null || s.reps < t.reps) continue;
      const cur = out[t.type];
      if (!cur || !beats(kind, cur.lb as number, s.lb)) out[t.type] = { lb: s.lb, reps: s.reps, day: s.day, setId: s.id };
    }
  }
  return out;
}

/**
 * Volume = weight x reps x load count, over working and drop sets. A bodyweight
 * or assisted exercise counts total reps, kept apart from pounds totals.
 */
export function setVolume(s: SetFacts, kind: ExerciseKind): number {
  if (!counts(s)) return 0;
  if (kind.unit === 'bw' || kind.assisted || s.lb === null) return s.reps;
  return s.lb * s.reps * kind.loadCount;
}

/** Estimated one-rep max: weight x (1 + reps / 30), best over working and drop sets. None when assisted or bodyweight. */
export function estimatedOneRepMax(sets: SetFacts[], kind: ExerciseKind): number | null {
  if (kind.assisted || kind.unit === 'bw') return null;
  let best: number | null = null;
  for (const s of sets) {
    if (!counts(s) || s.lb === null) continue;
    const e = s.lb * (1 + s.reps / 30);
    if (best === null || e > best) best = e;
  }
  return best;
}

// ---------------------------------------------------------------- seeded weight

/**
 * When the plan sets no weight, set N is pre-filled with set N from the last
 * session of this exercise; with no such set, that session's heaviest (least
 * assistance for an assisted machine). The first time, the box is empty.
 */
export function seedWeights(lastSession: (number | null)[], setCount: number, assisted = false): (number | null)[] {
  const real = lastSession.filter((w): w is number => w !== null);
  if (real.length === 0) return Array.from({ length: setCount }, () => null);
  const fallback = assisted ? Math.min(...real) : Math.max(...real);
  return Array.from({ length: setCount }, (_, n) => lastSession[n] ?? fallback);
}

// ---------------------------------------------------------------- warm-up switch

/**
 * Switching a set to a warm-up adds a working set after the others, so the
 * number of working sets stays as planned. In a superset the same round
 * switches for every member (`members` holds each member's types, all the same
 * length). Switching back removes the added set if it has not been logged.
 * `loggedCounts` says how many sets each member has logged.
 * Returns new type lists, or null if nothing can change.
 */
export function toggleWarmup(
  members: SetType[][],
  loggedCounts: number[],
  round: number,
): SetType[][] | null {
  const len = members[0].length;
  if (round < 0 || round >= len) return null;
  const toWarm = members[0][round] !== 'warm_up';
  if (toWarm) {
    return members.map((t) => {
      const next = t.slice();
      next[round] = 'warm_up';
      next.push('working');
      return next;
    });
  }
  // Back to working: drop the added last set only if nobody has logged it.
  const lastIdx = len - 1;
  const canRemove = lastIdx > round && members.every((t, i) => t[lastIdx] === 'working' && loggedCounts[i] <= lastIdx);
  return members.map((t) => {
    const next = t.slice();
    next[round] = 'working';
    if (canRemove) next.pop();
    return next;
  });
}

// ---------------------------------------------------------------- breaking a superset

export interface BreakMember {
  sets: number; // sets planned (length of its types)
  logged: number; // sets logged before the break
  work: number;
  rest: number; // that member's own rest
}

/**
 * Breaking a superset (decided 17 Nov, question 41): each member gets its own
 * block, budgeted by the one-exercise formula for the sets it has left and its
 * own rest.
 */
export function budgetsAfterBreak(members: BreakMember[]): number[] {
  return members.map((m) => budgetSingle(Math.max(0, m.sets - m.logged), m.work, m.rest));
}

// ---------------------------------------------------------------- text

export function mmss(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
