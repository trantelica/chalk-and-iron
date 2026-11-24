import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, mondayOf } from '@/rules/days';
import { todayView, type TodayInput } from '@/rules/today';
import type { Data } from './planner-data';

/**
 * Whether today already has a workout (spec Section 10: a day sent when today
 * has none becomes today's plan at once; otherwise it arrives as a card).
 * "Has a workout" means today's plan from the campaign or a prepared plan (done
 * or not), or a workout running now. A workout done ad hoc earlier is not a plan.
 */
export async function todayState(sb: SupabaseClient, data: Data, date: string): Promise<{
  workoutName: string | null; running: string | null; pendingCards: number;
}> {
  const monday = mondayOf(date);
  const [plans, sess, pend, live] = await Promise.all([
    sb.from('today_plans').select('id, local_date, workout_id, campaign_day_id, plan, consumed_at, created_at').eq('local_date', date).is('consumed_at', null),
    sb.from('sessions').select('id, local_date, status, campaign_day_id, workout_name, finish_reason').gte('local_date', monday).lte('local_date', addDays(monday, 6)),
    sb.from('proposals').select('payload, expires_at').eq('status', 'pending').eq('source', 'planner'),
    // A workout still running, whenever it started (one left on past Monday 3:00 am counts too; review finding 8).
    sb.from('sessions').select('workout_name').eq('status', 'active').limit(1),
  ]);
  const sessions = (sess.data ?? []) as TodayInput['sessions'];
  const view = todayView({
    date,
    campaigns: data.campaigns,
    days: data.days,
    shifts: data.shifts,
    overrides: data.overrides.map((o) => ({ campaign_day_id: o.campaign_day_id, workout_item_id: o.workout_item_id, exercise_id: o.exercise_id, sets: o.sets, reps: o.reps, weight_lb: o.weight_lb, rest_seconds: o.rest_seconds })),
    workouts: data.workouts,
    items: data.items.map((i) => ({ id: i.id, workout_id: i.workout_id, position: i.position, exercise_id: i.exercise_id, sets: i.sets, reps: i.reps, rest_seconds: i.rest_seconds, superset_letter: i.superset_letter })),
    todayPlans: (plans.data ?? []) as TodayInput['todayPlans'],
    sessions,
  });
  const running = ((live.data ?? []) as { workout_name: string }[])[0]?.workout_name ?? null;
  const today = new Date();
  const waiting = ((pend.data ?? []) as { payload: { local_date?: string } | null; expires_at: string | null }[])
    .filter((p) => (!p.expires_at || Date.parse(p.expires_at) > today.getTime()) && p.payload?.local_date === date).length;
  return { workoutName: view.workout?.name ?? null, running, pendingCards: waiting };
}
