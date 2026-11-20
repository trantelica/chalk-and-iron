// A running workout as plain data, and the moves that change it (spec Sections
// 2, 5 and 10). No screen, no storage and no clock of its own: every move takes
// the current time, so a test can run a whole workout in a blink. The phone
// keeps one of these in its own storage and sends each change to the account
// (src/rules/sync.ts). Every id is a random uuid made on the phone, so the
// same ids name the same rows on the server (design Sections 2 and 6).

import {
  budgetSingle,
  budgetSuperset,
  celebrationName,
  efficiency,
  newClock,
  pauseClock,
  readClock,
  recordsEarned,
  setVolume,
  startClock,
  toggleWarmup,
  type Clock,
  type ExerciseKind,
  type RecordType,
  type SetFacts,
  type SetType,
} from './workout';
import type { ExerciseUnit } from './units';

export interface LoggedSet {
  id: string;
  lb: number | null; // pounds (assistance for an assisted machine); null for bodyweight
  enteredValue: number;
  enteredUnit: 'lb' | 'kg' | 'bw';
  reps: number;
  type: SetType;
  rpe: number | null;
  loggedAt: number;
  records: RecordType[];
}

export interface SessionExercise {
  key: string;
  exerciseId: string;
  name: string;
  muscle: string;
  equipment: string;
  unit: ExerciseUnit;
  assisted: boolean;
  loadCount: number;
  work: number;
  rest: number;
  plannedReps: number;
  plannedWeightLb: number | null; // a plan's own weight wins over the seed
  seeds: (number | null)[]; // seeded pounds, one per set
  types: SetType[]; // one per planned set, including sets already logged
  logs: LoggedSet[];
  skipped: boolean;
  alternates: { tier: 'bodyweight' | 'basic_gym' | 'full_gym'; name: string }[];
  origin?: 'plan' | 'added' | 'swap';
  swappedFrom?: string | null; // the library exercise a swap replaced
}

export interface Block {
  id: string;
  letter: string | null;
  members: string[]; // exercise keys, in order
  clock: Clock;
  started: boolean;
  stopped: boolean;
  baseLogged: number; // sets a broken-out member had logged before the break
  /**
   * Sets each member had logged before it joined this block, when they differ:
   * after a part-way swap in a superset, the new exercise starts at 0 and the
   * others at what they had done. Missing means every member has `baseLogged`.
   */
  bases?: Record<string, number>;
  closed: boolean; // a superset that was broken apart
  fixedBudget: number | null;
  closedDone: number;
  closedPlanned: number;
  brokenFrom: string | null;
  startedAt?: number | null; // when Start exercise was first tapped
  stoppedAt?: number | null; // when its last set was logged, or it was skipped
  brokenAt?: number | null; // when this superset was broken apart
}

export interface Session {
  id: string;
  name: string;
  day: string;
  startedAt: number;
  endedAt: number | null;
  clock: Clock; // the workout clock
  exercises: Record<string, SessionExercise>;
  blocks: Block[];
  curBlock: string;
  curMember: string;
  restEndsAt: number | null;
  restTotal: number;
  breakUndo: Block[] | null; // restored by Undo until a set is logged after the break
  lastActivityAt: number;
  workoutId?: string | null; // the library workout it started from, if any
  finishReason?: 'user' | 'auto' | 'replaced' | null;
  /** The campaign day it was started from, if any (the Home screen's Today panel). */
  campaignDayId?: string | null;
  /** The prepared plan for today it was started from, if any; the account marks it used. */
  todayPlanId?: string | null;
  /** Set while the workout is paused (Nathan, 19 Nov). In the account a paused workout is an active one whose workout clock is stopped. */
  pausedAt?: number | null;
}

/** A session with nothing logged for 30 minutes finishes itself (spec Section 10). */
export const AUTO_FINISH_MS = 30 * 60 * 1000;
/** A finished workout can be reopened for 48 hours (spec Section 10). */
export const REOPEN_MS = 48 * 60 * 60 * 1000;
/** A paused workout finishes itself only after 2 hours paused (Nathan, 19 Nov). */
export const PAUSED_FINISH_MS = 2 * 60 * 60 * 1000;

/** What the phone knows about an exercise's past sessions, newest last. */
export interface PastSession {
  day: string;
  sets: { lb: number | null; reps: number; type: SetType }[];
  sessionId?: string;
  startedAt?: number;
  /** Only record-holding sets from an older session: counted for records, not shown as a session. */
  extra?: boolean;
}
export type History = Record<string, PastSession[]>;

export interface PlanItem {
  exerciseId: string;
  name: string;
  muscle: string;
  equipment: string;
  unit: ExerciseUnit;
  assisted: boolean;
  loadCount: number;
  work: number;
  rest: number;
  sets: number;
  reps: number;
  weightLb?: number | null;
  superset?: string | null;
  alternates: SessionExercise['alternates'];
}

/** A new random id, made on the phone. The prefix is only a reminder of what it names. */
export const uid = (p: string): string => { void p; return crypto.randomUUID(); };

/** Past sessions of an exercise, oldest first, without the extra record-only entries. */
export const realSessions = (h: History, exerciseId: string) => (h[exerciseId] ?? []).filter((p) => !p.extra);

export const kindOf = (e: SessionExercise): ExerciseKind => ({ unit: e.unit, assisted: e.assisted, loadCount: e.loadCount });

// ---------------------------------------------------------------- starting

export function startSession(name: string, day: string, plan: PlanItem[], history: History, now: number, seedOf: (id: string, sets: number, assisted: boolean) => (number | null)[], workoutId: string | null = null): Session {
  const exercises: Record<string, SessionExercise> = {};
  const blocks: Block[] = [];
  const letterBlock = new Map<string, Block>();
  for (const it of plan) {
    const key = uid('x');
    exercises[key] = {
      key, exerciseId: it.exerciseId, name: it.name, muscle: it.muscle, equipment: it.equipment, unit: it.unit,
      assisted: it.assisted, loadCount: it.loadCount, work: it.work, rest: it.rest, plannedReps: it.reps,
      plannedWeightLb: it.unit === 'bw' ? null : it.weightLb ?? null,
      seeds: it.unit === 'bw' ? Array.from({ length: it.sets }, () => null) : seedOf(it.exerciseId, it.sets, it.assisted),
      types: Array.from({ length: it.sets }, () => 'working' as SetType), logs: [], skipped: false, alternates: it.alternates,
      origin: 'plan', swappedFrom: null,
    };
    const existing = it.superset ? letterBlock.get(it.superset) : undefined;
    if (existing) {
      existing.members.push(key);
    } else {
      const b: Block = {
        id: uid('b'), letter: it.superset ?? null, members: [key], clock: newClock(), started: false, stopped: false,
        baseLogged: 0, closed: false, fixedBudget: null, closedDone: 0, closedPlanned: 0, brokenFrom: null, startedAt: null, stoppedAt: null, brokenAt: null,
      };
      blocks.push(b);
      if (it.superset) letterBlock.set(it.superset, b);
    }
  }
  void history;
  return {
    id: uid('s'), name, day, startedAt: now, endedAt: null, clock: startClock(newClock(), now), exercises, blocks,
    curBlock: blocks[0].id, curMember: blocks[0].members[0], restEndsAt: null, restTotal: 0, breakUndo: null, pausedAt: null, lastActivityAt: now,
    workoutId, finishReason: null,
  };
}

// ---------------------------------------------------------------- reading

const clone = <T,>(v: T): T => structuredClone(v);
export const blockOf = (s: Session, id: string) => s.blocks.find((b) => b.id === id)!;
/** The block an exercise is done in now: a broken superset still lists its members, so it is passed over. */
export const blockOfKey = (s: Session, key: string) =>
  s.blocks.find((b) => !b.closed && b.members.includes(key)) ?? s.blocks.find((b) => b.members.includes(key))!;
/** Blocks shown in the workout: not closed, and not an empty skipped husk. */
export const liveBlocks = (s: Session) => s.blocks.filter((b) => !b.closed);

/** Sets a member had logged before it joined this block (a break or a part-way swap). */
export const baseOf = (b: Block, key: string) => b.bases?.[key] ?? b.baseLogged;
/** Rounds a member has done in this block. Members of a superset move together by this count. */
export const roundIn = (s: Session, b: Block, key: string) => s.exercises[key].logs.length - baseOf(b, key);
/** The same round of a superset, in another member's own set list. */
export const pairedIndex = (b: Block, fromKey: string, index: number, toKey: string) => index - baseOf(b, fromKey) + baseOf(b, toKey);
function ensureBases(b: Block): Record<string, number> {
  b.bases ??= Object.fromEntries(b.members.map((k) => [k, b.baseLogged]));
  return b.bases;
}

export const setsOf = (e: SessionExercise, b: Block) => Math.max(0, e.types.length - baseOf(b, e.key));
export const memberDone = (e: SessionExercise) => e.logs.length >= e.types.length;
export const blockDone = (s: Session, b: Block) => b.members.every((k) => memberDone(s.exercises[k]));
export const blockSkipped = (s: Session, b: Block) => b.members.every((k) => s.exercises[k].skipped);

/**
 * Time budget of a block, from its members' current sets. Only a closed block
 * (a superset broken apart, or carried on after a part-way swap) keeps the
 * budget it had; every other block follows its sets, so a warm-up switch or
 * + Set changes it, on this phone and after a resume on another one. A block
 * made by a break gets the one-exercise formula on the sets it has left,
 * which is what the break worked out.
 */
export function blockBudget(s: Session, b: Block): number {
  if (b.closed && b.fixedBudget !== null) return b.fixedBudget;
  const ms = b.members.map((k) => s.exercises[k]);
  if (ms.length === 1) return budgetSingle(setsOf(ms[0], b), ms[0].work, ms[0].rest);
  return budgetSuperset(setsOf(ms[0], b), ms.map((m) => m.work), ms[0].rest);
}

/** Sets logged in a block this far (every member). */
export const blockLogged = (s: Session, b: Block) => b.members.reduce((a, k) => a + roundIn(s, b, k), 0);
export const blockPlanned = (s: Session, b: Block) => b.members.reduce((a, k) => a + setsOf(s.exercises[k], b), 0);

/**
 * Workout efficiency, over every started exercise. A skipped exercise is left
 * out, but one skipped part-way still counts the sets it did, as normal; only
 * the sets left are left out (spec Section 10).
 */
export function efficiencyOf(s: Session, now: number): number | null {
  const parts = s.blocks.filter((b) => b.started && (b.closed || !blockSkipped(s, b) || blockLogged(s, b) > 0)).map((b) => ({
    budget: blockBudget(s, b),
    planned: b.closed ? b.closedPlanned : blockPlanned(s, b),
    done: b.closed ? b.closedDone : blockLogged(s, b),
    actual: readClock(b.clock, now),
  }));
  return efficiency(parts);
}

export function factsFor(e: SessionExercise, day: string): SetFacts[] {
  return e.logs.map((l, i) => ({ id: l.id, lb: l.lb, reps: l.reps, type: l.type, day, order: i }));
}

export function pastFacts(history: History, exerciseId: string): SetFacts[] {
  const out: SetFacts[] = [];
  (history[exerciseId] ?? []).forEach((ps) => ps.sets.forEach((x, i) => out.push({ id: `${ps.day}-${i}`, lb: x.lb, reps: x.reps, type: x.type, day: ps.day, order: i })));
  return out;
}

export function volumeOf(s: Session): { lb: number; bw: number } {
  let lb = 0;
  let bw = 0;
  for (const e of Object.values(s.exercises)) {
    for (const f of factsFor(e, s.day)) {
      const v = setVolume(f, kindOf(e));
      if (e.unit === 'bw' || e.assisted) bw += v; else lb += v;
    }
  }
  return { lb, bw };
}

/** Sets done: every logged set counts, including those of an exercise skipped part-way (spec Section 10). */
export const setsDone = (s: Session) => Object.values(s.exercises).reduce((a, e) => a + e.logs.length, 0);
/** Sets planned: a skipped exercise keeps only the sets it did. */
export const setsPlanned = (s: Session) => liveBlocks(s).reduce((a, b) => a + b.members.reduce((x, k) => {
  const e = s.exercises[k];
  return x + (e.skipped ? Math.min(e.logs.length, e.types.length) : e.types.length);
}, 0), 0);
/** The account accepts at most 24 sets for one exercise. */
export const MAX_SETS = 24;
export const recordsToday = (s: Session) => Object.values(s.exercises).reduce((a, e) => a + e.logs.filter((l) => l.records.length).length, 0);

export function allDone(s: Session): boolean {
  return liveBlocks(s).every((b) => blockSkipped(s, b) || blockDone(s, b));
}

// ---------------------------------------------------------------- moves

/** Moving to another exercise pauses the clock of the one left and resumes the other's. */
export function goTo(s0: Session, blockId: string, now: number, member?: string): Session {
  const s = clone(s0);
  const from = blockOf(s, s.curBlock);
  if (from.id !== blockId) {
    from.clock = pauseClock(from.clock, now);
    const to = blockOf(s, blockId);
    if (to.started && !to.stopped && !isPaused(s)) to.clock = startClock(to.clock, now);
    s.curBlock = blockId;
  }
  const to = blockOf(s, blockId);
  s.curMember = member && to.members.includes(member) ? member : firstOpenMember(s, to);
  s.lastActivityAt = now;
  return s;
}

function firstOpenMember(s: Session, b: Block): string {
  return b.members.find((k) => !memberDone(s.exercises[k])) ?? b.members[0];
}

export function startExercise(s0: Session, now: number): Session {
  const s = clone(s0);
  const b = blockOf(s, s.curBlock);
  b.started = true;
  b.startedAt ??= now;
  b.clock = startClock(b.clock, now);
  s.lastActivityAt = now;
  return s;
}

export interface LogInput { lb: number | null; enteredValue: number; enteredUnit: 'lb' | 'kg' | 'bw'; reps: number }

export function logSet(s0: Session, input: LogInput, history: History, now: number): { session: Session; earned: RecordType[] } {
  const s = clone(s0);
  const b = blockOf(s, s.curBlock);
  const e = s.exercises[s.curMember];
  const round = e.logs.length;
  const type = e.types[round] ?? 'working';
  const facts: SetFacts = { id: uid('l'), lb: input.lb, reps: input.reps, type, day: s.day, order: round };
  const prior = [...pastFacts(history, e.exerciseId), ...factsFor(e, s.day)];
  const earned = recordsEarned(prior, facts, kindOf(e));
  e.logs.push({ id: facts.id, lb: input.lb, enteredValue: input.enteredValue, enteredUnit: input.enteredUnit, reps: input.reps, type, rpe: null, loggedAt: now, records: earned });
  s.breakUndo = null; // a set after a break keeps it for the session
  s.lastActivityAt = now;

  // In a superset the next member goes straight away; rest follows the last member of a round.
  const partner = b.members.find((k) => k !== e.key && roundIn(s, b, k) < roundIn(s, b, e.key) && !memberDone(s.exercises[k]));
  if (partner) { s.curMember = partner; return { session: s, earned }; }
  if (blockDone(s, b)) {
    b.stopped = true;
    b.stoppedAt = now;
    b.clock = pauseClock(b.clock, now);
    s.restEndsAt = null;
    return { session: s, earned };
  }
  const rest = s.exercises[b.members[0]].rest;
  s.restTotal = rest;
  s.restEndsAt = rest > 0 ? now + rest * 1000 : null;
  s.curMember = firstOpenMember(s, b);
  return { session: s, earned };
}

/** Undo for a few seconds after Log set: removes the last set logged on that exercise. */
export function lastLoggedSetUndo(s0: Session, key: string, history: History = {}, now = Date.now()): Session {
  const e = s0.exercises[key];
  if (!e.logs.length) return s0;
  const s = deleteSet(s0, key, e.logs.length - 1, history, now, true); // Undo: the set goes back to being a set to do
  const b = blockOfKey(s, key);
  if (s.curBlock !== b.id) {
    blockOf(s, s.curBlock).clock = pauseClock(blockOf(s, s.curBlock).clock, now);
    s.curBlock = b.id;
    if (b.started && !b.stopped) b.clock = startClock(b.clock, now);
  }
  s.curMember = key;
  s.restEndsAt = null;
  return s;
}

/** Works today's records out again for one exercise, after an edit or a delete. The server's answer still wins. */
function recheckToday(s: Session, key: string, history: History) {
  const e = s.exercises[key];
  const past = pastFacts(history, e.exerciseId);
  const today: SetFacts[] = [];
  e.logs.forEach((l, i) => {
    const f: SetFacts = { id: l.id, lb: l.lb, reps: l.reps, type: l.type, day: s.day, order: i };
    l.records = recordsEarned([...past, ...today], f, kindOf(e));
    today.push(f);
  });
}

/**
 * Deletes a set, logged or still to do (spec Section 10; Nathan, 19 Nov). The
 * point of Delete is not having to do that work, so the set is removed and no
 * fresh set takes its place; the sets after it move up one.
 *
 * In a superset, Delete removes that whole round from every member, including
 * any of its sets already logged, so the members stay equal (Nathan, 19 Nov).
 *
 * Undo after Log set (`refill`) is different: it takes back the log only, and
 * the set goes back to being one to do. An exercise is never left with no sets.
 * Records are worked out again.
 */
export function deleteSet(s0: Session, key: string, index: number, history: History = {}, now = Date.now(), refill = false): Session {
  const s = clone(s0);
  const e = s.exercises[key];
  if (index < 0 || index >= e.types.length) return s;
  if (refill && index >= e.logs.length) return s;
  const b = blockOfKey(s, key);
  const round = index - baseOf(b, key);
  // A set from before this block (before a break or a part-way swap) is this exercise's alone.
  const paired = !b.closed && b.members.length > 1 && !refill && round >= 0;
  const members = paired ? b.members.map((k) => s.exercises[k]) : [e];
  if (!paired && round < 0) ensureBases(b)[key] -= 1;
  for (const m of members) {
    const at = paired ? pairedIndex(b, key, index, m.key) : index;
    if (at < 0 || at >= m.types.length) continue;
    if (at < m.logs.length) m.logs.splice(at, 1);
    m.types.splice(at, 1);
    m.seeds.splice(at, 1);
    if (refill || m.types.length === 0) {
      m.types.push('working');
      m.seeds.push(m.seeds.at(-1) ?? null);
    }
    // The others in the set list keep their own types after the move.
    m.logs.forEach((l, i) => { m.types[i] = l.type; });
  }
  if (!b.closed) b.fixedBudget = null; // the budget follows the sets left
  if (b.stopped && !blockDone(s, b) && !blockSkipped(s, b)) {
    b.stopped = false;
    b.stoppedAt = null;
    if (s.curBlock === b.id && s.endedAt === null && !isPaused(s)) b.clock = startClock(b.clock, now);
  }
  if (!b.stopped && b.started && blockDone(s, b)) {
    b.stopped = true;
    b.stoppedAt = now;
    b.clock = pauseClock(b.clock, now);
  }
  if (s.curBlock === b.id && !b.members.includes(s.curMember)) s.curMember = firstOpenMember(s, b);
  else if (s.curBlock === b.id && paired) s.curMember = firstOpenMember(s, b);
  for (const m of members) recheckToday(s, m.key, history);
  s.lastActivityAt = now;
  return s;
}

/** Whether Delete can remove this set: it never leaves an exercise with no sets. */
export function canDeleteSet(s: Session, key: string, index: number): boolean {
  const e = s.exercises[key];
  if (index < 0 || index >= e.types.length) return false;
  return e.types.length > 1 || index < e.logs.length;
}

/** Edits a logged set's weight and reps. Records are worked out again. */
export function editSet(s0: Session, key: string, index: number, input: LogInput, history: History = {}, now = Date.now()): Session {
  const s = clone(s0);
  const e = s.exercises[key];
  const l = e.logs[index];
  if (!l) return s;
  l.lb = input.lb; l.enteredValue = input.enteredValue; l.enteredUnit = input.enteredUnit; l.reps = input.reps;
  recheckToday(s, key, history);
  s.lastActivityAt = now;
  return s;
}

export function addRest(s0: Session, seconds: number): Session {
  const s = clone(s0);
  if (s.restEndsAt !== null) { s.restEndsAt += seconds * 1000; s.restTotal += seconds; }
  return s;
}
// ---------------------------------------------------------------- pause (Nathan, 19 Nov)

export const isPaused = (s: Session) => s.endedAt === null && s.pausedAt != null;

/**
 * Pause stops the workout clock and the open exercise's clock, and ends any
 * rest (and so its alert). Paused time is never counted. A paused workout does
 * not finish itself after 30 minutes; it does after 2 hours paused.
 */
export function pauseSession(s0: Session, now: number): Session {
  if (s0.endedAt !== null || isPaused(s0)) return s0;
  const s = clone(s0);
  s.clock = pauseClock(s.clock, now);
  const b = blockOf(s, s.curBlock);
  b.clock = pauseClock(b.clock, now);
  s.restEndsAt = null;
  s.pausedAt = now;
  s.lastActivityAt = now;
  return s;
}

/** Resume carries on where the pause left off. */
export function resumeSession(s0: Session, now: number): Session {
  if (!isPaused(s0)) return s0;
  const s = clone(s0);
  s.clock = startClock(s.clock, now);
  const b = blockOf(s, s.curBlock);
  if (b.started && !b.stopped) b.clock = startClock(b.clock, now);
  s.pausedAt = null;
  s.lastActivityAt = now;
  return s;
}

// ---------------------------------------------------------------- sets and rest for today (Nathan, 19 Nov)
// These change today's session only, never the library, the campaign or any
// other day. In a superset they change every member, so it stays paired and equal.

/** Adds one working set to an exercise; in a superset, one round to every member. */
export function addSetToBlock(s0: Session, blockId: string, now: number): Session {
  const s = clone(s0);
  const b = blockOf(s, blockId);
  if (!canAddSet(s, b)) return s0;
  for (const k of b.members) {
    const e = s.exercises[k];
    e.types.push('working');
    e.seeds.push(e.seeds.at(-1) ?? null);
  }
  b.fixedBudget = null; // worked out again from the sets (the same formula a break uses)
  if (b.stopped) {
    b.stopped = false;
    b.stoppedAt = null;
    if (s.curBlock === b.id && b.started && !isPaused(s) && s.endedAt === null) b.clock = startClock(b.clock, now);
  }
  s.lastActivityAt = now;
  return s;
}

/** Removes the last set not yet logged (every member's, in a superset). Never below one set or below what is logged. */
export function removeSetFromBlock(s0: Session, blockId: string, now: number): Session {
  const s = clone(s0);
  const b = blockOf(s, blockId);
  if (b.closed) return s0;
  const ms = b.members.map((k) => s.exercises[k]);
  if (!ms.every((e) => e.types.length > Math.max(1, e.logs.length, baseOf(b, e.key) + 1))) return s0;
  for (const e of ms) { e.types.pop(); e.seeds.splice(e.types.length); }
  b.fixedBudget = null;
  if (blockDone(s, b) && b.started && !b.stopped) {
    b.stopped = true;
    b.stoppedAt = now;
    b.clock = pauseClock(b.clock, now);
  }
  s.lastActivityAt = now;
  return s;
}

/** Sets the rest after each set (after each round, in a superset), 0 to 10 minutes. */
export function setBlockRest(s0: Session, blockId: string, seconds: number, now: number): Session {
  const s = clone(s0);
  const b = blockOf(s, blockId);
  if (b.closed) return s0;
  const r = Math.max(0, Math.min(600, Math.round(seconds)));
  for (const k of b.members) s.exercises[k].rest = r;
  b.fixedBudget = null;
  s.lastActivityAt = now;
  return s;
}

export const blockRest = (s: Session, b: Block) => s.exercises[b.members[0]].rest;
/** + Set is offered until an exercise has the 24 sets the account accepts. */
export const canAddSet = (s: Session, b: Block) =>
  !b.closed && !blockSkipped(s, b) && b.members.every((k) => s.exercises[k].types.length < MAX_SETS);
export const canRemoveSet = (s: Session, b: Block) =>
  !b.closed && b.members.every((k) => s.exercises[k].types.length > Math.max(1, s.exercises[k].logs.length, baseOf(b, k) + 1));
/** Sets (rounds, in a superset) shown in the tray: the most any member has. */
export const blockSetCount = (s: Session, b: Block) => Math.max(...b.members.map((k) => s.exercises[k].types.length));

export function skipRest(s0: Session): Session {
  const s = clone(s0);
  s.restEndsAt = null;
  return s;
}

/** Tapping a set in the list switches it between warm-up and working (a paired effect in a superset). */
export function toggleSet(s0: Session, round: number): Session {
  const s = clone(s0);
  const b = blockOf(s, s.curBlock);
  const cur = s.curMember;
  const r = round - baseOf(b, cur);
  // A set from before this block (a break or a part-way swap) switches on its own.
  const members = r >= 0 ? b.members.map((k) => s.exercises[k]) : [s.exercises[cur]];
  const off = (k: string) => (r >= 0 ? baseOf(b, k) : 0);
  const at = r >= 0 ? r : round;
  const next = toggleWarmup(members.map((m) => m.types.slice(off(m.key))), members.map((m) => m.logs.length - off(m.key)), at);
  if (!next) return s;
  // A warm-up adds a working set; never past the 24 sets the account accepts.
  if (members.some((m, i) => off(m.key) + next[i].length > MAX_SETS)) return s;
  members.forEach((m, i) => {
    const o = off(m.key);
    m.types = [...m.types.slice(0, o), ...next[i]];
    if (m.logs[o + at]) m.logs[o + at].type = next[i][at];
  });
  return s;
}

/**
 * The set details sheet. Moving a set into or out of Warm-up is the same
 * change as tapping it in the list, so it goes through `toggleSet` (a set is
 * added or taken away, in a superset for every member). Drop set and RPE only
 * change the label.
 */
export function setDetails(s0: Session, key: string, round: number, type: SetType, rpe: number | null, history: History = {}): Session {
  let base = s0;
  const old = s0.exercises[key].types[round];
  if ((old === 'warm_up') !== (type === 'warm_up')) {
    const block = s0.blocks.find((b) => !b.closed && b.members.includes(key));
    if (block) {
      const aimed = clone(s0);
      aimed.curBlock = block.id;
      aimed.curMember = key;
      base = toggleSet(aimed, round);
      base.curBlock = s0.curBlock;
      base.curMember = s0.curMember;
    }
    // Refused (for example at 24 sets): the set keeps its type.
    if (base.exercises[key].types[round] === old) type = old;
  }
  const s = clone(base);
  const e = s.exercises[key];
  e.types[round] = type;
  if (e.logs[round]) { e.logs[round].type = type; e.logs[round].rpe = rpe; recheckToday(s, key, history); }
  return s;
}

export function skipBlock(s0: Session, blockId: string, now: number): Session {
  const s = clone(s0);
  const b = blockOf(s, blockId);
  b.members.forEach((k) => { s.exercises[k].skipped = true; });
  b.clock = pauseClock(b.clock, now);
  b.stopped = true;
  b.stoppedAt ??= now;
  if (s.curBlock === blockId) {
    const next = liveBlocks(s).find((x) => !blockSkipped(s, x) && !blockDone(s, x));
    if (next) { s.curBlock = next.id; s.curMember = firstOpenMember(s, next); if (next.started && !next.stopped) next.clock = startClock(next.clock, now); }
  }
  return s;
}

/**
 * Moves an exercise up or down in the tray. It moves past the next exercise
 * shown: a superset broken apart, or carried on after a part-way swap, is no
 * longer shown and is passed over. Each of those hidden blocks is then kept
 * just before the first block made from it, so the account always meets a
 * block before the blocks made from it.
 */
export function moveBlock(s0: Session, blockId: string, delta: -1 | 1): Session {
  const s = clone(s0);
  const live = s.blocks.filter((b) => !b.closed);
  const i = live.findIndex((b) => b.id === blockId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= live.length) return s;
  [live[i], live[j]] = [live[j], live[i]];
  s.blocks = parentsFirst(live, s.blocks.filter((b) => b.closed));
  return s;
}

function parentsFirst(live: Block[], closed: Block[]): Block[] {
  const hidden = new Map(closed.map((b) => [b.id, b]));
  const out: Block[] = [];
  const placed = new Set<string>();
  const place = (b: Block) => {
    if (placed.has(b.id)) return;
    placed.add(b.id);
    const parent = b.brokenFrom ? hidden.get(b.brokenFrom) : undefined;
    if (parent) place(parent);
    out.push(b);
  };
  live.forEach(place);
  closed.forEach(place);
  return out;
}

export function addExercise(s0: Session, it: PlanItem, seedOf: (id: string, sets: number, assisted: boolean) => (number | null)[]): Session {
  const s = clone(s0);
  const key = uid('x');
  s.exercises[key] = {
    key, exerciseId: it.exerciseId, name: it.name, muscle: it.muscle, equipment: it.equipment, unit: it.unit, assisted: it.assisted,
    loadCount: it.loadCount, work: it.work, rest: it.rest, plannedReps: it.reps, plannedWeightLb: null,
    seeds: it.unit === 'bw' ? Array.from({ length: it.sets }, () => null) : seedOf(it.exerciseId, it.sets, it.assisted),
    types: Array.from({ length: it.sets }, () => 'working' as SetType), logs: [], skipped: false, alternates: it.alternates,
    origin: 'added', swappedFrom: null,
  };
  s.blocks.push({ id: uid('b'), letter: null, members: [key], clock: newClock(), started: false, stopped: false, baseLogged: 0, closed: false, fixedBudget: null, closedDone: 0, closedPlanned: 0, brokenFrom: null, startedAt: null, stoppedAt: null, brokenAt: null });
  return s;
}

type SeedOf = (id: string, sets: number, assisted: boolean) => (number | null)[];

/**
 * Whether Swap can be used on an exercise now, and if not, why. Anything left
 * to do can be swapped. In a superset a swap waits for the end of a round, so
 * the members stay paired.
 */
export function swapBlocked(s: Session, key: string): null | 'done' | 'skipped' | 'mid_round' {
  const e = s.exercises[key];
  if (e.skipped) return 'skipped';
  if (e.logs.length >= e.types.length) return 'done';
  const b = blockOfKey(s, key);
  if (e.logs.length > 0 && !b.closed && b.members.length > 1) {
    const r = roundIn(s, b, key);
    if (b.members.some((k) => roundIn(s, b, k) !== r)) return 'mid_round';
  }
  return null;
}

function swappedIn(e: SessionExercise, it: PlanItem, key: string, types: SetType[], seedOf: SeedOf, rest: number): SessionExercise {
  return {
    key, exerciseId: it.exerciseId, name: it.name, muscle: it.muscle, equipment: it.equipment, unit: it.unit, assisted: it.assisted,
    loadCount: it.loadCount, work: it.work, rest, plannedReps: e.plannedReps, plannedWeightLb: null, alternates: it.alternates,
    types, logs: [], skipped: false, origin: 'swap', swappedFrom: e.swappedFrom ?? e.exerciseId,
    seeds: it.unit === 'bw' ? types.map(() => null) : seedOf(it.exerciseId, types.length, it.assisted),
  };
}

const emptyBlock = (members: string[], letter: string | null = null): Block => ({
  id: uid('b'), letter, members, clock: newClock(), started: false, stopped: false, baseLogged: 0, closed: false,
  fixedBudget: null, closedDone: 0, closedPlanned: 0, brokenFrom: null, startedAt: null, stoppedAt: null, brokenAt: null,
});

/**
 * A swap replaces the exercise in today's session only (spec Sections 2 and 10).
 *
 * Before any set is logged, the new exercise takes its place and takes the
 * same sets.
 *
 * Part-way through (some sets logged), the sets already logged stay with the
 * exercise they were done on, which now ends with them, and only the sets
 * left are done as the new exercise, right after it, with its own clock and
 * budget and Start exercise. This follows the rule for every change to a
 * running workout: it applies to sets not yet logged.
 *
 * In a superset, the new exercise takes the member's place for the rounds
 * left, so the superset stays paired and equal; this waits for the end of a
 * round. The rounds done before the swap keep their time and budget, as a
 * break keeps them. The exercise swapped out stays in the workout as done.
 * A swap also ends Undo break.
 */
export function swapExercise(s0: Session, key: string, it: PlanItem, seedOf: SeedOf, now = Date.now()): Session {
  if (swapBlocked(s0, key)) return s0;
  const s = clone(s0);
  const e = s.exercises[key];
  if (e.logs.length === 0) {
    s.exercises[key] = { ...swappedIn(e, it, key, e.types, seedOf, it.rest), logs: e.logs, types: e.types };
    return s;
  }

  const done = e.logs.length;
  const left = e.types.slice(done);
  const b = blockOfKey(s, key);
  const nk = uid('x');
  s.breakUndo = null;
  s.lastActivityAt = now;

  if (b.closed || b.members.length === 1) {
    // One exercise: it ends with the sets logged, and the new one follows it.
    s.exercises[nk] = swappedIn(e, it, nk, left, seedOf, it.rest);
    e.types = e.types.slice(0, done);
    e.seeds = e.seeds.slice(0, done);
    b.fixedBudget = null; // worked out again from the sets it kept
    b.stopped = true;
    b.stoppedAt ??= now;
    b.clock = pauseClock(b.clock, now);
    const nb = emptyBlock([nk]);
    s.blocks.splice(s.blocks.findIndex((x) => x.id === b.id) + 1, 0, nb);
    if (s.curBlock === b.id) { s.curBlock = nb.id; s.curMember = nk; }
    return s;
  }

  // A superset, at the end of a round.
  s.exercises[nk] = swappedIn(e, it, nk, left, seedOf, e.rest);
  // The rounds done so far are kept as they were, the way a break keeps them.
  b.fixedBudget = blockBudget(s, b);
  b.closedDone = blockLogged(s, b);
  b.closedPlanned = blockPlanned(s, b);
  b.clock = pauseClock(b.clock, now);
  b.closed = true;
  b.stopped = true;
  b.brokenAt = now;
  b.stoppedAt ??= now;
  e.types = e.types.slice(0, done);
  e.seeds = e.seeds.slice(0, done);
  // The exercise swapped out stays in the workout, done.
  const kept: Block = { ...emptyBlock([key]), baseLogged: done, stopped: true, stoppedAt: now, brokenFrom: b.id };
  // The superset carries on with the new exercise in its place.
  const nb: Block = {
    ...emptyBlock(b.members.map((k) => (k === key ? nk : k)), b.letter),
    brokenFrom: b.id,
    bases: Object.fromEntries(b.members.map((k) => (k === key ? [nk, 0] : [k, s.exercises[k].logs.length]))),
  };
  nb.baseLogged = nb.bases![nb.members[0]];
  s.blocks.splice(s.blocks.findIndex((x) => x.id === b.id) + 1, 0, kept, nb);
  if (s.curBlock === b.id) { s.curBlock = nb.id; s.curMember = firstOpenMember(s, nb); }
  return s;
}

// ---------------------------------------------------------------- breaking a superset

export function canBreak(s: Session, b: Block): boolean {
  return b.members.length > 1 && !b.closed && !blockDone(s, b);
}

/**
 * Break a superset into individual exercises, for this session only. Each
 * member keeps its sets, reps and weight, gets its own clock and budget (the
 * one-exercise formula on the sets it has left, with its own rest), and rest
 * follows every set. Sets already logged stay. A started superset's clock
 * stops and its time counts toward efficiency for the sets logged before the
 * break. Undo restores it until a set is logged afterwards.
 */
export function breakSuperset(s0: Session, blockId: string, now: number): Session {
  const s = clone(s0);
  const old = blockOf(s, blockId);
  if (!canBreak(s, old)) return s;
  s.breakUndo = clone(s.blocks);
  const members = old.members.map((k) => s.exercises[k]);
  const budgetBefore = blockBudget(s, old);
  const doneBefore = blockLogged(s, old);
  const plannedBefore = blockPlanned(s, old);
  old.clock = pauseClock(old.clock, now);
  old.closed = true;
  old.stopped = true;
  old.brokenAt = now;
  old.stoppedAt ??= now;
  old.fixedBudget = budgetBefore;
  old.closedDone = doneBefore;
  old.closedPlanned = plannedBefore;
  // Each new block's budget is the one-exercise formula on the sets it has left (blockBudget).
  const made: Block[] = members.map((m) => ({
    id: uid('b'), letter: null, members: [m.key], clock: newClock(), started: false, stopped: m.logs.length >= m.types.length,
    baseLogged: m.logs.length, closed: false, fixedBudget: null, closedDone: 0, closedPlanned: 0, brokenFrom: old.id,
    startedAt: null, stoppedAt: m.logs.length >= m.types.length ? now : null, brokenAt: null,
  }));
  const at = s.blocks.findIndex((b) => b.id === blockId);
  s.blocks.splice(at + 1, 0, ...made);
  if (s.curBlock === blockId) { s.curBlock = made[0].id; s.curMember = made[0].members[0]; }
  return s;
}

export function undoBreak(s0: Session, now: number): Session {
  const s = clone(s0);
  if (!s.breakUndo) return s;
  const before = s.breakUndo;
  const known = new Set(before.map((b) => b.id));
  // The blocks this break made, and the superset it broke. Only these change
  // back; every other block keeps what has happened to it since the break,
  // and an exercise added since stays at the end.
  const made = s.blocks.filter((b) => !known.has(b.id) && b.brokenFrom && known.has(b.brokenFrom));
  const added = s.blocks.filter((b) => !known.has(b.id) && !made.includes(b));
  const broken = new Set(made.map((b) => b.brokenFrom!));
  const current = new Map(s.blocks.map((b) => [b.id, b]));
  const onMade = made.some((b) => b.id === s.curBlock);
  s.blocks = [...before.map((b) => {
    const nowB = current.get(b.id) ?? b;
    if (!broken.has(b.id)) return nowB;
    // The superset's clock stopped at the break. It takes back the time run on
    // the new blocks' clocks, and runs again if the person is on it.
    const banked = nowB.clock.banked + made.filter((m) => m.brokenFrom === b.id).reduce((t, m) => t + readClock(m.clock, now), 0);
    const restored: Block = { ...b, clock: { banked, since: null } };
    if (onMade && restored.started && !restored.stopped && !isPaused(s) && s.endedAt === null) restored.clock = startClock(restored.clock, now);
    return restored;
  }), ...added];
  const cur = s.blocks.find((b) => b.id === s.curBlock)
    ?? s.blocks.find((b) => !b.closed && b.members.includes(s.curMember)) ?? s.blocks[0];
  s.curBlock = cur.id;
  s.curMember = firstOpenMember(s, cur);
  s.breakUndo = null;
  return s;
}

// ---------------------------------------------------------------- finishing

export function finishSession(s0: Session, now: number, reason: 'user' | 'auto' | 'replaced' = 'user'): Session {
  const s = clone(s0);
  for (const b of s.blocks) b.clock = pauseClock(b.clock, now);
  s.clock = pauseClock(s.clock, now);
  s.endedAt = now;
  s.finishReason = reason;
  s.restEndsAt = null;
  s.pausedAt = null; // a finished workout is not paused; reopening it runs its clocks
  return s;
}

/**
 * The 30-minute auto-finish (spec Section 10, design Section 7): with nothing
 * logged for 30 minutes, the session ends at its last logged step, and every
 * clock is cut back to that moment. The server's job does the same.
 */
export function autoFinishIfIdle(s: Session, now: number): Session {
  const limit = isPaused(s) ? PAUSED_FINISH_MS : AUTO_FINISH_MS;
  if (s.endedAt !== null || now - s.lastActivityAt < limit) return s;
  return finishSession(s, Math.max(s.startedAt, s.lastActivityAt), 'auto');
}

export const canReopen = (s: Session, now: number) => s.endedAt !== null && now - s.endedAt < REOPEN_MS;

/**
 * Reopens a finished workout within 48 hours: its clocks resume, and the time
 * it was closed is not counted (spec Section 10, design Section 5).
 */
export function reopenSession(s0: Session, now: number): Session {
  if (!canReopen(s0, now)) return s0;
  const s = clone(s0);
  s.endedAt = null;
  s.finishReason = null;
  s.pausedAt = null;
  s.clock = startClock(s.clock, now);
  const b = blockOf(s, s.curBlock);
  if (b.started && !b.stopped) b.clock = startClock(b.clock, now);
  s.lastActivityAt = now;
  return s;
}

/** What the next session of each exercise needs to know. */
export function toHistory(s: Session, into: History): History {
  const out: History = clone(into);
  for (const e of Object.values(s.exercises)) {
    if (!e.logs.length) continue;
    const list = (out[e.exerciseId] ??= []).filter((p) => p.sessionId !== s.id);
    list.push({ day: s.day, sessionId: s.id, startedAt: s.startedAt, sets: e.logs.map((l) => ({ lb: l.lb, reps: l.reps, type: l.type })) });
    out[e.exerciseId] = list;
  }
  return out;
}

export function recordLabelFor(earned: RecordType[]): RecordType | null {
  return celebrationName(earned);
}
