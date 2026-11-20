import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, mondayOf } from '@/rules/days';
import { todayView, type TodayInput, type TodayView } from '@/rules/today';

// Reads what the Today panel needs, with the signed-in person's own access,
// so row-level security keeps each person to their own rows.
export async function loadToday(supabase: SupabaseClient, date: string): Promise<TodayView & { pendingProposals: number }> {
  const [camps, plans, pend] = await Promise.all([
    supabase.from('campaigns').select('id, name, start_date, week_count, status').eq('status', 'active'),
    supabase.from('today_plans').select('id, local_date, workout_id, campaign_day_id, plan, consumed_at, created_at').eq('local_date', date).is('consumed_at', null),
    supabase.from('proposals').select('expires_at').eq('status', 'pending'),
  ]);
  const campaigns = (camps.data ?? []) as TodayInput['campaigns'];
  const todayPlans = (plans.data ?? []) as TodayInput['todayPlans'];
  const campaignIds = campaigns.map((c) => c.id);
  const [days, shifts] = campaignIds.length
    ? await Promise.all([
      supabase.from('campaign_days').select('id, campaign_id, week, weekday, workout_id').in('campaign_id', campaignIds),
      supabase.from('campaign_shifts').select('campaign_id, blank_week_starts_on').in('campaign_id', campaignIds),
    ])
    : [{ data: [] }, { data: [] }];
  const dayRows = (days.data ?? []) as TodayInput['days'];
  const dayIds = [...dayRows.map((d) => d.id), ...todayPlans.flatMap((p) => (p.campaign_day_id ? [p.campaign_day_id] : []))];
  const workoutIds = [...new Set([...dayRows.map((d) => d.workout_id), ...todayPlans.flatMap((p) => (p.workout_id ? [p.workout_id] : []))])];
  const monday = mondayOf(date);
  const [overrides, workouts, items, weekSessions, daySessions] = await Promise.all([
    dayIds.length ? supabase.from('campaign_day_overrides').select('campaign_day_id, workout_item_id, exercise_id, sets, reps, weight_lb, rest_seconds').in('campaign_day_id', dayIds) : { data: [] },
    workoutIds.length ? supabase.from('workouts').select('id, name, archived_at').in('id', workoutIds) : { data: [] },
    workoutIds.length ? supabase.from('workout_items').select('id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter').in('workout_id', workoutIds) : { data: [] },
    supabase.from('sessions').select('id, local_date, status, campaign_day_id, workout_name').gte('local_date', monday).lte('local_date', addDays(monday, 6)),
    dayIds.length ? supabase.from('sessions').select('id, local_date, status, campaign_day_id, workout_name').in('campaign_day_id', dayIds) : { data: [] },
  ]);
  const sessions = new Map<string, TodayInput['sessions'][number]>();
  for (const s of [...(weekSessions.data ?? []), ...(daySessions.data ?? [])] as TodayInput['sessions']) sessions.set(s.id, s);
  const view = todayView({
    date, campaigns, todayPlans, days: dayRows,
    shifts: (shifts.data ?? []) as TodayInput['shifts'],
    overrides: (overrides.data ?? []) as TodayInput['overrides'],
    workouts: (workouts.data ?? []) as TodayInput['workouts'],
    items: (items.data ?? []) as TodayInput['items'],
    sessions: [...sessions.values()],
  });
  // A today proposal past its 3:00 am expiry no longer waits for a decision.
  const now = Date.now();
  const pendingProposals = (pend.data ?? []).filter((x) => !x.expires_at || Date.parse(x.expires_at as string) > now).length;
  return { ...view, pendingProposals };
}
