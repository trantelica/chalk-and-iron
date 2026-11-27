// A coach's change to today, applied (spec Section 10, "Proposals"; design
// Section 5, "Accepting a change to today"; stage 4D, 26 Nov 2026).
//
// A today proposal changes only today: the running workout if there is one,
// otherwise today's prepared plan. It never changes the library or the
// campaign, and never alters a set already logged (spec Section 4).
//
// The same moves the phone itself makes (src/rules/session.ts: swap, + Set,
// rest, add, reorder, break a superset) do the work, so a change accepted from
// the coach behaves exactly like the same change made by hand. Plain functions
// with no network and no storage, so the tests can run them, and so the same
// change can be applied twice with the same result: once to the account's
// copy when Accept is tapped, and once to the phone's own copy of a running
// workout when it learns of it (`replayAccepted`). The new rows a change makes
// take ids worked out from the proposal's id (`idsFrom`), so the two copies
// name them the same way.

import {
  addExercise, addSetToBlock, blockLogged, blockOfKey, breakSuperset, canBreak, goTo, liveBlocks, memberDone, moveBlock,
  removeSetFromBlock, setBlockRest, swapBlocked, swapExercise, withIds,
  type PlanItem, type Session,
} from './session';
import type { LibraryFacts } from './sync';
import type { TodayItem } from './today';
import { pauseClock } from './workout';

/** One change, as the payload of a 'today_change' proposal carries it (design Section 3). */
export type TodayChange =
  | { action: 'swap'; exercise_id: string; to_exercise_id: string }
  | { action: 'set_sets'; exercise_id: string; sets: number }
  | { action: 'set_reps'; exercise_id: string; reps: number }
  | { action: 'set_weight'; exercise_id: string; weight_lb: number }
  | { action: 'set_rest'; exercise_id: string; rest_seconds: number }
  | { action: 'add'; exercise_id: string; sets: number; reps: number; weight_lb?: number | null; rest_seconds?: number | null; position?: number | null }
  | { action: 'remove'; exercise_id: string }
  | { action: 'reorder'; exercise_id: string; position: number }
  | { action: 'break_superset'; superset_letter?: string | null; exercise_id?: string | null };

/** What a change needs to know about a library exercise. */
export interface ExerciseFacts extends LibraryFacts { id: string; work: number; rest: number; archived: boolean }

export type Facts = (id: string) => ExerciseFacts | undefined;
type SeedOf = (id: string, sets: number, assisted: boolean) => (number | null)[];

/**
 * Why a change could not be applied. `final` means the card can never be
 * applied as it stands (it becomes out of date, and the coach can see that);
 * otherwise it may work a little later (the end of a superset's round).
 */
export interface Refusal { ok: false; final: boolean; message: string }
const refuse = (message: string, final = true): Refusal => ({ ok: false, final, message });

/**
 * Ids for the rows a change makes, worked out from the proposal's id and a
 * count, so the account and the phone make the same ones. Any 32 hex digits
 * are a valid id for the database.
 */
export function idsFrom(seed: string): () => string {
  const hex = seed.replace(/-/g, '').toLowerCase().padEnd(32, '0').slice(0, 32);
  let n = 0;
  return () => {
    n += 1;
    const mid = (parseInt(hex.slice(16, 24), 16) ^ 0x5bd1e995 ^ n) >>> 0;
    const tail = (parseInt(hex.slice(24, 32), 16) ^ Math.imul(n, 0x9e3779b1)) >>> 0;
    const h = hex.slice(0, 16) + mid.toString(16).padStart(8, '0') + tail.toString(16).padStart(8, '0');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  };
}

const nameOf = (facts: Facts, id: string, fallback?: string) => facts(id)?.name ?? fallback ?? 'That exercise';

function planOf(f: ExerciseFacts, sets: number, reps: number, rest: number | null): PlanItem {
  return {
    exerciseId: f.id, name: f.name, muscle: f.muscle, equipment: f.equipment, unit: f.unit, assisted: f.assisted, loadCount: f.loadCount,
    work: f.work, rest: rest ?? f.rest, sets, reps, superset: null, alternates: f.alternates,
  };
}

/** A library exercise a change may bring in: in the library and not archived. */
function usable(facts: Facts, id: string): ExerciseFacts | Refusal {
  const f = facts(id);
  if (!f) return refuse('An exercise on this card is not in your library.');
  if (f.archived) return refuse(`${f.name} is archived. Restore it in the library, or ask the coach for another.`);
  return f;
}

// ---------------------------------------------------------------- a running workout

/** The exercise a change names in the workout: still to do if there is one, in a block still shown. */
function keyFor(s: Session, exerciseId: string): string | null {
  const live = liveBlocks(s).flatMap((b) => b.members).filter((k) => s.exercises[k].exerciseId === exerciseId);
  const open = live.find((k) => !memberDone(s.exercises[k]) && !s.exercises[k].skipped);
  return open ?? live[0] ?? Object.values(s.exercises).find((e) => e.exerciseId === exerciseId)?.key ?? null;
}

const clone = <T,>(v: T): T => structuredClone(v);

/** Moves the person on to the next exercise still to do, if they were on `blockId`. */
function moveOffIfOn(s: Session, blockId: string, now: number): Session {
  if (s.curBlock !== blockId) return s;
  const next = liveBlocks(s).find((b) => b.id !== blockId && b.members.some((k) => !memberDone(s.exercises[k]) && !s.exercises[k].skipped))
    ?? liveBlocks(s).find((b) => b.id !== blockId);
  return next ? goTo(s, next.id, now) : s;
}

function oneToSession(s: Session, c: TodayChange, facts: Facts, seedOf: SeedOf, now: number): Session | Refusal {
  if (c.action === 'break_superset') {
    const byLetter = c.superset_letter ? liveBlocks(s).find((b) => b.letter === c.superset_letter && b.members.length > 1) : undefined;
    const byMember = !byLetter && c.exercise_id ? (() => { const k = keyFor(s, c.exercise_id!); return k ? blockOfKey(s, k) : undefined; })() : undefined;
    const b = byLetter ?? byMember;
    if (!b || b.members.length < 2 || b.closed) return refuse(`Superset ${c.superset_letter ?? ''} is not in today's workout, or is already broken apart.`.replace('  ', ' '));
    if (!canBreak(s, b)) return refuse('That superset is already done today.');
    return breakSuperset(s, b.id, now);
  }

  if (c.action === 'add') {
    const f = usable(facts, c.exercise_id);
    if ('ok' in f) return f;
    let out = addExercise(s, planOf(f, c.sets, c.reps, c.rest_seconds ?? null), seedOf);
    const added = out.blocks[out.blocks.length - 1];
    if (c.weight_lb != null && f.unit !== 'bw') out.exercises[added.members[0]].plannedWeightLb = c.weight_lb;
    if (c.position != null) {
      const target = Math.max(0, Math.min(liveBlocks(out).length - 1, c.position - 1));
      while (liveBlocks(out).findIndex((b) => b.id === added.id) > target) out = moveBlock(out, added.id, -1);
    }
    return out;
  }

  const key = keyFor(s, c.exercise_id);
  if (!key) return refuse(`${nameOf(facts, c.exercise_id)} is not in today's workout.`);
  const e = s.exercises[key];
  const b = blockOfKey(s, key);
  const done = memberDone(e) || e.skipped;

  switch (c.action) {
    case 'swap': {
      const f = usable(facts, c.to_exercise_id);
      if ('ok' in f) return f;
      const why = swapBlocked(s, key);
      if (why === 'done' || why === 'skipped') return refuse(`${e.name} is already ${why === 'done' ? 'done' : 'skipped'} today, so it cannot be swapped.`);
      if (why === 'mid_round') return refuse(`${e.name} is part-way through a round of its superset. Accept again at the end of the round.`, false);
      const out = swapExercise(s, key, planOf(f, e.types.length, e.plannedReps, null), seedOf, now);
      return out === s ? refuse(`${e.name} cannot be swapped now.`) : out;
    }
    case 'set_sets': {
      if (c.sets < e.logs.length) return refuse(`${e.name} already has ${e.logs.length} sets logged, more than ${c.sets}.`);
      let out = s;
      for (let i = 0; i < 30 && out.exercises[key].types.length !== c.sets; i++) {
        const cur = blockOfKey(out, key);
        const next = out.exercises[key].types.length < c.sets ? addSetToBlock(out, cur.id, now) : removeSetFromBlock(out, cur.id, now);
        if (next === out) return refuse(`${e.name} cannot have ${c.sets} sets today.`);
        out = next;
      }
      return out.exercises[key].types.length === c.sets ? out : refuse(`${e.name} cannot have ${c.sets} sets today.`);
    }
    case 'set_reps': {
      if (done) return refuse(`${e.name} is already done today.`);
      const out = clone(s);
      out.exercises[key].plannedReps = c.reps;
      return out;
    }
    case 'set_weight': {
      if (done) return refuse(`${e.name} is already done today.`);
      if (e.unit === 'bw') return refuse(`${e.name} is a bodyweight exercise and has no weight.`);
      const out = clone(s);
      out.exercises[key].plannedWeightLb = c.weight_lb;
      return out;
    }
    case 'set_rest': {
      if (done) return refuse(`${e.name} is already done today.`);
      const out = setBlockRest(s, b.id, c.rest_seconds, now);
      return out === s ? refuse(`${e.name}'s rest cannot be changed now.`) : out;
    }
    case 'reorder': {
      let out = s;
      const target = Math.max(0, Math.min(liveBlocks(out).length - 1, c.position - 1));
      for (let i = 0; i < 60; i++) {
        const at = liveBlocks(out).findIndex((x) => x.id === b.id);
        if (at === target || at < 0) break;
        out = moveBlock(out, b.id, at > target ? -1 : 1);
      }
      return out;
    }
    case 'remove':
      return removeFromSession(s, key, now);
  }
}

/**
 * Takes an exercise out of today's workout. One not started goes; in a
 * superset not yet started it leaves the superset (one left on its own is no
 * longer a superset). One with sets logged ends with them, so nothing logged
 * changes; in a superset part-way through, the superset is broken apart first.
 */
function removeFromSession(s0: Session, key: string, now: number): Session | Refusal {
  const e0 = s0.exercises[key];
  if (memberDone(e0) || e0.skipped) return refuse(`${e0.name} is already done today.`);
  let s = s0;
  let b = blockOfKey(s, key);
  if (b.members.length > 1 && blockLogged(s, b) > 0) {
    s = breakSuperset(s, b.id, now);
    b = blockOfKey(s, key);
  }
  s = clone(s);
  b = blockOfKey(s, key);
  const e = s.exercises[key];
  s.lastActivityAt = now;
  if (e.logs.length > 0) {
    e.types = e.types.slice(0, e.logs.length);
    e.seeds = e.seeds.slice(0, e.logs.length);
    b.fixedBudget = null;
    if (b.members.every((k) => memberDone(s.exercises[k]))) {
      b.stopped = true;
      b.stoppedAt ??= now;
      b.clock = pauseClock(b.clock, now);
    }
    return moveOffIfOn(s, b.id, now);
  }
  if (liveBlocks(s).length === 1 && b.members.length === 1) return refuse(`${e.name} is the only exercise left in today's workout.`);
  const blockId = b.id;
  if (b.members.length === 1) s = moveOffIfOn(s, blockId, now);
  s = clone(s);
  b = s.blocks.find((x) => x.id === blockId)!;
  delete s.exercises[key];
  b.members = b.members.filter((k) => k !== key);
  if (b.bases) delete b.bases[key];
  if (b.members.length === 1) b.letter = null;
  if (!b.members.length) s.blocks = s.blocks.filter((x) => x.id !== blockId);
  s.breakUndo = null; // Undo break could bring it back
  if (s.curMember === key) s.curMember = b.members[0];
  return s;
}

/**
 * Applies a card's changes to a running workout, all of them or none. `seed`
 * is the proposal's id: the rows it makes take ids worked out from it.
 */
export function applyToSession(s: Session, changes: TodayChange[], facts: Facts, seedOf: SeedOf, now: number, seed: string): { ok: true; session: Session } | Refusal {
  return withIds(idsFrom(seed), () => {
    let out = s;
    for (const c of changes) {
      const r = oneToSession(out, c, facts, seedOf, now);
      if ('ok' in r) return r;
      out = r;
    }
    return { ok: true as const, session: out };
  });
}

/** An accepted change to a running workout, as the account keeps it in the proposal's result. */
export interface AcceptedToday { proposalId: string; revision: number; changes: TodayChange[] }

/**
 * The phone's own copy of a running workout, brought up to the account's plan
 * revision: each accepted change it does not have yet is applied to it, in
 * order (stage 4D). Unlike Accept, a change that no longer fits this copy
 * (say the exercise was finished here with no signal) is passed over rather
 * than refused, since the phone's copy is what was really done.
 */
export function replayAccepted(s: Session, accepted: AcceptedToday[], facts: Facts, seedOf: SeedOf, now: number): Session {
  let out = s;
  for (const a of accepted.slice().sort((x, y) => x.revision - y.revision)) {
    if (a.revision <= (out.planRevision ?? 0)) continue;
    out = withIds(idsFrom(a.proposalId), () => {
      let cur = out;
      for (const c of a.changes) {
        const r = oneToSession(cur, c, facts, seedOf, now);
        if (!('ok' in r)) cur = r;
      }
      return cur;
    });
    out = { ...out, planRevision: a.revision };
  }
  return out;
}

// ---------------------------------------------------------------- today's prepared plan

/** A place in today's list: one exercise, or a superset's members together. */
function places(items: TodayItem[]): TodayItem[][] {
  const out: TodayItem[][] = [];
  const byLetter = new Map<string, TodayItem[]>();
  for (const it of items) {
    const g = it.superset ? byLetter.get(it.superset) : undefined;
    if (g) { g.push(it); continue; }
    const fresh = [it];
    out.push(fresh);
    if (it.superset) byLetter.set(it.superset, fresh);
  }
  return out;
}

function onePlan(items: TodayItem[], c: TodayChange, facts: Facts): TodayItem[] | Refusal {
  if (c.action === 'break_superset') {
    const letter = c.superset_letter ?? (c.exercise_id ? items.find((i) => i.exerciseId === c.exercise_id)?.superset ?? null : null);
    if (!letter || items.filter((i) => i.superset === letter).length < 2) return refuse(`Superset ${letter ?? ''} is not in today's workout.`.replace('  ', ' '));
    return items.map((i) => (i.superset === letter ? { ...i, superset: null } : i));
  }
  if (c.action === 'add') {
    const f = usable(facts, c.exercise_id);
    if ('ok' in f) return f;
    const it: TodayItem = { exerciseId: f.id, sets: c.sets, reps: c.reps, rest: c.rest_seconds ?? null, superset: null, weightLb: f.unit === 'bw' ? null : c.weight_lb ?? null };
    const ps = places(items);
    const at = c.position == null ? ps.length : Math.max(0, Math.min(ps.length, c.position - 1));
    ps.splice(at, 0, [it]);
    return ps.flat();
  }
  const i = items.findIndex((x) => x.exerciseId === c.exercise_id);
  if (i < 0) return refuse(`${nameOf(facts, c.exercise_id)} is not in today's workout.`);
  const it = items[i];
  const sameGroup = (x: TodayItem) => x === it || (!!it.superset && x.superset === it.superset);
  switch (c.action) {
    case 'swap': {
      const f = usable(facts, c.to_exercise_id);
      if ('ok' in f) return f;
      return items.map((x, j) => (j === i ? { ...x, exerciseId: f.id, weightLb: null } : x));
    }
    case 'set_sets': return items.map((x) => (sameGroup(x) ? { ...x, sets: c.sets } : x));
    case 'set_reps': return items.map((x, j) => (j === i ? { ...x, reps: c.reps } : x));
    case 'set_weight': {
      if (facts(it.exerciseId)?.unit === 'bw') return refuse(`${nameOf(facts, it.exerciseId)} is a bodyweight exercise and has no weight.`);
      return items.map((x, j) => (j === i ? { ...x, weightLb: c.weight_lb } : x));
    }
    case 'set_rest': return items.map((x) => (sameGroup(x) ? { ...x, rest: c.rest_seconds } : x));
    case 'remove': {
      if (items.length === 1) return refuse(`${nameOf(facts, it.exerciseId)} is the only exercise in today's workout.`);
      const left = items.filter((_, j) => j !== i);
      if (it.superset && left.filter((x) => x.superset === it.superset).length === 1) return left.map((x) => (x.superset === it.superset ? { ...x, superset: null } : x));
      return left;
    }
    case 'reorder': {
      const ps = places(items);
      const from = ps.findIndex((p) => p.includes(it));
      const [moved] = ps.splice(from, 1);
      ps.splice(Math.max(0, Math.min(ps.length, c.position - 1)), 0, moved);
      return ps.flat();
    }
  }
}

/** Applies a card's changes to today's prepared plan (no workout running yet), all of them or none. */
export function applyToPlan(items: TodayItem[], changes: TodayChange[], facts: Facts): { ok: true; items: TodayItem[] } | Refusal {
  let out = items;
  for (const c of changes) {
    const r = onePlan(out, c, facts);
    if ('ok' in r) return r;
    out = r;
  }
  return { ok: true, items: out };
}

/** A prepared plan's items as the account stores them (today_plans.plan, src/rules/today.ts planItems). */
export const planRows = (items: TodayItem[]) => items.map((i) => ({
  exercise_id: i.exerciseId, sets: i.sets, reps: i.reps,
  ...(i.rest != null ? { rest_seconds: i.rest } : {}),
  ...(i.superset ? { superset_letter: i.superset } : {}),
  ...(i.weightLb != null ? { weight_lb: i.weightLb } : {}),
}));
