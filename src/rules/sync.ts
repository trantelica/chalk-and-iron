// Saving a workout to the account, and sending changes made offline (design
// Section 6). Plain functions with no network and no storage, so the tests
// can run them directly:
//   * the rows a phone Session becomes in the account tables, and back;
//   * the changes between two states of a session, each one a self-contained
//     instruction the server can apply (and safely apply twice);
//   * the outbox queue: changes in the order they were made, with a later
//     copy of the same thing folded into an unsent earlier one;
//   * "what the phone knows about past sessions", built from the server's answer.

import { blockBudget, uid, type Block, type History, type PastSession, type Session, type SessionExercise } from './session';
import type { ExerciseUnit } from './units';
import type { SetType } from './workout';

export type ChangeKind = 'session.put' | 'set.put' | 'set.delete' | 'session.finish_other' | 'rest.set' | 'display_unit.put' | 'note.put';

export interface Change {
  id: string; // made on the phone; the server remembers it, so a resend does nothing
  kind: ChangeKind;
  data: Record<string, unknown>;
  at: number; // when the phone made it
  key?: string; // what it is about, for folding a later copy into an earlier one
}

export type NewChange = Omit<Change, 'id' | 'at'>;

const iso = (ms: number | null | undefined) => (ms === null || ms === undefined ? null : new Date(ms).toISOString());
const ms = (v: unknown) => (v === null || v === undefined ? null : v instanceof Date ? v.getTime() : Date.parse(String(v)));
const dateOnly = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10);
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const r3 = (n: number) => Math.round(n * 1000) / 1000;

// ---------------------------------------------------------------- phone -> rows

/** The block an exercise is done in now (a broken superset still lists its members). */
function openBlockOf(s: Session, key: string): Block {
  return s.blocks.find((b) => !b.closed && b.members.includes(key)) ?? s.blocks.find((b) => b.members.includes(key))!;
}

export function exerciseState(s: Session, e: SessionExercise): 'open' | 'done' | 'skipped' {
  if (e.skipped) return 'skipped';
  if (e.logs.length >= e.types.length) return 'done';
  if (s.endedAt !== null) return e.logs.length ? 'done' : 'skipped';
  return 'open';
}

/** The session as rows for sessions, session_blocks and session_exercises (not its sets). */
export function sessionRows(s: Session) {
  const finished = s.endedAt !== null;
  const session = {
    id: s.id,
    local_date: s.day,
    source_kind: 'ad_hoc',
    workout_id: s.workoutId ?? null,
    workout_name: s.name,
    started_at: iso(s.startedAt),
    ended_at: iso(s.endedAt),
    status: finished ? 'finished' : 'active',
    finish_reason: finished ? s.finishReason ?? 'user' : null,
    clock_banked_seconds: r3(s.clock.banked),
    clock_running_since: iso(s.clock.since),
    rest_ends_at: iso(s.restEndsAt),
    rest_total_seconds: s.restEndsAt === null ? null : Math.round(s.restTotal),
    current_session_exercise_id: s.curMember,
    last_activity_at: iso(s.lastActivityAt),
    break_undo: s.breakUndo,
  };
  const blocks = s.blocks.map((b, position) => ({
    id: b.id,
    position,
    superset_letter: b.letter,
    time_budget_seconds: Math.round(blockBudget(s, b)),
    clock_started_at: b.started ? iso(b.startedAt ?? s.startedAt) : null,
    clock_banked_seconds: r3(b.clock.banked),
    clock_running_since: iso(b.clock.since),
    clock_stopped_at: b.stopped ? iso(b.stoppedAt ?? s.lastActivityAt) : null,
    broken_at: b.closed ? iso(b.brokenAt ?? s.lastActivityAt) : null,
    broken_from_block_id: b.brokenFrom,
    members_at_break: b.closed ? b.members : null,
    sets_done_at_break: b.closed ? b.closedDone : null,
    sets_planned_at_break: b.closed ? b.closedPlanned : null,
  }));
  const exercises = Object.values(s.exercises).map((e) => {
    const b = openBlockOf(s, e.key);
    return {
      id: e.key,
      block_id: b.id,
      exercise_id: e.exerciseId,
      exercise_name_then: e.name,
      position_in_block: Math.max(0, b.members.indexOf(e.key)),
      planned_set_types: e.types,
      planned_reps: e.plannedReps,
      planned_weight_lb: e.plannedWeightLb,
      seed_weights_lb: e.seeds.some((x) => x !== null) ? e.seeds : null,
      planned_rest_seconds: e.rest,
      work_seconds: e.work,
      state: exerciseState(s, e),
      origin: e.origin ?? 'plan',
      swapped_from_exercise_id: e.swappedFrom ?? null,
      sets_before_break: b.brokenFrom ? b.baseLogged : null,
    };
  });
  return { session, blocks, exercises };
}

/** One logged set as a set_logs row. Records are left to the server. */
export function setRow(e: SessionExercise, index: number) {
  const l = e.logs[index];
  return {
    id: l.id,
    session_exercise_id: e.key,
    set_number: index + 1,
    weight_lb: l.lb,
    entered_value: l.enteredValue,
    entered_unit: l.enteredUnit,
    reps: l.reps,
    set_type: l.type,
    rpe: l.rpe,
    logged_at: iso(l.loggedAt),
  };
}

// ---------------------------------------------------------------- changes between two states

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The changes that turn the server's copy of `prev` into `next`, in an order
 * the server can apply: deleted sets first, then the session and its plan,
 * then new or edited sets (lowest set number first, so a set that moved up
 * after a delete never meets the one it replaces), then the rest alert.
 * `prev` is null for a session the server has never seen.
 */
export function sessionChanges(prev: Session | null, next: Session): NewChange[] {
  const out: NewChange[] = [];
  const before = new Map<string, { row: ReturnType<typeof setRow> }>();
  if (prev && prev.id === next.id) {
    for (const e of Object.values(prev.exercises)) e.logs.forEach((_, i) => before.set(e.logs[i].id, { row: setRow(e, i) }));
  }
  const after = new Map<string, ReturnType<typeof setRow>>();
  for (const e of Object.values(next.exercises)) e.logs.forEach((_, i) => after.set(e.logs[i].id, setRow(e, i)));

  for (const id of before.keys()) {
    if (!after.has(id)) out.push({ kind: 'set.delete', data: { id, deleted_at: iso(next.lastActivityAt) }, key: `set:${id}` });
  }
  const rows = sessionRows(next);
  if (!prev || prev.id !== next.id || !same(sessionRows(prev), rows)) {
    out.push({ kind: 'session.put', data: rows, key: `session:${next.id}` });
  }
  const puts = [...after.values()].filter((r) => !before.has(r.id) || !same(before.get(r.id)!.row, r));
  puts.sort((a, b) => a.set_number - b.set_number);
  for (const r of puts) out.push({ kind: 'set.put', data: r, key: `set:${r.id}` });

  const restWas = prev && prev.id === next.id && prev.endedAt === null ? prev.restEndsAt : null;
  const restNow = next.endedAt === null ? next.restEndsAt : null;
  if (restWas !== restNow) out.push(restChange(next.id, restNow));
  return out;
}

/** Tells the server when rest ends, or that no rest alert is wanted (null). */
export const restChange = (sessionId: string, endsAt: number | null): NewChange => ({
  kind: 'rest.set', data: { session_id: sessionId, fire_at: iso(endsAt) }, key: `rest:${sessionId}`,
});

export const unitChange = (exerciseId: string, unit: 'lb' | 'kg'): NewChange => ({
  kind: 'display_unit.put', data: { exercise_id: exerciseId, unit }, key: `unit:${exerciseId}`,
});

export const noteChange = (exerciseId: string, note: string): NewChange => ({
  kind: 'note.put', data: { exercise_id: exerciseId, note: note.slice(0, 500) }, key: `note:${exerciseId}`,
});

export const finishOtherChange = (sessionId: string): NewChange => ({ kind: 'session.finish_other', data: { session_id: sessionId } });

// ---------------------------------------------------------------- the outbox queue

const FOLDS: ChangeKind[] = ['session.put', 'set.put', 'rest.set', 'display_unit.put', 'note.put'];

/**
 * Adds changes to the end of the queue. A change about the same thing as an
 * earlier one that is not being sent right now replaces it in its place, with
 * a new id: it holds the whole latest state, so the earlier copy is not needed.
 * A set's edit is folded only when no delete waits after it, so a set that
 * moved up after a delete still reaches the server after that delete.
 */
export function enqueue(queue: Change[], changes: NewChange[], inFlight: ReadonlySet<string>, now: number): Change[] {
  const q = queue.slice();
  for (const c of changes) {
    const full: Change = { ...c, id: uid('c'), at: now };
    let i = -1;
    if (c.key && FOLDS.includes(c.kind)) {
      i = q.findIndex((x) => x.key === c.key && x.kind === c.kind && !inFlight.has(x.id));
      if (i >= 0 && c.kind === 'set.put' && q.slice(i + 1).some((x) => x.kind === 'set.delete')) i = -1;
    }
    if (i >= 0) q[i] = full; else q.push(full);
  }
  return q;
}

/** The server's answer to a list of changes. */
export interface SyncAnswer {
  done: string[];
  rejected: { id: string; reason: string }[];
  conflict: null | { code: 'other_active'; session_id: string; workout_name: string; started_at: string; last_activity_at: string; change_id: string };
  records: Record<string, string[]>;
}

/** What is left in the queue once the server has answered. */
export function settle(queue: Change[], answer: SyncAnswer): Change[] {
  const gone = new Set([...answer.done, ...answer.rejected.map((r) => r.id)]);
  return queue.filter((c) => !gone.has(c.id));
}

/** The lb/kg choices and notes still waiting to be sent: they show over the server's. */
export function pendingChoices(queue: readonly Change[]) {
  const units: Record<string, 'lb' | 'kg'> = {};
  const notes: Record<string, string> = {};
  for (const c of queue) {
    if (c.kind === 'display_unit.put') units[c.data.exercise_id as string] = c.data.unit as 'lb' | 'kg';
    if (c.kind === 'note.put') notes[c.data.exercise_id as string] = c.data.note as string;
  }
  return { units, notes };
}

/** Puts the server's records on the session's sets. The server's answer wins (design Section 6). */
export function applyServerRecords(s: Session, records: Record<string, string[]>): Session {
  let changed = false;
  const exercises: Session['exercises'] = {};
  for (const [k, e] of Object.entries(s.exercises)) {
    const logs = e.logs.map((l) => {
      const r = records[l.id];
      if (!r || same(r, l.records)) return l;
      changed = true;
      return { ...l, records: r as typeof l.records };
    });
    exercises[k] = logs === e.logs ? e : { ...e, logs };
  }
  return changed ? { ...s, exercises } : s;
}

// ---------------------------------------------------------------- rows -> phone

export interface LibraryFacts {
  name: string; muscle: string; equipment: string; unit: ExerciseUnit; assisted: boolean; loadCount: number;
  alternates: SessionExercise['alternates'];
}

type Row = Record<string, unknown>;

/**
 * Rebuilds a phone Session from the account's rows, to resume a workout on
 * another device. Names and kinds come from the library as it is now.
 */
export function sessionFromRows(
  session: Row, blocks: Row[], exercises: Row[], sets: Row[], lib: (id: string) => LibraryFacts | undefined,
): Session {
  const setsBy = new Map<string, Row[]>();
  for (const l of sets) {
    if (l.deleted_at) continue;
    const k = String(l.session_exercise_id);
    setsBy.set(k, [...(setsBy.get(k) ?? []), l]);
  }
  const exOut: Record<string, SessionExercise> = {};
  for (const x of exercises) {
    const key = String(x.id);
    const facts = lib(String(x.exercise_id));
    const types = (x.planned_set_types as SetType[]) ?? [];
    const logs = (setsBy.get(key) ?? []).sort((a, b) => Number(a.set_number) - Number(b.set_number)).map((l) => ({
      id: String(l.id),
      lb: num(l.weight_lb),
      enteredValue: Number(l.entered_value),
      enteredUnit: l.entered_unit as 'lb' | 'kg' | 'bw',
      reps: Number(l.reps),
      type: l.set_type as SetType,
      rpe: num(l.rpe),
      loggedAt: ms(l.logged_at) ?? 0,
      records: ((l.record_types as string[]) ?? []) as SessionExercise['logs'][number]['records'],
    }));
    exOut[key] = {
      key,
      exerciseId: String(x.exercise_id),
      name: facts?.name ?? String(x.exercise_name_then),
      muscle: facts?.muscle ?? '',
      equipment: facts?.equipment ?? '',
      unit: facts?.unit ?? (logs.some((l) => l.enteredUnit === 'bw') ? 'bw' : 'lb'),
      assisted: facts?.assisted ?? false,
      loadCount: facts?.loadCount ?? 1,
      work: Number(x.work_seconds),
      rest: Number(x.planned_rest_seconds),
      plannedReps: Number(x.planned_reps),
      plannedWeightLb: num(x.planned_weight_lb),
      seeds: x.seed_weights_lb ? (x.seed_weights_lb as unknown[]).map(num) : types.map(() => null),
      types,
      logs,
      skipped: x.state === 'skipped',
      alternates: facts?.alternates ?? [],
      origin: (x.origin as SessionExercise['origin']) ?? 'plan',
      swappedFrom: (x.swapped_from_exercise_id as string | null) ?? null,
    };
  }
  const ordered = blocks.slice().sort((a, b) => Number(a.position) - Number(b.position));
  const blockOut: Block[] = ordered.map((b) => {
    const id = String(b.id);
    const closed = b.broken_at !== null && b.broken_at !== undefined;
    const members = closed
      ? ((b.members_at_break as string[]) ?? [])
      : exercises.filter((x) => String(x.block_id) === id).sort((p, q) => Number(p.position_in_block) - Number(q.position_in_block)).map((x) => String(x.id));
    const brokenFrom = (b.broken_from_block_id as string | null) ?? null;
    const first = exercises.find((x) => String(x.id) === members[0]);
    return {
      id,
      letter: (b.superset_letter as string | null) ?? null,
      members,
      clock: { banked: Number(b.clock_banked_seconds ?? 0), since: ms(b.clock_running_since) },
      started: b.clock_started_at !== null && b.clock_started_at !== undefined,
      stopped: b.clock_stopped_at !== null && b.clock_stopped_at !== undefined,
      baseLogged: brokenFrom && first ? Number(first.sets_before_break ?? 0) : 0,
      closed,
      fixedBudget: closed || brokenFrom ? Number(b.time_budget_seconds) : null,
      closedDone: closed ? Number(b.sets_done_at_break ?? 0) : 0,
      closedPlanned: closed ? Number(b.sets_planned_at_break ?? 0) : 0,
      brokenFrom,
      startedAt: ms(b.clock_started_at),
      stoppedAt: ms(b.clock_stopped_at),
      brokenAt: ms(b.broken_at),
    };
  });
  const curMember = String(session.current_session_exercise_id ?? blockOut.find((b) => !b.closed)?.members[0] ?? '');
  const curBlock = blockOut.find((b) => !b.closed && b.members.includes(curMember)) ?? blockOut.find((b) => !b.closed)!;
  return {
    id: String(session.id),
    name: String(session.workout_name),
    day: dateOnly(session.local_date),
    startedAt: ms(session.started_at) ?? 0,
    endedAt: ms(session.ended_at),
    clock: { banked: Number(session.clock_banked_seconds ?? 0), since: ms(session.clock_running_since) },
    exercises: exOut,
    blocks: blockOut,
    curBlock: curBlock.id,
    curMember: curBlock.members.includes(curMember) ? curMember : curBlock.members[0],
    restEndsAt: ms(session.rest_ends_at),
    restTotal: Number(session.rest_total_seconds ?? 0),
    breakUndo: (session.break_undo as Block[] | null) ?? null,
    lastActivityAt: ms(session.last_activity_at) ?? ms(session.started_at) ?? 0,
    workoutId: (session.workout_id as string | null) ?? null,
    finishReason: (session.finish_reason as Session['finishReason']) ?? null,
  };
}

// ---------------------------------------------------------------- past sessions from the server

/** A row of public.exercise_memory(). */
export interface MemoryRow {
  exercise_id: string; session_id: string; local_date: string | Date; started_at: string | Date; set_number: number;
  weight_lb: number | string | null; entered_value: number | string; entered_unit: string; reps: number; set_type: string; recent: boolean;
}

/**
 * Builds what the phone knows about past sessions from the server's answer:
 * the last few sessions of each exercise in full, and older record-holding
 * sets as "extra" entries, counted for records but not shown as a session.
 */
export function historyFromMemory(rows: MemoryRow[]): History {
  const out: History = {};
  const groups = new Map<string, PastSession>();
  for (const r of rows) {
    const k = `${r.exercise_id}|${r.session_id}|${r.recent ? 'r' : 'x'}`;
    let g = groups.get(k);
    if (!g) {
      g = { day: dateOnly(r.local_date), sessionId: r.session_id, startedAt: ms(r.started_at) ?? 0, sets: [], extra: !r.recent };
      groups.set(k, g);
      (out[r.exercise_id] ??= []).push(g);
    }
    g.sets.push({ lb: num(r.weight_lb), reps: Number(r.reps), type: r.set_type as SetType });
  }
  for (const list of Object.values(out)) list.sort((a, b) => (a.day === b.day ? (a.startedAt ?? 0) - (b.startedAt ?? 0) : a.day < b.day ? -1 : 1));
  return out;
}

/**
 * The server's history, with sessions finished on this phone that the server
 * has not heard of yet, and without the session running now (which the
 * phone counts itself).
 */
export function mergeHistory(server: History, local: History, activeId: string | null): History {
  const out: History = {};
  const ids = new Set<string>();
  for (const [ex, list] of Object.entries(server)) for (const p of list) if (p.sessionId) ids.add(`${ex}|${p.sessionId}`);
  const keys = new Set([...Object.keys(server), ...Object.keys(local)]);
  for (const ex of keys) {
    const list = [...(server[ex] ?? []), ...(local[ex] ?? []).filter((p) => !p.sessionId || !ids.has(`${ex}|${p.sessionId}`))]
      .filter((p) => !activeId || p.sessionId !== activeId);
    list.sort((a, b) => (a.day === b.day ? (a.startedAt ?? 0) - (b.startedAt ?? 0) : a.day < b.day ? -1 : 1));
    if (list.length) out[ex] = list;
  }
  return out;
}
