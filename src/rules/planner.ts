// The browser planner's rules (spec Section 5, "Browser planner"; Section 10).
// Plain functions over rows, so the tests can run them without a screen.

import { addDays, mondayOf } from './days';
import { findNearDuplicate, nameKey } from './names';
import { supersetProblems } from './supersets';
import { budgetSingle, budgetSuperset, efficiency, setVolume, type ExerciseKind } from './workout';
import { fromPounds, KG_PER_LB } from './units';

// ---------------------------------------------------------------- exercise names

export interface NamedExercise { id: string; name: string; archived: boolean }

export interface NameCheck {
  /** Cannot be saved: empty, or the same name as a live exercise (the database refuses it too). */
  error: string | null;
  /** Can be saved, but the person should look first: a near-duplicate of a live exercise. */
  warning: string | null;
}

/**
 * Checks a new or renamed exercise name (spec Section 2: the app warns when a
 * new name is a near-duplicate). Archived exercises are not in the way: the
 * database keeps names unique only among live exercises.
 */
export function checkExerciseName(name: string, all: NamedExercise[], selfId: string | null = null): NameCheck {
  const clean = name.trim();
  if (!clean) return { error: 'A name is needed.', warning: null };
  if (clean.length > 120) return { error: 'A name can have at most 120 characters.', warning: null };
  const live = all.filter((x) => !x.archived && x.id !== selfId);
  const same = live.find((x) => x.name.trim().toLowerCase() === clean.toLowerCase());
  if (same) return { error: `"${same.name}" is already in your library.`, warning: null };
  const near = findNearDuplicate(clean, live.map((x) => x.name));
  return { error: null, warning: near ? `This looks like "${near}", which is already in your library.` : null };
}

/** Which live exercises a name nearly duplicates, for showing next to a table. */
export function nearDuplicateGroups(all: NamedExercise[]): Map<string, string[]> {
  const byKey = new Map<string, NamedExercise[]>();
  for (const x of all.filter((y) => !y.archived)) {
    const k = nameKey(x.name);
    byKey.set(k, [...(byKey.get(k) ?? []), x]);
  }
  const out = new Map<string, string[]>();
  for (const list of byKey.values()) if (list.length > 1) for (const x of list) out.set(x.id, list.filter((y) => y.id !== x.id).map((y) => y.name));
  return out;
}

// ---------------------------------------------------------------- workout rows

export interface WorkoutRow {
  id: string;
  exerciseId: string;
  sets: number;
  reps: number;
  rest: number | null;
  superset: string | null;
}

/**
 * Changing the sets of one superset member changes every member, so supersets
 * stay equal (spec Section 5). A row outside a superset changes alone.
 */
export function setRowSets<T extends { sets: number; superset: string | null }>(rows: T[], index: number, sets: number): T[] {
  const n = Math.min(12, Math.max(1, Math.round(sets)));
  const letter = rows[index]?.superset ?? null;
  return rows.map((r, i) => (i === index || (letter !== null && r.superset === letter) ? { ...r, sets: n } : r));
}

/**
 * Gives a row a superset letter, or none. A row joining a superset takes the
 * set count of the members already there (spec Section 5). Returns a problem
 * in words when the superset would hold more than three.
 */
export function setRowSuperset<T extends { sets: number; superset: string | null }>(
  rows: T[], index: number, letter: string | null,
): { rows: T[]; problem: string | null } {
  if (letter === null || letter === '') return { rows: rows.map((r, i) => (i === index ? { ...r, superset: null } : r)), problem: null };
  const members = rows.filter((r, i) => i !== index && r.superset === letter);
  if (members.length >= 3) return { rows, problem: `Superset ${letter} already holds three exercises. A superset holds two or three.` };
  const sets = members.length ? members[0].sets : rows[index].sets;
  return { rows: rows.map((r, i) => (i === index ? { ...r, superset: letter, sets } : r)), problem: null };
}

/**
 * Starts a new superset from one row (review finding 1, 23 Nov): a superset of
 * one cannot be saved, so the row is paired at once with a partner, the next
 * row not already in a superset (or else the one before), which takes its set
 * count. The person can then change either row's letter or add a third.
 */
export function startSuperset<T extends { sets: number; superset: string | null }>(rows: T[], index: number): { rows: T[]; problem: string | null } {
  const free = (i: number) => i >= 0 && i < rows.length && i !== index && !rows[i].superset;
  const partner = free(index + 1) ? index + 1 : free(index - 1) ? index - 1 : rows.findIndex((_, i) => free(i));
  if (partner < 0) return { rows, problem: 'A new superset needs a second exercise that is not already in one. Add one first.' };
  const letter = nextSupersetLetter(rows);
  const sets = rows[index].sets;
  return { rows: rows.map((r, i) => (i === index ? { ...r, superset: letter } : i === partner ? { ...r, superset: letter, sets } : r)), problem: null };
}

/** One campaign day's set count for one row, as the Workouts screen writes it (null: follow the workout). */
export interface DaySets { campaignDayId: string; workoutItemId: string; sets: number | null }

/**
 * The day overrides a workout save needs so that every superset stays even on
 * every campaign day that uses the workout (spec Section 10, "Supersets"; review
 * at high effort, 23 Nov). A day may override a row's sets; when that row joins
 * a superset, or another row joins its superset, the day would be uneven and
 * the database would refuse the save. An exercise joining a superset takes its
 * set count, on each day as in the workout: the count of the members already
 * there (or, for a new superset, of the row that started it), as that day has it.
 */
export function daySetsForSupersets(
  before: { id: string; superset: string | null }[],
  after: { id: string; sets: number; superset: string | null }[],
  dayIds: string[],
  overrides: { campaignDayId: string; workoutItemId: string; sets: number | null }[],
  startedBy: string | null = null,
): DaySets[] {
  const out: DaySets[] = [];
  const letters = [...new Set(after.map((r) => r.superset).filter((l): l is string => !!l))];
  for (const day of dayIds) {
    const ov = new Map(overrides.filter((o) => o.campaignDayId === day).map((o) => [o.workoutItemId, o.sets]));
    for (const letter of letters) {
      const members = after.filter((r) => r.superset === letter);
      const count = (r: { id: string; sets: number }) => ov.get(r.id) ?? r.sets;
      if (new Set(members.map(count)).size <= 1) continue;
      const already = new Set(before.filter((r) => r.superset === letter).map((r) => r.id));
      const anchor = members.find((m) => already.has(m.id)) ?? members.find((m) => m.id === startedBy) ?? members[0];
      const target = count(anchor);
      for (const m of members) if (count(m) !== target) out.push({ campaignDayId: day, workoutItemId: m.id, sets: target === m.sets ? null : target });
    }
  }
  return out;
}

/** Problems that stop a workout being saved: every superset holds two or three with equal sets. */
export function workoutProblems(rows: { sets: number; superset: string | null }[]): string[] {
  return supersetProblems(rows.map((r) => ({ sets: r.sets, superset: r.superset })));
}

/** The next unused superset letter. */
export function nextSupersetLetter(rows: { superset: string | null }[]): string {
  const used = new Set(rows.map((r) => r.superset).filter(Boolean));
  for (const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (!used.has(c)) return c;
  return 'Z';
}

export function moveRow<T>(rows: T[], index: number, delta: -1 | 1): T[] {
  const j = index + delta;
  if (j < 0 || j >= rows.length) return rows;
  const out = rows.slice();
  [out[index], out[j]] = [out[j], out[index]];
  return out;
}

/** A copy's name: "Push day" becomes "Push day (copy)", then "Push day (copy 2)". */
export function copyName(name: string, taken: string[]): string {
  const lower = new Set(taken.map((t) => t.toLowerCase()));
  const base = name.replace(/ \(copy( \d+)?\)$/, '');
  let candidate = `${base} (copy)`;
  for (let n = 2; lower.has(candidate.toLowerCase()); n++) candidate = `${base} (copy ${n})`;
  return candidate;
}

// ---------------------------------------------------------------- budgets

export interface TimingExercise { work: number; rest: number }

/** The time budget the planner shows beside a row (spec Section 3). */
export function rowBudget(
  rows: { exerciseId: string; sets: number; rest: number | null; superset: string | null }[],
  index: number,
  exercise: (id: string) => TimingExercise | undefined,
): number {
  const r = rows[index];
  const ex = exercise(r.exerciseId);
  if (!ex) return 0;
  if (!r.superset) return budgetSingle(r.sets, ex.work, r.rest ?? ex.rest);
  const members = rows.filter((x) => x.superset === r.superset);
  const works = members.map((m) => exercise(m.exerciseId)?.work ?? 0);
  const first = members[0];
  return budgetSuperset(r.sets, works, first.rest ?? exercise(first.exerciseId)?.rest ?? 0);
}

// ---------------------------------------------------------------- day overrides

export interface OverrideRow {
  id?: string;
  campaignDayId: string;
  workoutItemId: string;
  exerciseId: string | null;
  sets: number | null;
  reps: number | null;
  weightLb: number | null;
  weightValue: number | null;
  weightUnit: 'lb' | 'kg' | null;
  rest: number | null;
}

export interface EffectiveRow extends WorkoutRow {
  /** The library's value for each field the day overrides, shown beside the override. */
  library: { exerciseId?: string; sets?: number; reps?: number; rest?: number | null; weight?: true };
  weightLb: number | null;
  weightValue: number | null;
  weightUnit: 'lb' | 'kg' | null;
}

/** A day's rows: the workout's current rows with that day's overrides on top. */
export function effectiveRows(rows: WorkoutRow[], overrides: OverrideRow[]): EffectiveRow[] {
  return rows.map((r) => {
    const o = overrides.find((x) => x.workoutItemId === r.id);
    const library: EffectiveRow['library'] = {};
    if (o?.exerciseId && o.exerciseId !== r.exerciseId) library.exerciseId = r.exerciseId;
    if (o?.sets !== null && o?.sets !== undefined && o.sets !== r.sets) library.sets = r.sets;
    if (o?.reps !== null && o?.reps !== undefined && o.reps !== r.reps) library.reps = r.reps;
    if (o?.rest !== null && o?.rest !== undefined && o.rest !== r.rest) library.rest = r.rest;
    if (o?.weightLb !== null && o?.weightLb !== undefined) library.weight = true;
    return {
      ...r,
      exerciseId: o?.exerciseId ?? r.exerciseId,
      sets: o?.sets ?? r.sets,
      reps: o?.reps ?? r.reps,
      rest: o?.rest ?? r.rest,
      library,
      weightLb: o?.weightLb ?? null,
      weightValue: o?.weightValue ?? null,
      weightUnit: o?.weightUnit ?? null,
    };
  });
}

export type OverrideField = 'exerciseId' | 'sets' | 'reps' | 'rest' | 'weight';

/**
 * The override rows to write when one field of one row changes on a day. A
 * value equal to the library's clears that override. A sets override on one
 * superset member goes to every member, so the day's superset stays even
 * (spec Section 5). Everything is returned as rows to write in ONE request,
 * because the database checks supersets when a change is committed: members
 * written one at a time would pass through an uneven state. A row left with
 * nothing overridden is kept, empty, rather than deleted in a second request.
 */
export function overrideChange(
  rows: WorkoutRow[],
  overrides: OverrideRow[],
  dayId: string,
  itemId: string,
  field: OverrideField,
  value: number | string | { lb: number; value: number; unit: 'lb' | 'kg' } | null,
): OverrideRow[] {
  const row = rows.find((r) => r.id === itemId);
  if (!row) return [];
  const targets = field === 'sets' && row.superset ? rows.filter((r) => r.superset === row.superset) : [row];
  const upsert: OverrideRow[] = [];
  for (const t of targets) {
    const cur: OverrideRow = overrides.find((o) => o.workoutItemId === t.id) ?? {
      campaignDayId: dayId, workoutItemId: t.id, exerciseId: null, sets: null, reps: null, weightLb: null, weightValue: null, weightUnit: null, rest: null,
    };
    const next: OverrideRow = { ...cur };
    if (field === 'exerciseId') next.exerciseId = value === null || value === t.exerciseId ? null : String(value);
    if (field === 'sets') next.sets = value === null || Number(value) === t.sets ? null : Number(value);
    if (field === 'reps') next.reps = value === null || Number(value) === t.reps ? null : Number(value);
    if (field === 'rest') next.rest = value === null || Number(value) === t.rest ? null : Number(value);
    if (field === 'weight') {
      const w = value as { lb: number; value: number; unit: 'lb' | 'kg' } | null;
      next.weightLb = w ? w.lb : null; next.weightValue = w ? w.value : null; next.weightUnit = w ? w.unit : null;
    }
    upsert.push(next);
  }
  return upsert;
}

/** True when a row overrides anything at all. */
export const overridesAny = (o: OverrideRow) =>
  o.exerciseId !== null || o.sets !== null || o.reps !== null || o.rest !== null || o.weightLb !== null;

/** Removing a workout row. A superset left with one member stops being a superset. */
export function removeRow<T extends { superset: string | null }>(rows: T[], index: number): T[] {
  const gone = rows[index];
  const rest = rows.filter((_, i) => i !== index);
  if (!gone?.superset) return rest;
  const left = rest.filter((r) => r.superset === gone.superset);
  return left.length === 1 ? rest.map((r) => (r.superset === gone.superset ? { ...r, superset: null } : r)) : rest;
}

// ---------------------------------------------------------------- campaigns

/** The last Sunday a campaign covers, counting blank (shifted) weeks. */
export function campaignEndDate(startDate: string, weekCount: number, blankWeeks: string[] = []): string {
  return addDays(mondayOf(startDate), 7 * (weekCount + blankWeeks.length) - 1);
}

/** True when the campaign's last day has passed (spec Section 2: ask the coach for the next one). */
export function campaignIsOver(today: string, startDate: string, weekCount: number, blankWeeks: string[] = []): boolean {
  return today > campaignEndDate(startDate, weekCount, blankWeeks);
}

/**
 * The week a shift leaves blank: the week holding today, or the campaign's
 * first week when it has not started; and if that week is already blank, the
 * next one along, so every shift pushes the days after it back one more week.
 */
export function nextBlankWeek(today: string, startDate: string, blankWeeks: string[]): string {
  let week = mondayOf(today > startDate ? today : startDate);
  while (blankWeeks.includes(week)) week = addDays(week, 7);
  return week;
}

/** The calendar date of a campaign's week and weekday, counting blank weeks that come before it. */
export function dateOfCampaignDay(startDate: string, week: number, weekday: number, blankWeeks: string[] = []): string {
  let monday = addDays(mondayOf(startDate), 7 * (week - 1));
  const sorted = blankWeeks.slice().sort();
  for (const b of sorted) if (b <= monday) monday = addDays(monday, 7);
  return addDays(monday, weekday - 1);
}

/** Whether activating a campaign needs a confirmation: another one is active. */
export function activationNeedsConfirm(campaigns: { id: string; name: string; status: string }[], id: string): string | null {
  const other = campaigns.find((c) => c.status === 'active' && c.id !== id);
  return other ? other.name : null;
}

// ---------------------------------------------------------------- the view toggle

export type ViewUnit = 'lb' | 'kg';

/** A weight for the planner's pounds or kilograms view toggle: pounds stored, converted to one decimal. */
export function viewWeight(lb: number, view: ViewUnit): string {
  const n = view === 'lb' ? Math.round(lb * 1000) / 1000 : fromPounds(lb, 'kg');
  const text = Number.isInteger(n) ? String(n) : view === 'lb' ? String(n) : n.toFixed(1).replace(/\.0$/, '');
  return `${text} ${view}`;
}

/** The heaviest weight a day may plan: the same limit the account checks when a sent day is accepted (review finding 6). */
export const MAX_PLAN_LB = 2000;
/** That limit in the view unit, rounded down. */
export const maxPlanWeight = (view: ViewUnit): number => (view === 'lb' ? MAX_PLAN_LB : Math.floor(MAX_PLAN_LB * KG_PER_LB));

/** Pounds from what was typed in the view unit. */
export function typedToPounds(value: number, view: ViewUnit): number {
  const lb = view === 'lb' ? value : value / KG_PER_LB;
  return Math.round(lb * 1000) / 1000;
}

// ---------------------------------------------------------------- sending a day

export interface PlanItemOut {
  exercise_id: string;
  sets: number;
  reps: number;
  rest_seconds?: number;
  superset_letter?: string;
  weight_lb?: number;
}

/** A day's rows as the plan a phone starts from (the `today_plans.plan` format, `src/rules/today.ts`). */
export function planFromRows(rows: EffectiveRow[]): PlanItemOut[] {
  return rows.map((r) => ({
    exercise_id: r.exerciseId,
    sets: r.sets,
    reps: r.reps,
    ...(r.rest !== null ? { rest_seconds: r.rest } : {}),
    ...(r.superset ? { superset_letter: r.superset } : {}),
    ...(r.weightLb !== null ? { weight_lb: r.weightLb } : {}),
  }));
}

/** The card's plain-language lines: what would replace what (spec Section 5). */
export function sendSummary(newName: string, newCount: number, replaces: string): string[] {
  return [`${newName} (${newCount} exercise${newCount === 1 ? '' : 's'}) becomes today's workout.`, `It replaces ${replaces}.`, 'Your library and campaign stay as they are.'];
}

// ---------------------------------------------------------------- history

export interface HistoryFact { lb: number | null; reps: number; type: 'warm_up' | 'working' | 'drop' }

/**
 * Deleting a logged set in a superset deletes its whole round for every
 * member (Nate, 19 Nov, spec Section 10). Returns the set ids to delete: the
 * set itself, plus the same-numbered set of each other member of its block.
 */
export function setsToDelete(
  set: { id: string; sessionExerciseId: string; setNumber: number },
  blockOf: (sessionExerciseId: string) => { block: string; members: string[] } | null,
  setsOf: (sessionExerciseId: string) => { id: string; setNumber: number }[],
): string[] {
  const b = blockOf(set.sessionExerciseId);
  if (!b || b.members.length < 2) return [set.id];
  const ids = [set.id];
  for (const m of b.members) {
    if (m === set.sessionExerciseId) continue;
    const twin = setsOf(m).find((x) => x.setNumber === set.setNumber);
    if (twin) ids.push(twin.id);
  }
  return ids;
}

// ---------------------------------------------------------------- session summaries

export interface HBlock {
  id: string; broken_at: string | null; time_budget_seconds: number; clock_started_at: string | null; clock_banked_seconds: number;
  sets_done_at_break: number | null; sets_planned_at_break: number | null;
}
export interface HExercise { id: string; block_id: string; exercise_id: string; state: string; planned: number; sets_before_break: number | null }
export interface HSet { id: string; session_exercise_id: string; lb: number | null; reps: number; type: 'warm_up' | 'working' | 'drop'; records: string[] }

export interface SessionSummary { elapsed: number; volumeLb: number; volumeBw: number; sets: number; records: number; efficiency: number | null }

/**
 * What History shows for a finished session, worked out from its rows. A
 * session is a frozen record (spec Section 10): this reads only what was
 * stored then. Efficiency counts every started block, with a skipped exercise
 * keeping only the sets it did and a broken superset keeping the sets logged
 * before the break (spec Sections 3 and 10).
 */
export function summarizeSession(input: {
  clockBanked: number; blocks: HBlock[]; exercises: HExercise[]; sets: HSet[]; kind: (exerciseId: string) => ExerciseKind;
}): SessionSummary {
  const exOf = new Map(input.exercises.map((e) => [e.id, e]));
  let volumeLb = 0;
  let volumeBw = 0;
  let records = 0;
  for (const st of input.sets) {
    const e = exOf.get(st.session_exercise_id);
    if (!e) continue;
    const kind = input.kind(e.exercise_id);
    const v = setVolume({ id: st.id, lb: st.lb, reps: st.reps, type: st.type, day: '', order: 0 }, kind);
    if (kind.unit === 'bw' || kind.assisted) volumeBw += v; else volumeLb += v;
    if (st.records.length) records += 1;
  }
  const done = (id: string) => input.sets.filter((x) => x.session_exercise_id === id).length;
  const parts = input.blocks.filter((b) => b.clock_started_at).flatMap((b) => {
    const members = input.exercises.filter((e) => e.block_id === b.id);
    if (b.broken_at) return [{ budget: b.time_budget_seconds, planned: b.sets_planned_at_break ?? 0, done: b.sets_done_at_break ?? 0, actual: b.clock_banked_seconds }];
    const loggedAll = members.reduce((n, e) => n + done(e.id) - (e.sets_before_break ?? 0), 0);
    if (members.length && members.every((e) => e.state === 'skipped' || e.state === 'replaced') && loggedAll <= 0) return [];
    const planned = members.reduce((n, e) => n + (e.state === 'skipped' || e.state === 'replaced' ? Math.max(0, done(e.id) - (e.sets_before_break ?? 0)) : e.planned - (e.sets_before_break ?? 0)), 0);
    return [{ budget: b.time_budget_seconds, planned, done: loggedAll, actual: b.clock_banked_seconds }];
  });
  return { elapsed: input.clockBanked, volumeLb, volumeBw, sets: input.sets.length, records, efficiency: efficiency(parts) };
}

/** Text for a session's volume: pounds, or kilograms in the view, plus bodyweight volume kept apart. */
export function volumeText(lb: number, bw: number, view: ViewUnit): string {
  const main = view === 'lb' ? Math.round(lb) : Math.round(lb * KG_PER_LB);
  const parts: string[] = [];
  if (lb > 0 || bw === 0) parts.push(`${main.toLocaleString('en-US')} ${view}`);
  if (bw > 0) parts.push(`${bw.toLocaleString('en-US')} BW`);
  return parts.join(' · ');
}
