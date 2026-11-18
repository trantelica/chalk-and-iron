// A running workout as plain data, and the moves that change it (spec Sections
// 2, 5 and 10). No screen, no storage and no clock of its own: every move takes
// the current time, so a test can run a whole workout in a blink. The phone
// keeps one of these in its own storage and sends each change to the account
// (src/rules/sync.ts). Every id is a random uuid made on the phone, so the
// same ids name the same rows on the server (design Sections 2 and 6).

import {
  budgetSingle,
  budgetSuperset,
  budgetsAfterBreak,
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
}

/** A session with nothing logged for 30 minutes finishes itself (spec Section 10). */
export const AUTO_FINISH_MS = 30 * 60 * 1000;
/** A finished workout can be reopened for 48 hours (spec Section 10). */
export const REOPEN_MS = 48 * 60 * 60 * 1000;

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
    curBlock: blocks[0].id, curMember: blocks[0].members[0], restEndsAt: null, restTotal: 0, breakUndo: null, lastActivityAt: now,
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

export const setsOf = (e: SessionExercise, b: Block) => Math.max(0, e.types.length - b.baseLogged);
export const memberDone = (e: SessionExercise) => e.logs.length >= e.types.length;
export const blockDone = (s: Session, b: Block) => b.members.every((k) => memberDone(s.exercises[k]));
export const blockSkipped = (s: Session, b: Block) => b.members.every((k) => s.exercises[k].skipped);

/** Time budget of a block, from its members' current sets. */
export function blockBudget(s: Session, b: Block): number {
  if (b.fixedBudget !== null) return b.fixedBudget;
  const ms = b.members.map((k) => s.exercises[k]);
  if (ms.length === 1) return budgetSingle(setsOf(ms[0], b), ms[0].work, ms[0].rest);
  return budgetSuperset(ms[0].types.length, ms.map((m) => m.work), ms[0].rest);
}

/** Sets logged in a block this far (every member). */
export const blockLogged = (s: Session, b: Block) => b.members.reduce((a, k) => a + s.exercises[k].logs.length - b.baseLogged, 0);
export const blockPlanned = (s: Session, b: Block) => b.members.reduce((a, k) => a + setsOf(s.exercises[k], b), 0);

export function efficiencyOf(s: Session, now: number): number | null {
  const parts = s.blocks.filter((b) => b.started && (b.closed || !blockSkipped(s, b))).map((b) => ({
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

export const setsDone = (s: Session) => Object.values(s.exercises).reduce((a, e) => a + (e.skipped ? 0 : e.logs.length), 0);
export const setsPlanned = (s: Session) => liveBlocks(s).reduce((a, b) => a + b.members.reduce((x, k) => x + (s.exercises[k].skipped ? 0 : s.exercises[k].types.length), 0), 0);
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
    if (to.started && !to.stopped) to.clock = startClock(to.clock, now);
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
  const partner = b.members.find((k) => k !== e.key && s.exercises[k].logs.length < e.logs.length && !memberDone(s.exercises[k]));
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
  const s = deleteSet(s0, key, e.logs.length - 1, history, now);
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
 * Deletes a logged set (spec Section 10). The sets after it move up one, and a
 * set to do takes its place at the end, so the plan keeps its number of sets.
 * Records are worked out again.
 */
export function deleteSet(s0: Session, key: string, index: number, history: History = {}, now = Date.now()): Session {
  const s = clone(s0);
  const e = s.exercises[key];
  if (index < 0 || index >= e.logs.length) return s;
  e.logs.splice(index, 1);
  e.types.splice(index, 1);
  e.types.push('working');
  // The others in the set list keep their own types after the move.
  e.logs.forEach((l, i) => { e.types[i] = l.type; });
  const b = blockOfKey(s, key);
  if (b.stopped && !blockDone(s, b) && !blockSkipped(s, b)) {
    b.stopped = false;
    b.stoppedAt = null;
    if (s.curBlock === b.id && s.endedAt === null) b.clock = startClock(b.clock, now);
  }
  recheckToday(s, key, history);
  s.lastActivityAt = now;
  return s;
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
export function skipRest(s0: Session): Session {
  const s = clone(s0);
  s.restEndsAt = null;
  return s;
}

/** Tapping a set in the list switches it between warm-up and working (a paired effect in a superset). */
export function toggleSet(s0: Session, round: number): Session {
  const s = clone(s0);
  const b = blockOf(s, s.curBlock);
  const members = b.members.map((k) => s.exercises[k]);
  const next = toggleWarmup(members.map((m) => m.types), members.map((m) => m.logs.length), round);
  if (!next) return s;
  members.forEach((m, i) => {
    m.types = next[i];
    if (m.logs[round]) m.logs[round].type = next[i][round];
  });
  return s;
}

export function setDetails(s0: Session, key: string, round: number, type: SetType, rpe: number | null, history: History = {}): Session {
  const s = clone(s0);
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

export function moveBlock(s0: Session, blockId: string, delta: -1 | 1): Session {
  const s = clone(s0);
  const i = s.blocks.findIndex((b) => b.id === blockId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= s.blocks.length) return s;
  [s.blocks[i], s.blocks[j]] = [s.blocks[j], s.blocks[i]];
  return s;
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

/** A swap replaces the exercise in today's session only. The new one takes the same sets. */
export function swapExercise(s0: Session, key: string, it: PlanItem, seedOf: (id: string, sets: number, assisted: boolean) => (number | null)[]): Session {
  const s = clone(s0);
  const e = s.exercises[key];
  const sets = e.types.length;
  s.exercises[key] = {
    ...e, exerciseId: it.exerciseId, name: it.name, muscle: it.muscle, equipment: it.equipment, unit: it.unit, assisted: it.assisted,
    loadCount: it.loadCount, work: it.work, rest: it.rest, plannedWeightLb: null, alternates: it.alternates,
    origin: 'swap', swappedFrom: e.swappedFrom ?? e.exerciseId,
    seeds: it.unit === 'bw' ? Array.from({ length: sets }, () => null) : seedOf(it.exerciseId, sets, it.assisted),
  };
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
  const budgets = budgetsAfterBreak(members.map((m) => ({ sets: m.types.length, logged: m.logs.length, work: m.work, rest: m.rest })));
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
  const made: Block[] = members.map((m, i) => ({
    id: uid('b'), letter: null, members: [m.key], clock: newClock(), started: false, stopped: m.logs.length >= m.types.length,
    baseLogged: m.logs.length, closed: false, fixedBudget: budgets[i], closedDone: 0, closedPlanned: 0, brokenFrom: old.id,
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
  const restored = s.breakUndo;
  // Time on the new blocks' clocks is added back to the superset's clock.
  for (const nb of s.blocks) {
    if (!nb.brokenFrom) continue;
    const parent = restored.find((b) => b.id === nb.brokenFrom);
    if (parent) parent.clock = { banked: parent.clock.banked + readClock(nb.clock, now), since: parent.clock.since };
  }
  s.blocks = restored;
  const cur = s.blocks.find((b) => b.id === s.curBlock) ?? s.blocks.find((b) => b.members.includes(s.curMember)) ?? s.blocks[0];
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
  return s;
}

/**
 * The 30-minute auto-finish (spec Section 10, design Section 7): with nothing
 * logged for 30 minutes, the session ends at its last logged step, and every
 * clock is cut back to that moment. The server's job does the same.
 */
export function autoFinishIfIdle(s: Session, now: number): Session {
  if (s.endedAt !== null || now - s.lastActivityAt < AUTO_FINISH_MS) return s;
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
