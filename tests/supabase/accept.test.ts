// Stage 4D on Supabase's own local version: a card a real coach pass adds is
// decided through the real API with the person's own sign-in, using the same
// helper the inbox uses (src/lib/decide.ts). A coach's pass cannot decide it.
import { beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decideCard } from '@/lib/decide';
import { trainingDay } from '@/rules/days';
import { connectCoach, registerAccount, sql, url } from './helpers';

const asPass = (access: string): SupabaseClient => createClient(url(), process.env.SUPABASE_TEST_PUBLISHABLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${access}` } },
});

let person: Awaited<ReturnType<typeof registerAccount>>;
let coach: SupabaseClient;
const exId = async (name: string) => (await sql<{ id: string }>(`select id from exercises where user_id = $1 and name = $2`, [person.id, name]))[0].id;

beforeAll(async () => {
  person = await registerAccount('Deciding');
  coach = asPass((await connectCoach(person.client)).access);
});

async function card(kind: string, applies: string, payload: unknown) {
  const { data, error } = await coach.from('proposals')
    .insert({ user_id: person.id, source: 'Claude', kind, applies_to: applies, summary_lines: ['One change'], payload })
    .select('id').single();
  expect(error).toBeNull();
  return data!.id as string;
}

describe('Accept and Decline through the API', () => {
  it('a workout card with a new exercise is accepted whole', async () => {
    const [chest] = await sql<{ id: string }>(`select id from vocabulary_terms where user_id = $1 and kind = 'muscle_group' and name = 'Chest'`, [person.id]);
    const [db] = await sql<{ id: string }>(`select id from vocabulary_terms where user_id = $1 and kind = 'equipment' and name = 'dumbbell'`, [person.id]);
    const id = await card('workout', 'library', {
      name: 'Coach Push', new_exercises: [{ ref: 'n1', name: 'Coach Squeeze Press', muscle_group_id: chest.id, equipment_id: db.id, default_unit: 'lb',
        work_seconds: 40, rest_seconds: 90, alternates: { bodyweight: 'Bodyweight Push-Up', basic_gym: 'Dumbbell Bench Press', full_gym: 'Barbell Bench Press' } }],
      items: [{ new_exercise: 'n1', sets: 3, reps: 10 }, { exercise_id: await exId('Barbell Bench Press'), sets: 3, reps: 5 }],
    });
    // The coach's pass cannot decide it.
    const refused = await coach.rpc('decide_proposal', { p_proposal: id, p_accept: true });
    expect(refused.error).not.toBeNull();
    const r = await decideCard(person.client, id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted' });
    expect((await sql(`select 1 from workouts where user_id = $1 and name = 'Coach Push'`, [person.id])).length).toBe(1);
  });

  it("a change to today is held in today's plan", async () => {
    // A workout for today, prepared as a day sent from the planner would be.
    const today = trainingDay(new Date(), 'America/Denver');
    await sql(`update profiles set time_zone = 'America/Denver' where id = $1`, [person.id]);
    const bench = await exId('Barbell Bench Press');
    await sql(`insert into today_plans (user_id, local_date, source_kind, plan, made_by) values ($1, $2, 'workout', $3, 'user')`,
      [person.id, today, JSON.stringify({ items: [{ exercise_id: bench, sets: 3, reps: 8 }], name: 'Today' })]);
    const id = await card('today_change', 'today', { local_date: today, changes: [{ action: 'set_sets', exercise_id: bench, sets: 5 }] });
    const r = await decideCard(person.client, id, true);
    expect(r).toMatchObject({ ok: true, status: 'accepted' });
    const [plan] = await sql<{ plan: { items: { sets: number }[] } }>(`select plan from today_plans where made_by = $1`, [`proposal:${id}`]);
    expect(plan.plan.items[0].sets).toBe(5);
  });

  it('a decline keeps its reason, which the coach can read', async () => {
    const id = await card('exercise', 'library', { exercise_id: await exId('Barbell Curl'), rest_seconds: 60 });
    expect(await decideCard(person.client, id, false, 'Keep my rest as it is')).toMatchObject({ ok: true, status: 'rejected' });
    const { data } = await coach.from('proposals').select('status, decline_reason').eq('id', id).single();
    expect(data).toEqual({ status: 'rejected', decline_reason: 'Keep my rest as it is' });
  });
});
