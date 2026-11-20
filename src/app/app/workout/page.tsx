import { redirect } from 'next/navigation';
import { serverClient } from '@/lib/supabase/server';
import { trainingDay } from '@/rules/days';
import { WorkoutApp, type LibExercise, type LibWorkout } from './workout-app';
import type { VocabTerm } from '@/rules/swap-made';
import { loadToday } from '@/server/today';

// The phone's workout screens: start a workout, then the active workout with
// its tray, stats and swap. The library and the saved lb/kg choices are read
// here, on the server, with the signed-in person's own access. The running
// session lives on the phone and is sent to the account as it changes
// (design Section 6); its history comes from the account too.
export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  const supabase = await serverClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/signin');

  const [ex, vocab, alts, wk, items, prof, units] = await Promise.all([
    supabase.from('exercises').select('id, name, muscle_group_id, focus_id, equipment_id, default_unit, work_seconds, rest_seconds, note, assisted, load_count').is('archived_at', null).order('name'),
    supabase.from('vocabulary_terms').select('id, name, kind, parent_id, archived_at').order('sort_order'),
    supabase.from('exercise_alternates').select('exercise_id, tier, name'),
    supabase.from('workouts').select('id, name').is('archived_at', null).order('name'),
    supabase.from('workout_items').select('workout_id, position, exercise_id, sets, reps, rest_seconds, superset_letter').order('position'),
    supabase.from('profiles').select('time_zone').maybeSingle(),
    supabase.from('exercise_display_units').select('exercise_id, unit'),
  ]);

  const term = new Map((vocab.data ?? []).map((v) => [v.id as string, v.name as string]));
  const altsBy = new Map<string, LibExercise['alternates']>();
  for (const a of alts.data ?? []) {
    const list = altsBy.get(a.exercise_id as string) ?? [];
    list.push({ tier: a.tier as LibExercise['alternates'][number]['tier'], name: a.name as string });
    altsBy.set(a.exercise_id as string, list);
  }
  const exercises: LibExercise[] = (ex.data ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    muscleId: (e.muscle_group_id as string | null) ?? null,
    focusId: (e.focus_id as string | null) ?? null,
    equipmentId: (e.equipment_id as string | null) ?? null,
    muscle: term.get(e.muscle_group_id as string) ?? '',
    equipment: term.get(e.equipment_id as string) ?? '',
    unit: e.default_unit as LibExercise['unit'],
    work: e.work_seconds as number,
    rest: e.rest_seconds as number,
    note: (e.note as string) ?? '',
    assisted: Boolean(e.assisted),
    loadCount: (e.load_count as number) ?? 1,
    alternates: altsBy.get(e.id as string) ?? [],
  }));
  const workouts: LibWorkout[] = (wk.data ?? []).map((w) => ({
    id: w.id as string,
    name: w.name as string,
    items: (items.data ?? [])
      .filter((i) => i.workout_id === w.id)
      .map((i) => ({
        exerciseId: i.exercise_id as string,
        sets: i.sets as number,
        reps: i.reps as number,
        rest: (i.rest_seconds as number | null) ?? null,
        superset: (i.superset_letter as string | null) ?? null,
      })),
  }));
  // The vocabulary, for the one-tap confirm of an exercise made by a swap.
  const vocabulary: VocabTerm[] = (vocab.data ?? []).filter((v) => !v.archived_at).map((v) => ({
    id: v.id as string, kind: v.kind as VocabTerm['kind'], name: v.name as string, parentId: (v.parent_id as string | null) ?? null,
  }));
  const timeZone = (prof.data as { time_zone?: string } | null)?.time_zone ?? 'America/Denver';
  // Today's planned workout (the Home screen's Today panel starts it here with ?start=today).
  const today = await loadToday(supabase, trainingDay(new Date(), timeZone));
  const startToday = (await searchParams).start === 'today';
  const serverUnits = Object.fromEntries((units.data ?? []).map((u) => [u.exercise_id as string, u.unit as 'lb' | 'kg']));
  return (
    <WorkoutApp
      userId={auth.user.id} exercises={exercises} workouts={workouts} serverUnits={serverUnits} vocabulary={vocabulary} todayWorkout={today.doneToday ? null : today.workout} startToday={startToday}
      today={trainingDay(new Date(), timeZone)} timeZone={timeZone}
    />
  );
}
