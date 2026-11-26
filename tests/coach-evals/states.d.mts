// Types for states.mjs, which stays plain JavaScript so the reset script runs with plain Node.
export const TIME_ZONE: string;
export const STATES: Record<
  | 'empty_profile' | 'intake_no_campaign' | 'standard' | 'workout_running' | 'workout_running_superset'
  | 'declined_no_reason' | 'campaign_last_week' | 'two_missed' | 'steady_all_hit' | 'aggressive_misses'
  | 'style_supportive' | 'style_challenging' | 'knee_injury',
  string
>;
export interface EvalState {
  name: string;
  profile: { time_zone: string; totals_unit: 'lb' | 'kg' };
  coach_profile: Record<string, unknown>;
  rows: Array<{ table: string; rows: Array<Record<string, unknown>> }>;
}
export function buildState(
  name: keyof typeof STATES,
  opts: { starter: { exercises: Array<{ name: string; work_seconds: number; rest_seconds: number }> }; now?: Date },
): EvalState;
export function addDays(date: string, days: number): string;
export function weekday(date: string): number;
export function mondayOf(date: string): string;
export function trainingDay(at: Date, timeZone?: string): string;
