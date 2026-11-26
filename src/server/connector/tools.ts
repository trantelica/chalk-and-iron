import { z } from 'zod';
import { trainingDay } from '@/rules/days';
import type { Caller } from './auth';
import { TOOL_TEXT } from './descriptions';
import { nextInput, page, PAGE_SIZE, readNext } from './limits';

// The connector's tools (design Section 3). Stage 4B: the first three read
// tools. Stages 4C and 4E add the rest here, each with its text in
// descriptions.ts.

export interface ToolDef {
  name: string;
  input: z.ZodType;
  readOnly: boolean;
  run: (caller: Caller, args: never) => Promise<Record<string, unknown>>;
}

const none = z.object({}).strict();

function failed(what: string, e: { message: string } | null): never {
  throw new Error(`${what}: ${e?.message ?? 'no data'}`);
}

const INTAKE_FIELDS = [
  'coach_style', 'experience', 'priorities', 'progression_pace', 'workout_minutes', 'days_per_week',
  'variety', 'exercises_liked', 'exercises_to_avoid', 'how_to_coach_me',
] as const;

async function getProfile(caller: Caller) {
  const [coach, gym] = await Promise.all([
    caller.db.from('coach_profiles').select(['goals', 'injuries_and_limits', 'weekly_schedule', 'notes', ...INTAKE_FIELDS].join(', ')).maybeSingle(),
    caller.db.from('gyms').select('id, name').eq('is_default', true).is('archived_at', null).maybeSingle(),
  ]);
  if (coach.error) failed('coach profile read', coach.error);
  if (gym.error) failed('default gym read', gym.error);
  const c = (coach.data ?? {}) as unknown as Record<string, unknown>;
  const text = (k: string) => (typeof c[k] === 'string' ? (c[k] as string) : '');
  const intake = {
    coach_style: c.coach_style ?? null,
    experience: c.experience ?? null,
    priorities: Array.isArray(c.priorities) ? c.priorities : [],
    progression_pace: c.progression_pace ?? null,
    workout_minutes: c.workout_minutes ?? null,
    days_per_week: c.days_per_week ?? null,
    variety: c.variety ?? null,
    exercises_liked: text('exercises_liked'),
    exercises_to_avoid: text('exercises_to_avoid'),
    how_to_coach_me: text('how_to_coach_me'),
  };
  const unanswered = INTAKE_FIELDS.filter((k) => {
    const v = intake[k];
    return v === null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  return {
    display_name: caller.me.display_name,
    goals: text('goals'),
    injuries_and_limits: text('injuries_and_limits'),
    weekly_schedule: text('weekly_schedule'),
    notes: text('notes'),
    intake,
    intake_unanswered: unanswered,
    totals_unit: caller.me.totals_unit,
    time_zone: caller.me.time_zone,
    today: trainingDay(new Date(), caller.me.time_zone),
    default_gym: gym.data ? { id: gym.data.id as string, name: gym.data.name as string } : null,
  };
}

const listGymsInput = z.object({ next: nextInput }).strict();

async function listGyms(caller: Caller, args: z.infer<typeof listGymsInput>) {
  const offset = readNext(args.next);
  const { data, error } = await caller.db
    .from('gyms')
    .select('id, name, equipment, notes, is_default')
    .is('archived_at', null)
    .order('is_default', { ascending: false })
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + PAGE_SIZE);
  if (error) failed('gyms read', error);
  const { items, next } = page(data ?? [], offset);
  return {
    gyms: items.map((g) => ({ id: g.id, name: g.name, equipment: g.equipment ?? [], notes: g.notes ?? '', is_default: g.is_default })),
    next,
  };
}

async function getVocabulary(caller: Caller) {
  const { data, error } = await caller.db
    .from('vocabulary_terms')
    .select('id, kind, name, parent_id, sort_order')
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) failed('vocabulary read', error);
  const rows = data ?? [];
  const groups = rows.filter((r) => r.kind === 'muscle_group');
  return {
    muscle_groups: groups.map((g) => ({ name: g.name, focus: rows.filter((r) => r.kind === 'focus' && r.parent_id === g.id).map((f) => f.name) })),
    equipment: rows.filter((r) => r.kind === 'equipment').map((r) => r.name),
    units: [
      { value: 'lb', meaning: 'pounds' },
      { value: 'kg', meaning: 'kilograms' },
      { value: 'bw', meaning: 'bodyweight: counted in reps, with no weight, and its volume kept apart from pounds and kilograms' },
    ],
    set_types: [
      { value: 'warm_up', meaning: 'a warm-up set, left out of records and volume' },
      { value: 'working', meaning: 'a working set' },
      { value: 'drop', meaning: 'a drop set' },
    ],
  };
}

export const TOOLS: ToolDef[] = [
  { name: 'get_profile', input: none, readOnly: true, run: (c) => getProfile(c) },
  { name: 'list_gyms', input: listGymsInput, readOnly: true, run: (c, a) => listGyms(c, a) },
  { name: 'get_vocabulary', input: none, readOnly: true, run: (c) => getVocabulary(c) },
];

/** The tools as tools/list shows them: name, title, description, input shape and annotations. */
export function toolList() {
  return TOOLS.map((t) => {
    const text = TOOL_TEXT[t.name];
    const schema = z.toJSONSchema(t.input) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: t.name,
      title: text.title,
      description: text.description,
      inputSchema: schema,
      // Design Section 3, "Annotations": the same labels Phase 0 proved.
      annotations: t.readOnly
        ? { title: text.title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
        : { title: text.title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    };
  });
}
