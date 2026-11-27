import { z } from 'zod';
import { trainingDay } from '@/rules/days';
import { ITEM_MAX, LIST_MAX } from '@/rules/gym-equipment';
import { loadSessionDetails } from '@/app/planner/history-data';
import { loadToday } from '@/server/today-load';
import type { Caller } from './auth';
import { clientName } from './calls';
import { ConnectorError } from './errors';
import { dateInput, failed, fetchAll, inChunks } from './read';
import { addProposal, type ProposalDraft } from './repeat';
import { loadSessionRows } from './sessions';
import type { ToolDef } from './tools';
import {
  alternatesInput, checkSupersets, exerciseFields, exerciseRefInput, exercisePayload, liveExercise, loadLibrary, newExerciseInput, newExercisePayloads,
  norm, priorityValues, Problems, repsInput, resolveExercise, restInput, setsInput, summaryLines, supersetInput, term, UUID, versionOf, weightInput, weightPounds,
  type Library, type NewExercise, type Row,
} from './propose';

// The five propose tools (design Section 3, "Propose tools"). Each checks
// everything first and tells the coach what is wrong, then stores one pending
// proposal in the shape stage 4D applies (design Section 3, "What each
// proposal carries"), with the records it would change as targets and the
// version seen. A propose tool can do exactly one thing: add a pending card;
// the database enforces that for a coach's pass (the coach lock).

type Target = NonNullable<ProposalDraft['targets']>[number];

/** Adds the card, and tells the coach what to say next. */
async function propose(
  c: Caller, tool: string, args: unknown,
  draft: Omit<ProposalDraft, 'source'>,
) {
  const added = await addProposal(c, tool, args, { ...draft, source: await clientName(c) });
  return {
    proposal_id: added.proposal_id,
    status: 'pending',
    applies_to: added.applies_to,
    expires_at: added.expires_at,
    message: (added.repeat
      ? 'This is the same proposal you sent a moment ago, so no second card was added. '
      : 'The proposal is waiting in the app. ')
      + 'Nothing has changed yet. Tell the user it is waiting in the app for them to accept or decline.',
  };
}

const refOf = (r: ReturnType<typeof resolveExercise>) => (r.kind === 'new' ? { new_exercise: r.name } : { exercise_id: r.row.id });
const nameOfRef = (r: ReturnType<typeof resolveExercise>) => (r.kind === 'new' ? r.name : r.row.name);

// ---------------------------------------------------------------- propose_exercise

const exerciseInput = z.object({
  summary_lines: summaryLines,
  exercise: exerciseRefInput.optional().describe('To edit an exercise, its id or exact name. Leave out to propose a new one.'),
  name: exerciseFields.name.optional(),
  muscle_group: exerciseFields.muscle_group.optional(),
  focus: exerciseFields.focus,
  equipment: exerciseFields.equipment.optional(),
  default_unit: exerciseFields.default_unit.optional(),
  work_seconds: exerciseFields.work_seconds.optional(),
  rest_seconds: exerciseFields.rest_seconds.optional(),
  note: exerciseFields.note,
  alternates: alternatesInput.optional(),
}).strict();

async function proposeExercise(c: Caller, a: z.infer<typeof exerciseInput>) {
  const library = await loadLibrary(c.db);
  const problems = new Problems();
  const { summary_lines, exercise, ...fields } = a;
  const edited = exercise === undefined ? undefined : liveExercise(library, exercise, 'exercise');
  const mode = edited ? 'edit' : 'new';
  if (edited && !Object.values(fields).some((v) => v !== undefined)) {
    problems.add('(inputs)', `Say what to change about "${edited.name}": any of name, muscle_group, focus, equipment, default_unit, work_seconds, rest_seconds, note or alternates.`);
  }
  const payload = exercisePayload(fields, library, '', mode, problems, edited);
  problems.check('propose_exercise');
  const targets: Target[] = edited ? [{ record_kind: 'exercises', record_id: edited.id, version_seen: await versionOf(c.db, 'exercises', edited.id) }] : [];
  return propose(c, 'propose_exercise', a, {
    kind: 'exercise', applies_to: 'library', summary_lines,
    payload: edited ? { exercise_id: edited.id, ...payload } : payload, targets,
  });
}

// ---------------------------------------------------------------- propose_workout

const workoutItemInput = z.object({
  exercise: exerciseRefInput.describe('An exercise id or exact name from the library, or the name of one in new_exercises.'),
  sets: setsInput,
  reps: repsInput,
  rest_seconds: restInput.optional().describe('Rest in seconds. Leave out to use the exercise\'s own rest.'),
  superset: supersetInput.optional().describe('A letter shared by the two or three exercises that make a superset, each with the same number of sets.'),
}).strict();
type WorkoutItem = z.infer<typeof workoutItemInput>;

const itemsInput = z.array(workoutItemInput).min(1, 'A workout needs at least one exercise.').max(40, 'A workout holds at most 40 exercises.');
const newExercisesInput = z.array(newExerciseInput).max(20, 'At most 20 new exercises in one proposal.')
  .describe('Brand-new exercises this proposal brings, each with the same fields as propose_exercise. Items name them by their name.');

/** Maps a new exercise's lower-cased name to its name, for rows that name one this proposal brings. */
const newNamesOf = (list: NewExercise[] | undefined) => new Map((list ?? []).map((x) => [norm(x.name), x.name.trim()]));

interface CheckedItem { payload: Record<string, unknown>; row: Row; resolved: ReturnType<typeof resolveExercise> }

function checkItems(items: WorkoutItem[], library: Library, newNames: Map<string, string>, at: string, problems: Problems): CheckedItem[] {
  const out = items.map((it, i) => {
    const resolved = resolveExercise(library, newNames, it.exercise, `${at}[${i}].exercise`);
    const letter = it.superset ? it.superset.toUpperCase() : null;
    return {
      resolved,
      row: { exercise: nameOfRef(resolved), letter, sets: it.sets },
      payload: {
        ...refOf(resolved), sets: it.sets, reps: it.reps,
        ...(it.rest_seconds !== undefined ? { rest_seconds: it.rest_seconds } : {}),
        ...(letter ? { superset_letter: letter } : {}),
      },
    };
  });
  checkSupersets(out.map((o) => o.row), `${at}: `, problems);
  return out;
}

interface WorkoutRow { id: string; name: string; archived_at: string | null; version: number }

async function loadWorkouts(c: Caller): Promise<WorkoutRow[]> {
  return fetchAll<WorkoutRow>('workouts read', (x, y) => c.db.from('workouts').select('id, name, archived_at, version').order('id').range(x, y) as never);
}

function findWorkout(rows: WorkoutRow[], ref: string, field: string): WorkoutRow {
  const clean = ref.trim();
  const live = rows.filter((w) => !w.archived_at);
  const hit = UUID.test(clean) ? live.find((w) => w.id.toLowerCase() === clean.toLowerCase()) : live.find((w) => norm(w.name) === norm(clean));
  if (!hit) {
    throw new ConnectorError('not_found', `No workout in the library has the id or exact name "${clean}". Use list_workouts to see them, or leave it out to propose a new workout.`, {
      problems: [{ field, problem: 'Not a workout id or exact name in this library.' }],
    });
  }
  return hit;
}

const workoutInput = z.object({
  summary_lines: summaryLines,
  workout: z.string().trim().min(1).max(120).optional().describe('To edit a workout, its id or exact name. Leave out to propose a new one.'),
  name: z.string().trim().min(1, 'The workout needs a name.').max(120, 'A workout name is at most 120 characters.').optional(),
  items: itemsInput.optional().describe('The exercises in order. For an edit this is the whole new list, not just the changes.'),
  new_exercises: newExercisesInput.optional(),
}).strict();

async function proposeWorkout(c: Caller, a: z.infer<typeof workoutInput>) {
  const [library, workouts] = await Promise.all([loadLibrary(c.db), loadWorkouts(c)]);
  const problems = new Problems();
  const edited = a.workout === undefined ? undefined : findWorkout(workouts, a.workout, 'workout');
  if (edited) {
    if (a.name === undefined && a.items === undefined) problems.add('(inputs)', `Say what to change about "${edited.name}": its name, or its whole new list of items.`);
  } else {
    if (a.name === undefined) problems.add('name', 'A new workout needs a name.');
    if (a.items === undefined) problems.add('items', 'A new workout needs its items.');
  }
  if (a.new_exercises?.length && a.items === undefined) problems.add('new_exercises', 'New exercises are used by the items. Give the items that name them.');
  const newExercises = newExercisePayloads(a.new_exercises, library, problems);
  const items = a.items ? checkItems(a.items, library, newNamesOf(a.new_exercises), 'items', problems) : undefined;
  problems.check('propose_workout');
  const payload = {
    ...(edited ? { workout_id: edited.id } : {}),
    ...(a.name !== undefined ? { name: a.name } : {}),
    ...(items ? { items: items.map((i) => i.payload) } : {}),
    ...(newExercises.length ? { new_exercises: newExercises } : {}),
  };
  const targets: Target[] = edited ? [{ record_kind: 'workouts', record_id: edited.id, version_seen: edited.version }] : [];
  return propose(c, 'propose_workout', a, { kind: 'workout', applies_to: 'library', summary_lines: a.summary_lines, payload, targets });
}

// ---------------------------------------------------------------- propose_campaign

const overrideInput = z.object({
  exercise: exerciseRefInput.describe('Which row of that day\'s workout: the exercise it holds, by id or exact name.'),
  row: z.number().int().min(1).max(40).optional().describe('Only when the workout holds that exercise more than once: which one, counting from 1.'),
  swap_to: exerciseRefInput.optional().describe('An exercise to do instead on that day.'),
  sets: setsInput.optional(),
  reps: repsInput.optional(),
  weight: weightInput.optional(),
  rest_seconds: restInput.optional(),
}).strict();

const campaignDayInput = z.object({
  week: z.number('week must be a number.').int().min(1, 'week starts at 1.').max(6, 'A campaign is at most 6 weeks.'),
  weekday: z.number('weekday must be a number.').int().min(1, 'weekday 1 is Monday.').max(7, 'weekday 7 is Sunday.'),
  workout: z.string().trim().min(1).max(120).optional().describe('The workout for that day: an id or exact name from the library, or the name of one in new_workouts.'),
  rest: z.boolean().optional().describe('true to make that day a rest day (instead of a workout).'),
  overrides: z.array(overrideInput).max(40).optional().describe('Changes to rows of that day\'s workout, for that day only.'),
}).strict();

const newWorkoutInput = z.object({
  name: z.string().trim().min(1, 'A new workout needs a name.').max(120),
  items: itemsInput,
}).strict();

const campaignInput = z.object({
  summary_lines: summaryLines,
  campaign_id: z.string().trim().regex(UUID, 'A campaign id looks like 3f2b1c9e-0000-4000-8000-000000000000.').optional().describe('To edit a campaign, its id. Leave out to propose a new one (it arrives as a draft the user activates).'),
  name: z.string().trim().min(1).max(120).optional(),
  start_date: dateInput('The campaign\'s first day, written 2026-11-16.'),
  week_count: z.number().int('week_count must be a whole number.').min(1, 'A campaign is 1 to 6 weeks.').max(6, 'A campaign is 1 to 6 weeks.').optional(),
  days: z.array(campaignDayInput).max(42).optional().describe('The days to set. Days you leave out stay as they are.'),
  shift_forward_weeks: z.literal(1, 'shift_forward_weeks can only be 1.').optional().describe('Shift an existing campaign forward one week. Give it on its own, with campaign_id.'),
  new_exercises: newExercisesInput.optional(),
  new_workouts: z.array(newWorkoutInput).max(20, 'At most 20 new workouts in one proposal.').optional()
    .describe('Brand-new workouts this proposal brings: a name and items (which may name new_exercises). Days name them by name.'),
}).strict();

interface CampaignRow { id: string; name: string; status: string; week_count: number; version: number }
interface ItemRow { id: string; workout_id: string; position: number; exercise_id: string; sets: number; superset_letter: string | null }

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

async function proposeCampaign(c: Caller, a: z.infer<typeof campaignInput>) {
  const [library, workouts, campaigns] = await Promise.all([
    loadLibrary(c.db), loadWorkouts(c),
    fetchAll<CampaignRow>('campaigns read', (x, y) => c.db.from('campaigns').select('id, name, status, week_count, version').order('id').range(x, y) as never),
  ]);
  const problems = new Problems();
  const edited = a.campaign_id === undefined ? undefined : campaigns.find((k) => k.id.toLowerCase() === a.campaign_id!.toLowerCase());
  if (a.campaign_id !== undefined && !edited) {
    throw new ConnectorError('not_found', 'No campaign has that id for this user. Use get_campaign to see the active campaign and the draft campaigns by id.', {
      problems: [{ field: 'campaign_id', problem: 'Not a campaign id for this user.' }],
    });
  }

  // A shift stands alone: it moves an existing campaign one week forward.
  if (a.shift_forward_weeks !== undefined) {
    if (!edited) problems.add('shift_forward_weeks', 'Only an existing campaign can be shifted. Give its campaign_id.');
    else if (edited.status === 'finished') problems.add('campaign_id', `"${edited.name}" is finished and cannot be shifted forward.`);
    for (const f of ['name', 'start_date', 'week_count', 'days', 'new_exercises', 'new_workouts'] as const) {
      if (a[f] !== undefined) problems.add(f, 'A shift goes on its own. Leave this out, or send it in a separate proposal without shift_forward_weeks.');
    }
    problems.check('propose_campaign');
    return propose(c, 'propose_campaign', a, {
      kind: 'campaign', applies_to: 'campaign', summary_lines: a.summary_lines,
      payload: { campaign_id: edited!.id, shift_forward_weeks: 1 },
      targets: [{ record_kind: 'campaigns', record_id: edited!.id, version_seen: edited!.version }],
    });
  }

  if (edited) {
    if (a.name === undefined && a.start_date === undefined && a.week_count === undefined && a.days === undefined) {
      problems.add('(inputs)', `Say what to change about "${edited.name}": its name, start_date, week_count or days, or shift_forward_weeks.`);
    }
  } else {
    for (const f of ['name', 'start_date', 'week_count'] as const) if (a[f] === undefined) problems.add(f, `A new campaign needs ${f}.`);
    if (!a.days?.length) problems.add('days', 'A new campaign needs its days: for each, the week, the weekday (1 is Monday) and a workout.');
  }

  const newExercises = newExercisePayloads(a.new_exercises, library, problems);
  const newNames = newNamesOf(a.new_exercises);

  // New workouts first: days and overrides can name them.
  const wnames = new Map<string, string>();
  const newWorkouts = (a.new_workouts ?? []).map((w, i) => {
    if (wnames.has(norm(w.name))) problems.add(`new_workouts[${i}].name`, `Two new workouts are named "${w.name}". Give each its own name.`);
    wnames.set(norm(w.name), w.name.trim());
    const items = checkItems(w.items, library, newNames, `new_workouts[${i}].items`, problems);
    return { name: w.name, checked: items, payload: { ref: w.name.trim(), name: w.name, items: items.map((x) => x.payload) } };
  });

  // The library workouts the days name, with their rows.
  const dayWorkout = (d: z.infer<typeof campaignDayInput>, at: string) => {
    const ref = d.workout as string;
    const mine = UUID.test(ref.trim()) ? undefined : wnames.get(norm(ref));
    return mine !== undefined ? ({ kind: 'new', name: mine } as const) : ({ kind: 'library', row: findWorkout(workouts, ref, `${at}.workout`) } as const);
  };
  const days = a.days ?? [];
  const resolvedDays = days.map((d, i) => {
    const at = `days[${i}]`;
    if (d.rest && d.workout !== undefined) problems.add(at, 'A day is either a rest day or a workout, not both.');
    if (!d.rest && d.workout === undefined) problems.add(at, 'Give the day a workout, or "rest": true.');
    if (d.rest && d.overrides?.length) problems.add(`${at}.overrides`, 'A rest day has no workout to override.');
    return d.workout !== undefined && !d.rest ? dayWorkout(d, at) : null;
  });
  const libraryIds = [...new Set(resolvedDays.flatMap((r) => (r?.kind === 'library' ? [r.row.id] : [])))];
  const itemRows = await inChunks<ItemRow>('workout items read', libraryIds, (ids) =>
    c.db.from('workout_items').select('id, workout_id, position, exercise_id, sets, superset_letter').in('workout_id', ids) as never);
  const exerciseName = new Map(library.exercises.map((e) => [e.id, e.name]));

  const weekCount = a.week_count ?? edited?.week_count ?? 6;
  const seen = new Set<string>();
  const outDays = days.map((d, i) => {
    const at = `days[${i}]`;
    const label = `week ${d.week}, ${WEEKDAYS[d.weekday - 1]}`;
    if (d.week > weekCount) problems.add(`${at}.week`, `Week ${d.week} is past the campaign's ${weekCount} weeks. Raise week_count or use an earlier week.`);
    if (seen.has(`${d.week}/${d.weekday}`)) problems.add(at, `${label} is listed twice. List each day once.`);
    seen.add(`${d.week}/${d.weekday}`);
    const wk = resolvedDays[i];
    if (d.rest) return { week: d.week, weekday: d.weekday, rest: true };
    if (!wk) return { week: d.week, weekday: d.weekday };

    // The rows of that day's workout, in order.
    const rows: Array<{ ref: { exercise_id?: string; new_exercise?: string }; name: string; sets: number; letter: string | null }> = wk.kind === 'new'
      ? newWorkouts.find((w) => norm(w.name) === norm(wk.name))!.checked.map((x) => ({ ref: refOf(x.resolved), name: nameOfRef(x.resolved), sets: x.row.sets, letter: x.row.letter }))
      : itemRows.filter((r) => r.workout_id === wk.row.id).sort((p, q) => p.position - q.position)
        .map((r) => ({ ref: { exercise_id: r.exercise_id }, name: exerciseName.get(r.exercise_id) ?? 'An exercise', sets: r.sets, letter: r.superset_letter }));
    const overrides: Array<Record<string, unknown>> = [];
    const setsAt = new Map<number, number>();
    const touched = new Set<number>();
    (d.overrides ?? []).forEach((o, k) => {
      const oat = `${at}.overrides[${k}]`;
      if ([o.swap_to, o.sets, o.reps, o.weight, o.rest_seconds].every((v) => v === undefined)) {
        problems.add(oat, `Say what changes for "${o.exercise}" that day: swap_to, sets, reps, weight or rest_seconds.`);
      }
      const named = resolveExercise(library, newNamesOf(a.new_exercises), o.exercise, `${oat}.exercise`);
      const matches = rows.map((r, idx) => ({ r, idx })).filter(({ r }) => (named.kind === 'new' ? r.ref.new_exercise === named.name : r.ref.exercise_id === named.row.id));
      if (!matches.length) {
        problems.add(`${oat}.exercise`, `${label}: "${o.exercise}" is not in that day's workout. Its rows are: ${rows.map((r, n) => `${n + 1}. ${r.name}`).join(', ')}.`);
        return;
      }
      if (matches.length > 1 && o.row === undefined) {
        problems.add(`${oat}.row`, `${label}: "${nameOfRef(named)}" is in that day's workout ${matches.length} times. Add "row" (1 to ${rows.length}) to say which.`);
        return;
      }
      const hit = o.row !== undefined ? matches.find((m) => m.idx === o.row! - 1) : matches[0];
      if (!hit) {
        problems.add(`${oat}.row`, `Row ${o.row} of that day's workout is not "${nameOfRef(named)}". Its rows are: ${rows.map((r, n) => `${n + 1}. ${r.name}`).join(', ')}.`);
        return;
      }
      if (touched.has(hit.idx)) problems.add(oat, `${label}: row ${hit.idx + 1} (${hit.r.name}) has two overrides. Give each row one.`);
      touched.add(hit.idx);
      const out: Record<string, unknown> = { item: hit.idx };
      if (o.swap_to !== undefined) Object.assign(out, refOf(resolveExercise(library, newNamesOf(a.new_exercises), o.swap_to, `${oat}.swap_to`)));
      if (o.sets !== undefined) { out.sets = o.sets; setsAt.set(hit.idx, o.sets); }
      if (o.reps !== undefined) out.reps = o.reps;
      if (o.weight !== undefined) Object.assign(out, weightPounds(o.weight, `${oat}.weight`, problems) ?? {});
      if (o.rest_seconds !== undefined) out.rest_seconds = o.rest_seconds;
      overrides.push(out);
    });
    // No day's overrides may leave a superset with members on different set counts.
    checkSupersets(rows.map((r, idx) => ({ exercise: r.name, letter: r.letter, sets: setsAt.get(idx) ?? r.sets })), `${label}, ${wk.kind === 'new' ? wk.name : wk.row.name}: `, problems);
    return {
      week: d.week, weekday: d.weekday,
      ...(wk.kind === 'new' ? { new_workout: wk.name } : { workout_id: wk.row.id }),
      ...(d.overrides ? { overrides } : {}),
    };
  });
  problems.check('propose_campaign');

  const payload = {
    ...(edited ? { campaign_id: edited.id } : {}),
    ...(a.name !== undefined ? { name: a.name } : {}),
    ...(a.start_date !== undefined ? { start_date: a.start_date } : {}),
    ...(a.week_count !== undefined ? { week_count: a.week_count } : {}),
    ...(days.length ? { days: outDays } : {}),
    ...(newExercises.length ? { new_exercises: newExercises } : {}),
    ...(newWorkouts.length ? { new_workouts: newWorkouts.map((w) => w.payload) } : {}),
  };
  const targets: Target[] = edited ? [{ record_kind: 'campaigns', record_id: edited.id, version_seen: edited.version }] : [];
  return propose(c, 'propose_campaign', a, { kind: 'campaign', applies_to: 'campaign', summary_lines: a.summary_lines, payload, targets });
}

// ---------------------------------------------------------------- propose_today_change

const ACTIONS = ['swap', 'set_sets', 'set_reps', 'set_weight', 'set_rest', 'add', 'remove', 'reorder', 'break_superset'] as const;
/** What each action takes besides "action" and "exercise". */
const TAKES: Record<(typeof ACTIONS)[number], { needs: string[]; may: string[] }> = {
  swap: { needs: ['exercise', 'to_exercise'], may: [] },
  set_sets: { needs: ['exercise', 'sets'], may: [] },
  set_reps: { needs: ['exercise', 'reps'], may: [] },
  set_weight: { needs: ['exercise', 'weight'], may: [] },
  set_rest: { needs: ['exercise', 'rest_seconds'], may: [] },
  add: { needs: ['exercise', 'sets', 'reps'], may: ['weight', 'rest_seconds', 'position'] },
  remove: { needs: ['exercise'], may: [] },
  reorder: { needs: ['exercise', 'position'], may: [] },
  break_superset: { needs: [], may: ['exercise', 'superset'] },
};

const changeInput = z.object({
  action: z.enum(ACTIONS, `action is one of: ${ACTIONS.join(', ')}.`),
  exercise: exerciseRefInput.optional().describe('The exercise in today\'s workout this applies to (for add, the library exercise to add). For break_superset, any one member.'),
  to_exercise: exerciseRefInput.optional().describe('For swap: the library exercise to do instead.'),
  sets: setsInput.optional(),
  reps: repsInput.optional(),
  weight: weightInput.optional(),
  rest_seconds: restInput.optional(),
  position: z.number().int().min(1, 'position counts from 1.').max(40).optional().describe('For reorder and add: the place among today\'s exercises, from 1 (a superset counts once).'),
  superset: supersetInput.optional().describe('For break_superset: the superset\'s letter.'),
}).strict();

interface TodayRow { id: string; name: string; state: string; logged: number; sets: number; letter: string | null }

/** Today's exercises as the change will meet them: the running workout if there is one, otherwise today's plan. */
async function todayRows(c: Caller, library: Library): Promise<{ date: string; rows: TodayRow[]; live: boolean }> {
  const date = trainingDay(new Date(), c.me.time_zone);
  const names = new Map(library.exercises.map((e) => [e.id, e.name]));
  const active = (await loadSessionRows(c.db, { activeOnly: true, all: true })).filter((s) => s.local_date === date)[0];
  if (active) {
    const [sd] = await loadSessionDetails(c.db, [active]);
    const blocks = new Map(sd.blocks.map((b) => [b.id, b]));
    const rows = [...sd.exercises]
      .sort((p, q) => (blocks.get(p.block_id)?.position ?? 0) - (blocks.get(q.block_id)?.position ?? 0) || p.position_in_block - q.position_in_block)
      .map((e) => {
        const b = blocks.get(e.block_id);
        return {
          id: e.exercise_id, name: names.get(e.exercise_id) ?? e.exercise_name_then, state: e.state, sets: e.planned,
          logged: sd.sets.filter((s) => s.sessionExerciseId === e.id).length,
          letter: b && !b.broken_at && !b.broken_from_block_id ? b.superset_letter : null,
        };
      });
    return { date, rows, live: true };
  }
  const view = await loadToday(c.db, date);
  if (!view.workout || view.doneToday) {
    throw new ConnectorError('nothing_to_change', view.workout
      ? 'Today\'s workout is already finished, so there is nothing left to change today. If the user wants something different for a later day, propose it for the library or the campaign instead.'
      : 'There is no workout planned for today and none running, so there is nothing to change. If the user wants a workout today, ask them what they want, then use propose_workout or propose_campaign.');
  }
  const rows = view.workout.items.map((i) => ({ id: i.exerciseId, name: names.get(i.exerciseId) ?? 'An exercise', state: 'open', logged: 0, sets: i.sets, letter: i.superset }));
  return { date, rows, live: false };
}

async function proposeTodayChange(c: Caller, a: z.infer<typeof todayInput>) {
  const library = await loadLibrary(c.db);
  const { date, rows: start, live } = await todayRows(c, library);
  const problems = new Problems();
  // Worked through in order, so a change can rely on an earlier one in the same proposal (add, then change it; break a superset, then set its sets).
  let rows = start.map((r) => ({ ...r }));
  const list = () => rows.map((r, n) => `${n + 1}. ${r.name}`).join(', ');
  const pendingSets = new Map<string, Map<string, number>>();
  const out: Array<Record<string, unknown>> = [];

  a.changes.forEach((ch, i) => {
    const at = `changes[${i}]`;
    const takes = TAKES[ch.action];
    const given = (['exercise', 'to_exercise', 'sets', 'reps', 'weight', 'rest_seconds', 'position', 'superset'] as const).filter((k) => ch[k] !== undefined);
    for (const k of takes.needs) if (ch[k as keyof typeof ch] === undefined) problems.add(`${at}.${k}`, `${ch.action} needs "${k}".`);
    for (const k of given) if (!takes.needs.includes(k) && !takes.may.includes(k)) problems.add(`${at}.${k}`, `${ch.action} does not take "${k}". Leave it out.`);
    if (ch.action === 'break_superset' && ch.exercise === undefined && ch.superset === undefined) problems.add(at, 'break_superset needs the superset\'s letter, or any one of its members as "exercise".');
    if (problems.list.some((p) => p.field.startsWith(at))) return;

    if (ch.action === 'break_superset') {
      const member = ch.exercise !== undefined ? liveExercise(library, ch.exercise, `${at}.exercise`) : undefined;
      const letter = ch.superset?.toUpperCase() ?? rows.find((r) => r.id === member?.id)?.letter ?? null;
      const members = letter ? rows.filter((r) => r.letter === letter) : [];
      if (!letter || !members.length || (member && !members.some((m) => m.id === member.id))) {
        const have = [...new Set(rows.flatMap((r) => (r.letter ? [r.letter] : [])))];
        problems.add(at, `${member ? `"${member.name}" is not in a superset today` : `There is no superset ${ch.superset?.toUpperCase()} today`}, or it is already broken. ${have.length ? `Supersets today: ${have.join(', ')}.` : 'There are no supersets today.'}`);
        return;
      }
      rows = rows.map((r) => (r.letter === letter ? { ...r, letter: null } : r));
      pendingSets.delete(letter);
      out.push({ action: 'break_superset', superset_letter: letter, ...(member ? { exercise_id: member.id } : {}) });
      return;
    }

    const ex = liveExercise(library, ch.exercise!, `${at}.exercise`);
    if (ch.action === 'add') {
      const row: Record<string, unknown> = { action: 'add', exercise_id: ex.id, sets: ch.sets, reps: ch.reps };
      if (ch.weight) {
        if (ex.default_unit === 'bw') problems.add(`${at}.weight`, `"${ex.name}" is a bodyweight exercise and takes no weight.`);
        else Object.assign(row, { weight_lb: weightPounds(ch.weight, `${at}.weight`, problems)?.weight_lb });
      }
      if (ch.rest_seconds !== undefined) row.rest_seconds = ch.rest_seconds;
      if (ch.position !== undefined) row.position = ch.position;
      rows.splice(Math.min((ch.position ?? rows.length + 1) - 1, rows.length), 0, { id: ex.id, name: ex.name, state: 'open', logged: 0, sets: ch.sets!, letter: null });
      out.push(row);
      return;
    }

    const mine = rows.find((r) => r.id === ex.id);
    if (!mine) {
      problems.add(`${at}.exercise`, `"${ex.name}" is not in today's workout. Today has: ${list()}.`);
      return;
    }
    if (mine.state !== 'open') {
      problems.add(`${at}.exercise`, `"${ex.name}" is already ${mine.state} today, so it cannot be changed. Leave it out.`);
      return;
    }
    const row: Record<string, unknown> = { action: ch.action, exercise_id: ex.id };
    switch (ch.action) {
      case 'swap': {
        const to = liveExercise(library, ch.to_exercise!, `${at}.to_exercise`);
        if (to.id === ex.id) problems.add(`${at}.to_exercise`, 'That is the same exercise. Swap to a different one.');
        row.to_exercise_id = to.id;
        rows = rows.map((r) => (r === mine ? { ...r, id: to.id, name: to.name } : r));
        break;
      }
      case 'set_sets':
        if (live && ch.sets! < mine.logged) problems.add(`${at}.sets`, `"${ex.name}" already has ${mine.logged} sets logged, so it cannot go down to ${ch.sets}. Use ${mine.logged} or more.`);
        row.sets = ch.sets;
        if (mine.letter) pendingSets.set(mine.letter, (pendingSets.get(mine.letter) ?? new Map()).set(mine.id, ch.sets!));
        mine.sets = ch.sets!;
        break;
      case 'set_reps': row.reps = ch.reps; break;
      case 'set_weight':
        if (ex.default_unit === 'bw') problems.add(`${at}.weight`, `"${ex.name}" is a bodyweight exercise and takes no weight.`);
        else Object.assign(row, { weight_lb: weightPounds(ch.weight!, `${at}.weight`, problems)?.weight_lb });
        break;
      case 'set_rest': row.rest_seconds = ch.rest_seconds; break;
      case 'remove': rows = rows.filter((r) => r !== mine); break;
      case 'reorder': row.position = ch.position; break;
    }
    out.push(row);
  });

  // A superset keeps the same number of sets in every member: a change to one is matched on the others, unless the proposal breaks it first.
  for (const [letter, got] of pendingSets) {
    const members = rows.filter((r) => r.letter === letter);
    const missing = members.filter((m) => !got.has(m.id));
    if (missing.length || new Set(got.values()).size > 1) {
      problems.add('changes', `Superset ${letter} must keep the same number of sets in every member (${members.map((m) => m.name).join(', ')}). `
        + `Give set_sets to each of them with the same number, or add a break_superset change for ${letter} before the set_sets.`);
    }
  }
  problems.check('propose_today_change');
  return propose(c, 'propose_today_change', a, {
    kind: 'today_change', applies_to: 'today', summary_lines: a.summary_lines, payload: { local_date: date, changes: out },
  });
}

const todayInput = z.object({
  summary_lines: summaryLines,
  changes: z.array(changeInput).min(1, 'Give at least one change.').max(20, 'At most 20 changes in one proposal.')
    .describe('The changes, in the order they should happen. Each has an action and the exercise it applies to.'),
}).strict();

// ---------------------------------------------------------------- propose_profile_update

const nullableEnum = <T extends [string, ...string[]]>(values: T, label: string) =>
  z.enum(values, `${label} is one of: ${values.join(', ')}.`).nullable().optional().describe(`One of ${values.join(', ')}, or null to clear it.`);
const text = (label: string, max = 2000) => z.string().max(max, `${label} is at most ${max} characters.`).optional().describe('Empty text clears it.');

const priorityInput = z.object({
  value: z.enum(priorityValues, `A priority is one of: ${priorityValues.join(', ')}.`),
  text: z.string().trim().min(1).max(100, 'A written-in priority is at most 100 characters.').optional().describe('Only for "other": what it is.'),
}).strict();

const eqKey = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();

/** Checks a list of items the way the gym screen does: no repeats ignoring capitals. Returns the distinct keys. */
function checkEquipmentItems(problems: Problems, field: string, items: string[]): string[] {
  const seen = new Set<string>();
  items.forEach((e, i) => {
    const k = eqKey(e);
    if (seen.has(k)) problems.add(`${field}[${i}]`, `"${e}" is listed twice (capitals do not matter). List each item once.`);
    seen.add(k);
  });
  return [...seen];
}

async function currentEquipment(c: Caller, gymId: string): Promise<string[]> {
  const { data, error } = await c.db.from('gyms').select('equipment').eq('id', gymId).maybeSingle();
  if (error) failed('gym read', error);
  return ((data as { equipment: string[] | null } | null)?.equipment ?? []);
}

const gymInput = z.object({
  gym: z.string().trim().min(1).max(80).optional().describe('To edit a gym, its id or exact name. Leave out to add a new gym.'),
  name: z.string().trim().min(1, 'A gym needs a name.').max(80, 'A gym name is at most 80 characters.').optional(),
  add_equipment: z.array(z.string().trim().min(1, 'An equipment item cannot be empty.').max(ITEM_MAX, `An equipment item is at most ${ITEM_MAX} characters.`)).max(LIST_MAX, `At most ${LIST_MAX} items to add.`).optional()
    .describe('Equipment to add to the gym, in the user\'s own words, such as "Rower" or "Hammer Strength Chest Press". Free text, not get_vocabulary values. Added to the list the gym has when the user accepts.'),
  remove_equipment: z.array(z.string().trim().min(1, 'An equipment item cannot be empty.').max(ITEM_MAX, `An equipment item is at most ${ITEM_MAX} characters.`)).max(LIST_MAX, `At most ${LIST_MAX} items to remove.`).optional()
    .describe('Equipment to take off the gym\'s list, written as list_gyms shows it (capitals do not matter). Only for a gym that exists.'),
  notes: z.string().max(1000, 'Gym notes are at most 1000 characters.').optional(),
  make_default: z.boolean().optional(),
}).strict();

const profileInput = z.object({
  summary_lines: summaryLines,
  goals: text('goals'),
  injuries_and_limits: text('injuries_and_limits'),
  weekly_schedule: text('weekly_schedule'),
  notes: text('notes'),
  coach_style: nullableEnum(['supportive', 'challenging', 'neutral'], 'coach_style'),
  experience: nullableEnum(['new', 'returning', 'intermediate', 'experienced', 'all_in'], 'experience'),
  priorities: z.array(priorityInput).max(3, 'At most three priorities, in rank order.').optional().describe('Up to three priorities, most important first. Replaces the list.'),
  progression_pace: nullableEnum(['steady', 'moderate', 'aggressive'], 'progression_pace'),
  workout_minutes: z.number().int('workout_minutes must be a whole number.').min(10, 'workout_minutes is at least 10.').max(240, 'workout_minutes is at most 240.').nullable().optional(),
  days_per_week: z.number().int('days_per_week must be a whole number.').min(1, 'days_per_week is 1 to 7.').max(7, 'days_per_week is 1 to 7.').nullable().optional(),
  variety: nullableEnum(['familiar', 'some', 'lots'], 'variety'),
  exercises_liked: text('exercises_liked'),
  exercises_to_avoid: text('exercises_to_avoid'),
  how_to_coach_me: text('how_to_coach_me'),
  gym: gymInput.optional().describe('Add a gym, or edit one.'),
}).strict();

const PROFILE_FIELDS = [
  'goals', 'injuries_and_limits', 'weekly_schedule', 'notes', 'coach_style', 'experience', 'priorities', 'progression_pace', 'workout_minutes',
  'days_per_week', 'variety', 'exercises_liked', 'exercises_to_avoid', 'how_to_coach_me',
] as const;

interface GymRow { id: string; name: string; archived_at: string | null; version: number }

async function proposeProfileUpdate(c: Caller, a: z.infer<typeof profileInput>) {
  const problems = new Problems();
  const profile: Record<string, unknown> = {};
  for (const f of PROFILE_FIELDS) if (a[f] !== undefined) profile[f] = a[f];
  if (a.priorities) {
    const seenP = new Set<string>();
    a.priorities.forEach((p, i) => {
      if (p.value === 'other' && !p.text) problems.add(`priorities[${i}].text`, 'A priority of "other" needs its text, for example { "value": "other", "text": "Rock climbing" }.');
      if (p.value !== 'other' && p.text !== undefined) problems.add(`priorities[${i}].text`, 'Only "other" takes text. Leave it out.');
      const key = p.value === 'other' ? `other:${norm(p.text ?? '')}` : p.value;
      if (seenP.has(key)) problems.add(`priorities[${i}]`, `"${p.value}" is listed twice. List each priority once.`);
      seenP.add(key);
    });
    profile.priorities = a.priorities.map((p) => (p.value === 'other' ? { value: 'other', text: p.text } : { value: p.value }));
  }

  const targets: Target[] = [];
  let gymPayload: Record<string, unknown> | undefined;
  if (a.gym) {
    const g = a.gym;
    const gyms = await fetchAll<GymRow>('gyms read', (x, y) => c.db.from('gyms').select('id, name, archived_at, version').order('id').range(x, y) as never);
    const clean = g.gym?.trim();
    const edited = clean === undefined ? undefined
      : gyms.filter((x) => !x.archived_at).find((x) => (UUID.test(clean) ? x.id.toLowerCase() === clean.toLowerCase() : norm(x.name) === norm(clean)));
    if (clean !== undefined && !edited) {
      throw new ConnectorError('not_found', `No gym has the id or exact name "${clean}". Use list_gyms to see them, or leave "gym" out to add a new one.`, {
        problems: [{ field: 'gym.gym', problem: 'Not a gym id or exact name for this user.' }],
      });
    }
    if (!edited && g.name === undefined) problems.add('gym.name', 'A new gym needs a name.');
    const adds = g.add_equipment ?? [];
    const removes = g.remove_equipment ?? [];
    if (edited && g.name === undefined && !adds.length && !removes.length && g.notes === undefined && g.make_default === undefined) {
      problems.add('gym', `Say what to change about "${edited.name}": name, add_equipment, remove_equipment, notes or make_default.`);
    }
    const current = edited ? await currentEquipment(c, edited.id) : [];
    const addKeys = checkEquipmentItems(problems, 'gym.add_equipment', adds);
    const removeKeys = checkEquipmentItems(problems, 'gym.remove_equipment', removes);
    adds.forEach((e, i) => {
      if (removeKeys.includes(eqKey(e))) problems.add(`gym.add_equipment[${i}]`, `"${e}" is in both add_equipment and remove_equipment. Pick one.`);
      else if (current.some((x) => eqKey(x) === eqKey(e))) problems.add(`gym.add_equipment[${i}]`, `"${e}" is already in ${edited!.name}'s list. Leave it out.`);
    });
    removes.forEach((e, i) => {
      if (!edited) problems.add(`gym.remove_equipment[${i}]`, 'A new gym has nothing to remove. Leave remove_equipment out.');
      else if (!current.some((x) => eqKey(x) === eqKey(e))) problems.add(`gym.remove_equipment[${i}]`, `"${e}" is not in ${edited.name}'s list. Check list_gyms and write it as it appears there.`);
    });
    if (edited && current.length + addKeys.length - removeKeys.length > LIST_MAX) {
      problems.add('gym.add_equipment', `${edited.name} holds ${current.length} items and a gym holds at most ${LIST_MAX}. Add fewer, or remove some.`);
    }
    // A new gym can be filled in with add_equipment too. Adds and removes are applied to the gym's list when the user accepts, not as it is now.
    gymPayload = {
      ...(edited ? { gym_id: edited.id } : {}),
      ...(g.name !== undefined ? { name: g.name } : {}),
      ...(adds.length ? { add_equipment: adds } : {}),
      ...(removes.length ? { remove_equipment: removes } : {}),
      ...(g.notes !== undefined ? { notes: g.notes } : {}),
      ...(g.make_default !== undefined ? { make_default: g.make_default } : {}),
    };
    // A card that only adds or removes items does not go out of date when the gym's list changes: it applies to the list as it is at Accept.
    const listOnly = g.name === undefined && g.notes === undefined;
    if (edited && !listOnly) targets.push({ record_kind: 'gyms', record_id: edited.id, version_seen: edited.version });
  }

  if (!Object.keys(profile).length && !gymPayload) {
    problems.add('(inputs)', 'Give at least one change: a profile field (goals, coach_style, priorities and so on) or a gym.');
  }
  problems.check('propose_profile_update');

  if (Object.keys(profile).length) {
    // Accept checks the profile's version too; a user with no coach profile yet has nothing to check.
    const { data, error } = await c.db.from('coach_profiles').select('version').eq('user_id', c.userId).maybeSingle();
    if (error) failed('coach profile read', error);
    if (data) targets.push({ record_kind: 'coach_profiles', record_id: c.userId, version_seen: Number((data as { version: number }).version) });
  }
  return propose(c, 'propose_profile_update', a, {
    kind: 'profile_update', applies_to: 'profile', summary_lines: a.summary_lines,
    payload: { ...(Object.keys(profile).length ? { profile } : {}), ...(gymPayload ? { gym: gymPayload } : {}) }, targets,
  });
}

// ---------------------------------------------------------------- the list

export const PROPOSE_TOOLS: ToolDef[] = [
  { name: 'propose_exercise', input: exerciseInput, readOnly: false, run: (c, a) => proposeExercise(c, a as z.infer<typeof exerciseInput>) },
  { name: 'propose_workout', input: workoutInput, readOnly: false, run: (c, a) => proposeWorkout(c, a as z.infer<typeof workoutInput>) },
  { name: 'propose_campaign', input: campaignInput, readOnly: false, run: (c, a) => proposeCampaign(c, a as z.infer<typeof campaignInput>) },
  { name: 'propose_today_change', input: todayInput, readOnly: false, run: (c, a) => proposeTodayChange(c, a as z.infer<typeof todayInput>) },
  { name: 'propose_profile_update', input: profileInput, readOnly: false, run: (c, a) => proposeProfileUpdate(c, a as z.infer<typeof profileInput>) },
];
