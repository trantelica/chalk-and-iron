// One of every kind of record, owned by one person, written as the server.
import type { Db } from './harness';

export async function fillAccount(db: Db, user: string) {
  const one = async (sql: string, params: unknown[] = []) => (await db.server<{ id: string }>(sql, params))[0]?.id;
  const ex = (name: string) => one(`select id from exercises where user_id = $1 and name = $2`, [user, name]);
  const bench = await ex('Barbell Bench Press');
  const row = await ex('Barbell Bent-Over Row');
  const curl = await ex('Barbell Curl');
  const gym = await one(`insert into gyms (user_id, name, equipment, is_default) values ($1, 'Home', '{rower}', true) returning id`, [user]);
  await one(`insert into push_subscriptions (user_id, endpoint, keys) values ($1::uuid, 'https://push.example/' || $1::text, '{}') returning id`, [user]);
  await db.server(`insert into exercise_display_units (user_id, exercise_id, unit) values ($1, $2, 'kg')`, [user, bench]);
  const workout = await one(`insert into workouts (user_id, name) values ($1, 'Push A') returning id`, [user]);
  // Superset members go in together: the database checks the pair at the end of each step.
  const items = (await db.server<{ id: string }>(
    `insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps, superset_letter)
     values ($1, $2, 0, $3, 3, 8, 'A'), ($1, $2, 1, $4, 3, 8, 'A'), ($1, $2, 2, $5, 3, 8, null) returning id`,
    [user, workout, bench, row, curl])).map((r) => r.id);
  const campaign = await one(`insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Block 1', '2026-11-16', 4, 'active') returning id`, [user]);
  await one(`insert into campaign_shifts (user_id, campaign_id, blank_week_starts_on, made_by) values ($1, $2, '2026-11-30', 'user') returning id`, [user, campaign]);
  const day = await one(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 1, $3) returning id`, [user, campaign, workout]);
  await one(`insert into campaign_day_overrides (user_id, campaign_day_id, workout_id, workout_item_id, reps) values ($1, $2, $3, $4, 10) returning id`, [user, day, workout, items[2]]);
  await one(`insert into today_plans (user_id, local_date, source_kind, workout_id, plan, made_by) values ($1, '2026-11-17', 'workout', $2, '[]', 'user') returning id`, [user, workout]);
  const session = await one(
    `insert into sessions (user_id, local_date, source_kind, campaign_day_id, workout_id, workout_name, gym_id, started_at) values ($1, '2026-11-16', 'campaign_day', $2, $3, 'Push A', $4, now()) returning id`,
    [user, day, workout, gym]);
  const block = await one(`insert into session_blocks (user_id, session_id, position, time_budget_seconds) values ($1, $2, 0, 450) returning id`, [user, session]);
  const se = await one(
    `insert into session_exercises (user_id, session_id, block_id, exercise_id, exercise_name_then, planned_set_types, planned_reps, planned_rest_seconds, work_seconds)
     values ($1, $2, $3, $4, 'Barbell Curl', '{working,working,working}', 8, 90, 45) returning id`, [user, session, block, curl]);
  await one(`insert into set_logs (user_id, session_exercise_id, set_number, weight_lb, entered_value, entered_unit, reps, logged_at) values ($1, $2, 1, 60, 60, 'lb', 8, now()) returning id`, [user, se]);
  await one(`insert into cardio_logs (user_id, local_date, type, duration_seconds) values ($1, '2026-11-16', 'Rower', 600) returning id`, [user]);
  const proposal = await one(
    `insert into proposals (user_id, source, kind, applies_to, summary_lines, payload) values ($1, 'ChatGPT', 'exercise', 'library', '{"Rename it"}', '{}') returning id`, [user]);
  await one(`insert into proposal_targets (user_id, proposal_id, record_kind, record_id, version_seen) values ($1, $2, 'exercises', $3, 1) returning id`, [user, proposal, bench]);
  await one(`insert into connector_calls (user_id, client_name, tool, ok) values ($1, 'ChatGPT', 'get_profile', true) returning id`, [user]);
  await one(`insert into rest_alerts (user_id, session_id, fire_at) values ($1, $2, now()) returning id`, [user, session]);
  await db.server(`insert into received_changes (change_id, user_id) values (gen_random_uuid(), $1)`, [user]);
  return { bench, row, curl, gym, workout, items, campaign, day, session, block, se, proposal };
}

/** Every table that holds a person's own rows, and its owner column. */
export const OWNED_TABLES: Array<[table: string, owner: string]> = [
  ['profiles', 'id'], ['coach_profiles', 'user_id'], ['gyms', 'user_id'], ['push_subscriptions', 'user_id'],
  ['vocabulary_terms', 'user_id'], ['exercises', 'user_id'], ['exercise_display_units', 'user_id'],
  ['exercise_alternates', 'user_id'], ['workouts', 'user_id'], ['workout_items', 'user_id'], ['campaigns', 'user_id'],
  ['campaign_shifts', 'user_id'], ['campaign_days', 'user_id'], ['campaign_day_overrides', 'user_id'],
  ['today_plans', 'user_id'], ['sessions', 'user_id'], ['session_blocks', 'user_id'], ['session_exercises', 'user_id'],
  ['set_logs', 'user_id'], ['cardio_logs', 'user_id'], ['proposals', 'user_id'], ['proposal_targets', 'user_id'],
  ['connector_calls', 'user_id'], ['rest_alerts', 'user_id'], ['received_changes', 'user_id'],
];
