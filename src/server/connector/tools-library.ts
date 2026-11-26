import { z } from 'zod';
import { addDays, mondayOf, trainingDay } from '@/rules/days';
import { rowBudget } from '@/rules/planner';
import type { Caller } from './auth';
import { ConnectorError } from './errors';
import { nextInput, page, PAGE_SIZE, readNext } from './limits';
import { failed, fetchAll, inChunks, loadExercises, loadVocabularyNames, weightOut, type ExerciseRow } from './read';
import type { ToolDef } from './tools';

// The library read tools (design Section 3, "Read tools"): list_exercises,
// list_workouts and get_campaign.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------- list_exercises

const listExercisesInput = z.object({
  muscle_group: z.string().trim().min(1).max(120).optional().describe('Only exercises in this muscle group (a name from get_vocabulary).'),
  equipment: z.string().trim().min(1).max(120).optional().describe('Only exercises that use this equipment (a name from get_vocabulary).'),
  search: z.string().trim().min(1).max(120).optional().describe('Only exercises whose name contains these letters.'),
  include_archived: z.boolean().optional().describe('Also list archived exercises. Default false.'),
  next: nextInput,
}).strict();

async function listExercises(c: Caller, a: z.infer<typeof listExercisesInput>) {
  const [rows, names, vocab, alternates] = await Promise.all([
    loadExercises(c.db, a.include_archived === true),
    loadVocabularyNames(c.db),
    c.db.from('vocabulary_terms').select('id, kind, name').is('archived_at', null),
    fetchAll<{ exercise_id: string; tier: string; name: string }>('alternates read', (x, y) =>
      c.db.from('exercise_alternates').select('exercise_id, tier, name').order('id').range(x, y) as never),
  ]);
  if (vocab.error) failed('vocabulary read', vocab.error);
  const terms = (vocab.data ?? []) as Array<{ id: string; kind: string; name: string }>;
  const lookup = (kind: string, value: string | undefined, field: string) => {
    if (value === undefined) return null;
    const allowed = terms.filter((t) => t.kind === kind).map((t) => t.name);
    const hit = terms.find((t) => t.kind === kind && t.name.toLowerCase() === value.toLowerCase());
    if (!hit) {
      throw new ConnectorError('unknown_vocabulary', `"${value}" is not one of this user's ${field.replace('_', ' ')} values. Use one of: ${allowed.join(', ')}.`, {
        problems: [{ field, problem: `Allowed values: ${allowed.join(', ')}` }],
      });
    }
    return hit.id;
  };
  const group = lookup('muscle_group', a.muscle_group, 'muscle_group');
  const equip = lookup('equipment', a.equipment, 'equipment');
  const word = a.search?.toLowerCase();
  const offset = readNext(a.next);
  const tiers = (id: string) => {
    const mine = alternates.filter((x) => x.exercise_id === id);
    const pick = (tier: string) => mine.find((x) => x.tier === tier)?.name ?? null;
    return { bodyweight: pick('bodyweight'), basic_gym: pick('basic_gym'), full_gym: pick('full_gym') };
  };
  const list = rows
    .filter((e) => (group === null || e.muscle_group_id === group) && (equip === null || e.equipment_id === equip)
      && (!word || e.name.toLowerCase().includes(word)))
    .sort((x, y) => x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  const { items, next } = page(list.slice(offset, offset + 51), offset);
  return {
    exercises: items.map((e) => {
      const incomplete = [e.muscle_group_id ? '' : 'muscle_group', e.equipment_id ? '' : 'equipment'].filter(Boolean);
      return {
        id: e.id,
        name: e.name,
        muscle_group: names.get(e.muscle_group_id ?? '') ?? null,
        focus: names.get(e.focus_id ?? '') ?? null,
        equipment: names.get(e.equipment_id ?? '') ?? null,
        default_unit: e.default_unit,
        assisted: e.assisted,
        load_count: e.load_count,
        work_seconds: e.work_seconds,
        rest_seconds: e.rest_seconds,
        note: e.note ?? '',
        alternates: tiers(e.id),
        archived: !!e.archived_at,
        incomplete: incomplete.length > 0,
        // A swap can leave these empty. Never block on it: it only means the details were not filled in yet.
        empty_fields: incomplete,
      };
    }),
    next,
  };
}

// ---------------------------------------------------------------- list_workouts

const listWorkoutsInput = z.object({
  include_archived: z.boolean().optional().describe('Also list archived workouts. Default false.'),
  next: nextInput,
}).strict();

interface ItemRow { id: string; workout_id: string; position: number; exercise_id: string; sets: number; reps: number; rest_seconds: number | null; superset_letter: string | null }

async function listWorkouts(c: Caller, a: z.infer<typeof listWorkoutsInput>) {
  const offset = readNext(a.next);
  let q = c.db.from('workouts').select('id, name, archived_at');
  if (a.include_archived !== true) q = q.is('archived_at', null);
  const { data, error } = await q.order('name').order('id').range(offset, offset + PAGE_SIZE);
  if (error) failed('workouts read', error);
  const { items, next } = page((data ?? []) as Array<{ id: string; name: string; archived_at: string | null }>, offset);
  const [exercises, itemRows] = await Promise.all([
    loadExercises(c.db),
    inChunks<ItemRow>('workout items read', items.map((w) => w.id), (ids) =>
      c.db.from('workout_items').select('id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter').in('workout_id', ids) as never),
  ]);
  const ex = new Map(exercises.map((e) => [e.id, e]));
  return {
    workouts: items.map((w) => {
      const mine = itemRows.filter((i) => i.workout_id === w.id).sort((x, y) => x.position - y.position);
      const shaped = mine.map((i) => ({ exerciseId: i.exercise_id, sets: i.sets, rest: i.rest_seconds, superset: i.superset_letter }));
      const timing = (id: string) => { const e = ex.get(id); return e ? { work: e.work_seconds, rest: e.rest_seconds } : undefined; };
      const seen = new Set<string>();
      return {
        id: w.id,
        name: w.name,
        archived: !!w.archived_at,
        items: mine.map((i, n) => {
          const e = ex.get(i.exercise_id);
          // A superset's budget covers the whole superset and is on its first member.
          const first = !i.superset_letter || !seen.has(i.superset_letter);
          if (i.superset_letter) seen.add(i.superset_letter);
          return {
            item_id: i.id,
            exercise: e?.name ?? null,
            exercise_id: i.exercise_id,
            sets: i.sets,
            reps: i.reps,
            rest_seconds: i.rest_seconds ?? e?.rest_seconds ?? null,
            rest_is_exercise_default: i.rest_seconds === null,
            superset: i.superset_letter,
            time_budget_seconds: first ? rowBudget(shaped, n, timing) : null,
          };
        }),
      };
    }),
    next,
  };
}

// ---------------------------------------------------------------- get_campaign

const campaignInput = z.object({
  campaign_id: z.string().trim().regex(UUID, 'A campaign id looks like 3f2b1c9e-0000-4000-8000-000000000000.').optional()
    .describe('A campaign id, from this tool\'s own list of drafts. Leave out for the active campaign.'),
}).strict();

interface CampaignRow { id: string; name: string; start_date: string; week_count: number; status: string }

/** The calendar dates of a campaign's weeks: week 1 is the week holding the start date, and a shifted (blank) week is skipped. */
export function campaignWeeks(startDate: string, weekCount: number, blankMondays: string[]): string[] {
  const out: string[] = [];
  for (let m = mondayOf(startDate); out.length < weekCount; m = addDays(m, 7)) if (!blankMondays.includes(m)) out.push(m);
  return out;
}

export interface CampaignDayDate { dayId: string; date: string; week: number; weekday: number; workoutId: string }

interface DayRow { id: string; week: number; weekday: number; workout_id: string }

export function campaignDates(camp: CampaignRow, days: DayRow[], blankMondays: string[]): { dates: CampaignDayDate[]; endDate: string; mondays: string[] } {
  const start = camp.start_date.slice(0, 10);
  const mondays = campaignWeeks(start, camp.week_count, blankMondays);
  const dates = days.flatMap((d) => {
    const monday = mondays[d.week - 1];
    if (!monday) return [];
    const date = addDays(monday, d.weekday - 1);
    return date < start ? [] : [{ dayId: d.id, date, week: d.week, weekday: d.weekday, workoutId: d.workout_id }];
  });
  return { dates, endDate: addDays(mondays[mondays.length - 1], 6), mondays };
}

async function getCampaign(c: Caller, a: z.infer<typeof campaignInput>) {
  const { data, error } = await c.db.from('campaigns').select('id, name, start_date, week_count, status').order('created_at', { ascending: false });
  if (error) failed('campaigns read', error);
  const all = (data ?? []) as CampaignRow[];
  const drafts = all.filter((x) => x.status === 'draft').map((x) => ({ id: x.id, name: x.name }));
  const camp = a.campaign_id ? all.find((x) => x.id.toLowerCase() === a.campaign_id!.toLowerCase()) : all.find((x) => x.status === 'active');
  if (a.campaign_id && !camp) {
    throw new ConnectorError('not_found', 'No campaign has that id. Call get_campaign with no inputs for the active campaign and the list of drafts.', {
      problems: [{ field: 'campaign_id', problem: 'Not a campaign id for this user.' }],
    });
  }
  if (!camp) {
    return { campaign: null, message: 'There is no active campaign right now.', drafts };
  }
  const start = camp.start_date.slice(0, 10);
  const [shiftsR, daysR] = await Promise.all([
    c.db.from('campaign_shifts').select('blank_week_starts_on, made_by').eq('campaign_id', camp.id),
    c.db.from('campaign_days').select('id, week, weekday, workout_id').eq('campaign_id', camp.id),
  ]);
  if (shiftsR.error) failed('campaign shifts read', shiftsR.error);
  if (daysR.error) failed('campaign days read', daysR.error);
  const shifts = (shiftsR.data ?? []) as Array<{ blank_week_starts_on: string; made_by: string }>;
  const blank = shifts.map((s) => s.blank_week_starts_on.slice(0, 10));
  const days = (daysR.data ?? []) as DayRow[];
  const { dates, endDate, mondays } = campaignDates(camp, days, blank);
  const dayIds = days.map((d) => d.id);
  const workoutIds = [...new Set(days.map((d) => d.workout_id))];
  const [workoutsR, items, overrides, sessions, exercises] = await Promise.all([
    inChunks<{ id: string; name: string }>('workouts read', workoutIds, (ids) => c.db.from('workouts').select('id, name').in('id', ids) as never),
    inChunks<ItemRow>('workout items read', workoutIds, (ids) =>
      c.db.from('workout_items').select('id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter').in('workout_id', ids) as never),
    inChunks<{ campaign_day_id: string; workout_item_id: string; exercise_id: string | null; sets: number | null; reps: number | null; weight_lb: number | string | null; weight_entered_value: number | string | null; weight_entered_unit: 'lb' | 'kg' | null; rest_seconds: number | null }>(
      'overrides read', dayIds, (ids) => c.db.from('campaign_day_overrides')
        .select('campaign_day_id, workout_item_id, exercise_id, sets, reps, weight_lb, weight_entered_value, weight_entered_unit, rest_seconds').in('campaign_day_id', ids) as never),
    inChunks<{ campaign_day_id: string; local_date: string; status: string }>('sessions read', dayIds, (ids) =>
      c.db.from('sessions').select('campaign_day_id, local_date, status').in('campaign_day_id', ids).eq('status', 'finished').gte('local_date', start) as never),
    loadExercises(c.db),
  ]);
  const today = trainingDay(new Date(), c.me.time_zone);
  const doneDays = new Set(sessions.map((s) => s.campaign_day_id));
  const ex = new Map<string, ExerciseRow>(exercises.map((e) => [e.id, e]));
  const workoutName = new Map(workoutsR.map((w) => [w.id, w.name]));
  const byDate = new Map(dates.map((d) => [d.date, d]));
  const calendar: string[] = [];
  for (const m of mondays) for (let i = 0; i < 7; i++) if (addDays(m, i) >= start) calendar.push(addDays(m, i));
  return {
    campaign: {
      id: camp.id,
      name: camp.name,
      status: camp.status,
      start_date: start,
      week_count: camp.week_count,
      end_date: endDate,
      shifts: shifts.map((s) => ({ blank_week_starts_on: s.blank_week_starts_on.slice(0, 10), made_by: s.made_by === 'user' ? 'user' : 'coach proposal' })),
      days: calendar.map((date) => {
        const d = byDate.get(date);
        // done: a finished session of this day; missed: its date passed without one; rest: nothing planned.
        // A draft has not started, so none of its days are missed.
        const state = !d ? 'rest' : doneDays.has(d.dayId) ? 'done' : date < today && camp.status !== 'draft' ? 'missed' : 'upcoming';
        return {
          date,
          week: d?.week ?? null,
          workout: d ? { id: d.workoutId, name: workoutName.get(d.workoutId) ?? null } : null,
          state,
          is_today: date === today,
          overrides: d ? overrides.filter((o) => o.campaign_day_id === d.dayId).map((o) => {
            const base = items.find((i) => i.id === o.workout_item_id);
            const effective = ex.get(o.exercise_id ?? base?.exercise_id ?? '');
            return {
              item_id: o.workout_item_id,
              workout_exercise: ex.get(base?.exercise_id ?? '')?.name ?? null,
              exercise: o.exercise_id ? ex.get(o.exercise_id)?.name ?? null : null,
              sets: o.sets,
              reps: o.reps,
              weight: o.weight_lb === null || o.weight_entered_value === null || !o.weight_entered_unit ? null
                : weightOut(Number(o.weight_lb), { value: Number(o.weight_entered_value), unit: o.weight_entered_unit }, effective?.default_unit ?? o.weight_entered_unit),
              rest_seconds: o.rest_seconds,
            };
          }) : [],
        };
      }),
    },
    drafts: drafts.filter((x) => x.id !== camp.id),
  };
}

export const LIBRARY_TOOLS: ToolDef[] = [
  { name: 'list_exercises', input: listExercisesInput, readOnly: true, run: (c, a) => listExercises(c, a) },
  { name: 'list_workouts', input: listWorkoutsInput, readOnly: true, run: (c, a) => listWorkouts(c, a) },
  { name: 'get_campaign', input: campaignInput, readOnly: true, run: (c, a) => getCampaign(c, a) },
];
