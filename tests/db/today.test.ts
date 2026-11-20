// The Home screen's Today panel, against the test database: a workout started
// from today's campaign day is saved as that day, and one started from a plan
// sent to the phone uses the plan up.
import { beforeAll, describe, expect, it } from 'vitest';
import { makeDb, type Db } from './harness';
import { startSession, type PlanItem } from '@/rules/session';
import { sessionChanges, type Change, type SyncAnswer } from '@/rules/sync';

let db: Db;
let a: string;
let bench: string;
let workout: string;
let day: string;

beforeAll(async () => {
  db = await makeDb();
  a = await db.register('a@example.test', 'Alex');
  bench = (await db.server<{ id: string }>(`select id from exercises where user_id = $1 and name = 'Barbell Bench Press'`, [a]))[0].id;
  workout = (await db.server<{ id: string }>(`insert into workouts (user_id, name) values ($1, 'Push') returning id`, [a]))[0].id;
  await db.server(`insert into workout_items (user_id, workout_id, position, exercise_id, sets, reps) values ($1, $2, 0, $3, 3, 8)`, [a, workout, bench]);
  const camp = (await db.server<{ id: string }>(`insert into campaigns (user_id, name, start_date, week_count, status) values ($1, 'Base', '2026-11-16', 4, 'active') returning id`, [a]))[0].id;
  day = (await db.server<{ id: string }>(`insert into campaign_days (user_id, campaign_id, week, weekday, workout_id) values ($1, $2, 1, 4, $3) returning id`, [a, camp, workout]))[0].id;
});

const send = async (cs: ReturnType<typeof sessionChanges>) => {
  const wire = cs.map((c) => ({ id: crypto.randomUUID(), kind: c.kind, data: c.data })) as Pick<Change, 'id' | 'kind' | 'data'>[];
  const rows = await db.as<{ r: unknown }>(a, `select apply_changes($1::jsonb) as r`, [JSON.stringify(wire)]);
  const r = rows[0].r;
  return (typeof r === 'string' ? JSON.parse(r) : r) as SyncAnswer;
};
const plan: PlanItem[] = [];

describe('a workout started from the Today panel', () => {
  it('is saved as the campaign day it came from', async () => {
    plan.push({ exerciseId: bench, name: 'Barbell Bench Press', muscle: '', equipment: '', unit: 'lb', assisted: false, loadCount: 1, work: 45, rest: 120, sets: 3, reps: 8, alternates: [] });
    const s = { ...startSession('Push', '2026-11-19', plan, {}, Date.parse('2026-11-19T17:00:00Z'), (_i, n) => Array(n).fill(null), workout), campaignDayId: day };
    const r = await send(sessionChanges(null, s));
    expect(r.rejected).toEqual([]);
    const [row] = await db.as<{ source_kind: string; campaign_day_id: string }>(a, `select source_kind, campaign_day_id from sessions where id = $1`, [s.id]);
    expect(row).toEqual({ source_kind: 'campaign_day', campaign_day_id: day });
    await db.server(`update sessions set status = 'finished', ended_at = now(), finish_reason = 'user' where id = $1`, [s.id]);
  });

  it('uses up a plan sent to the phone for today', async () => {
    const tp = (await db.server<{ id: string }>(
      `insert into today_plans (user_id, local_date, source_kind, workout_id, plan, made_by) values ($1, '2026-11-19', 'workout', $2, $3, 'user') returning id`,
      [a, workout, JSON.stringify([{ exercise_id: bench, sets: 5, reps: 5 }])]))[0].id;
    const s = { ...startSession('Push', '2026-11-19', plan, {}, Date.parse('2026-11-19T18:00:00Z'), (_i, n) => Array(n).fill(null), workout), todayPlanId: tp };
    const r = await send(sessionChanges(null, s));
    expect(r.rejected).toEqual([]);
    const [row] = await db.as<{ consumed_at: string | null }>(a, `select consumed_at from today_plans where id = $1`, [tp]);
    expect(row.consumed_at).not.toBeNull();
  });
});
