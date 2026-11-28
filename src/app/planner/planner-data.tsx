'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import type { ViewUnit } from '@/rules/planner';

// What every planner screen reads: the person's library and campaigns, loaded
// once with their own sign-in (row-level security keeps each person to their
// own rows) and loaded again after any change.

export interface Term { id: string; kind: 'muscle_group' | 'focus' | 'equipment'; name: string; parent_id: string | null; sort_order: number; archived_at: string | null }
export interface Ex {
  id: string; name: string; muscle_group_id: string | null; focus_id: string | null; equipment_id: string | null;
  default_unit: 'lb' | 'kg' | 'bw'; work_seconds: number; rest_seconds: number; note: string; assisted: boolean; load_count: number;
  created_via: string; archived_at: string | null;
}
export interface Alt { id: string; exercise_id: string; tier: 'bodyweight' | 'basic_gym' | 'full_gym'; name: string; alternate_exercise_id: string | null }
export interface Wk { id: string; name: string; archived_at: string | null }
export interface Item { id: string; workout_id: string; position: number; exercise_id: string; sets: number; reps: number; rest_seconds: number | null; superset_letter: string | null }
export interface Camp { id: string; name: string; start_date: string; week_count: number; status: 'draft' | 'active' | 'finished'; updated_at: string }
export interface Day { id: string; campaign_id: string; week: number; weekday: number; workout_id: string }
export interface Ovr {
  id: string; campaign_day_id: string; workout_item_id: string; exercise_id: string | null; sets: number | null; reps: number | null;
  weight_lb: number | null; weight_entered_value: number | null; weight_entered_unit: 'lb' | 'kg' | null; rest_seconds: number | null;
}
export interface Shift { id: string; campaign_id: string; blank_week_starts_on: string }

export interface Data {
  userId: string; timeZone: string;
  terms: Term[]; exercises: Ex[]; alternates: Alt[]; workouts: Wk[]; items: Item[];
  campaigns: Camp[]; days: Day[]; overrides: Ovr[]; shifts: Shift[];
}

interface Ctx {
  data: Data | null;
  error: string;
  reload: () => Promise<void>;
  view: ViewUnit;
  setView: (v: ViewUnit) => void;
  /** An exercise shown in the exercise panel wherever it appears. */
  panelId: string | null;
  showInPanel: (id: string | null) => void;
}

const PlannerCtx = createContext<Ctx | null>(null);
export function usePlanner(): Ctx & { data: Data } {
  const c = useContext(PlannerCtx);
  if (!c) throw new Error('Planner data is not available here');
  return c as Ctx & { data: Data };
}
export function usePlannerMaybe(): Ctx | null {
  return useContext(PlannerCtx);
}

const nums = <T,>(row: T, keys: string[]): T => {
  const out: Record<string, unknown> = { ...(row as object) };
  for (const k of keys) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
  return out as T;
};

export function PlannerProvider({ children }: { children: React.ReactNode }) {
  const sb = browserClient();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [view, setViewState] = useState<ViewUnit>('lb');
  const [panelId, setPanelId] = useState<string | null>(null);

  useEffect(() => {
    try { const v = window.localStorage.getItem('planner-view'); if (v === 'kg' || v === 'lb') setViewState(v); } catch { /* the choice is just not remembered */ }
  }, []);
  const setView = useCallback((v: ViewUnit) => {
    setViewState(v);
    try { window.localStorage.setItem('planner-view', v); } catch { /* not remembered */ }
  }, []);

  const reload = useCallback(async () => {
    const [auth, prof, terms, ex, alts, wk, items, camps, days, ovr, shifts] = await Promise.all([
      sb.auth.getUser(),
      sb.from('profiles').select('time_zone').maybeSingle(),
      sb.from('vocabulary_terms').select('id, kind, name, parent_id, sort_order, archived_at').order('sort_order'),
      sb.from('exercises').select('id, name, muscle_group_id, focus_id, equipment_id, default_unit, work_seconds, rest_seconds, note, assisted, load_count, created_via, archived_at').order('name'),
      sb.from('exercise_alternates').select('id, exercise_id, tier, name, alternate_exercise_id'),
      sb.from('workouts').select('id, name, archived_at').order('name'),
      sb.from('workout_items').select('id, workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter').order('position'),
      sb.from('campaigns').select('id, name, start_date, week_count, status, updated_at').order('created_at'),
      sb.from('campaign_days').select('id, campaign_id, week, weekday, workout_id'),
      sb.from('campaign_day_overrides').select('id, campaign_day_id, workout_item_id, exercise_id, sets, reps, weight_lb, weight_entered_value, weight_entered_unit, rest_seconds'),
      sb.from('campaign_shifts').select('id, campaign_id, blank_week_starts_on'),
    ]);
    const bad = [terms, ex, alts, wk, items, camps, days, ovr, shifts].find((r) => r.error);
    if (bad?.error) { setError(bad.error.message); return; }
    setError('');
    setData({
      userId: auth.data.user?.id ?? '',
      timeZone: (prof.data as { time_zone?: string } | null)?.time_zone ?? 'America/Denver',
      terms: (terms.data ?? []) as Term[],
      exercises: (ex.data ?? []).map((e) => nums(e as unknown as Ex, ['work_seconds', 'rest_seconds', 'load_count'])),
      alternates: (alts.data ?? []) as Alt[],
      workouts: (wk.data ?? []) as Wk[],
      items: (items.data ?? []) as Item[],
      campaigns: (camps.data ?? []) as Camp[],
      days: (days.data ?? []) as Day[],
      overrides: (ovr.data ?? []).map((o) => nums(o as unknown as Ovr, ['weight_lb', 'weight_entered_value'])),
      shifts: (shifts.data ?? []) as Shift[],
    });
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);

  const value = useMemo<Ctx>(() => ({ data, error, reload, view, setView, panelId, showInPanel: setPanelId }), [data, error, reload, view, setView, panelId]);
  return <PlannerCtx.Provider value={value}>{children}</PlannerCtx.Provider>;
}

/** Plain words for a database refusal. */
export function plainError(message: string): string {
  if (/exercises_live_name|duplicate key/i.test(message)) return 'That name is already used by another live exercise.';
  if (/superset/i.test(message)) return message.replace(/^.*?(Superset)/i, '$1');
  if (/used by an exercise/i.test(message)) return 'This value is used by an exercise. Archive it instead of deleting it.';
  return message;
}
