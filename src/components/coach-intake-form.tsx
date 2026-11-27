'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { AreaCell, NumCell, Tick, useMark } from '@/app/planner/fields';
import {
  buildPriorities, COACH_STYLES, DAYS_RANGE, EXPERIENCE, FREE_TEXT_MAX, intakeProgress, MINUTES_RANGE, OTHER_MAX, PACES,
  PRIORITY_CHOICES, PRIORITY_SLOTS, slotsFromPriorities, VARIETY, type Choice, type Intake, type PrioritySlot,
} from '@/rules/coach-intake';

// The coach intake (spec Section 4, "Coach intake"), the same form on Coach
// setup and on Profile and gyms. Every field may stay empty. Each answer is
// saved on its own, as it is picked or when the person leaves the box, and the
// database refuses any answer outside its list.

const COLUMNS = 'coach_style, experience, priorities, progression_pace, workout_minutes, days_per_week, variety, goals, injuries_and_limits, weekly_schedule, exercises_liked, exercises_to_avoid, how_to_coach_me';

function Pick({ label, value, choices, onSave }: { label: string; value: string | null; choices: Choice[]; onSave: (v: string | null) => void | Promise<void> }) {
  const { mark, run } = useMark();
  return (
    <label className="intake-field">
      {label}
      <span className="cell">
        <select aria-label={label} value={value ?? ''} className={mark ? `is-${mark}` : undefined} onChange={(e) => void run(onSave(e.target.value || null))}>
          <option value="">Not answered</option>
          {choices.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <Tick mark={mark} />
      </span>
    </label>
  );
}

function Priorities({ stored, onSave }: { stored: unknown; onSave: (list: { value: string; text?: string }[]) => Promise<void> }) {
  const [slots, setSlots] = useState<PrioritySlot[]>(slotsFromPriorities(stored));
  const [err, setErr] = useState('');
  const { mark, run } = useMark();
  const storedKey = JSON.stringify(stored ?? []);
  // Once the person has touched these boxes they are the truth: another answer saving, and the
  // reload after it, must not wipe a box that is half filled in. A page reload shows what is stored.
  const touched = useRef(false);
  useEffect(() => { if (!touched.current) setSlots(slotsFromPriorities(stored)); }, [storedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (i: number, patch: Partial<PrioritySlot>, save: boolean) => {
    touched.current = true;
    const next = slots.map((s, j) => (j === i ? { ...s, ...patch } : s));
    setSlots(next);
    if (!save) return;
    const r = buildPriorities(next);
    if (!r.ok) { setErr(r.error); return; }
    setErr('');
    void run(onSave(r.list));
  };
  const ranks = ['1st', '2nd', '3rd'];
  return (
    <div className="intake-field" role="group" aria-label="Priorities">
      <span className="lab-text">Priorities, up to {PRIORITY_SLOTS}, most important first <Tick mark={mark} /></span>
      {slots.map((s, i) => (
        <div key={i} className="priority-slot">
          <span className="rank">{ranks[i]}</span>
          <select aria-label={`Priority ${ranks[i]}`} value={s.value} onChange={(e) => change(i, { value: e.target.value, text: e.target.value === 'other' ? s.text : '' }, e.target.value !== 'other' || !!s.text.trim())}>
            <option value="">None</option>
            {PRIORITY_CHOICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {s.value === 'other' && (
            <input type="text" aria-label={`Your own priority ${ranks[i]}`} maxLength={OTHER_MAX} value={s.text} placeholder="For example: rock climbing"
              onChange={(e) => { touched.current = true; setSlots(slots.map((x, j) => (j === i ? { ...x, text: e.target.value } : x))); }}
              onBlur={() => change(i, {}, true)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          )}
        </div>
      ))}
      {err && <div className="error" role="alert">{err}</div>}
    </div>
  );
}

export function useIntake() {
  const sb = browserClient();
  const [data, setData] = useState<Partial<Intake> | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await sb.from('coach_profiles').select(COLUMNS).maybeSingle();
    if (r.error) { setError('Your answers could not be read: ' + r.error.message); return; }
    setError('');
    setData((r.data ?? {}) as unknown as Partial<Intake>);
  }, [sb]);
  useEffect(() => { void load(); }, [load]);
  const save = useCallback(async (patch: Record<string, unknown>) => {
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) { setError('You are signed out. Sign in again.'); throw new Error('signed out'); }
    const r = await sb.from('coach_profiles').upsert({ user_id: auth.user.id, ...patch }, { onConflict: 'user_id' });
    if (r.error) { setError('Not saved: ' + r.error.message); throw new Error(r.error.message); }
    setError('');
    await load();
  }, [sb, load]);
  return { data, error, save };
}

/** The whole intake. `onChange` tells the page how much is answered, for its progress line. */
export function IntakeForm({ intake }: { intake: ReturnType<typeof useIntake> }) {
  const { data, error, save } = intake;
  if (!data) return <p className="muted">{error || 'Loading your answers…'}</p>;
  const p = intakeProgress(data);
  const text = (k: keyof Intake, label: string, hint: string, rows = 3) => (
    <div className="intake-field">
      <span className="lab-text">{label}</span>
      <AreaCell label={label} max={FREE_TEXT_MAX} rows={rows} placeholder={hint} value={(data[k] as string | undefined) ?? ''} onSave={(v) => save({ [k]: v })} />
    </div>
  );
  return (
    <div className="intake">
      {error && <div className="error" role="alert">{error}</div>}
      <div className="muted" aria-live="polite">{p.answered} of {p.total} answered. Every question is optional: whatever you leave out, your coach asks you in the chat.</div>
      <Pick label="Coach style" value={data.coach_style ?? null} choices={COACH_STYLES} onSave={(v) => save({ coach_style: v })} />
      <Pick label="Experience" value={data.experience ?? null} choices={EXPERIENCE} onSave={(v) => save({ experience: v })} />
      <Priorities stored={data.priorities} onSave={(list) => save({ priorities: list })} />
      <Pick label="Progression pace" value={data.progression_pace ?? null} choices={PACES} onSave={(v) => save({ progression_pace: v })} />
      <div className="intake-field">
        <span className="lab-text">Workout length, in minutes ({MINUTES_RANGE[0]} to {MINUTES_RANGE[1]})</span>
        <NumCell label="Workout length in minutes" value={data.workout_minutes ?? null} min={MINUTES_RANGE[0]} max={MINUTES_RANGE[1]} step={5} blank width={110}
          onSave={(v) => save({ workout_minutes: v })} />
      </div>
      <div className="intake-field">
        <span className="lab-text">Days per week ({DAYS_RANGE[0]} to {DAYS_RANGE[1]})</span>
        <NumCell label="Days per week" value={data.days_per_week ?? null} min={DAYS_RANGE[0]} max={DAYS_RANGE[1]} blank width={90}
          onSave={(v) => save({ days_per_week: v })} />
      </div>
      {text('weekly_schedule', 'Which days', 'For example: Monday, Wednesday and Saturday mornings', 2)}
      <Pick label="Variety" value={data.variety ?? null} choices={VARIETY} onSave={(v) => save({ variety: v })} />
      {text('goals', 'Goals', 'For example: bench 225 by March')}
      {text('injuries_and_limits', 'Injuries and limits', 'For example: a sore left shoulder, no overhead pressing')}
      {text('exercises_liked', 'Exercises I like', 'For example: deadlifts, pull-ups')}
      {text('exercises_to_avoid', 'Exercises to avoid', 'For example: upright rows')}
      {text('how_to_coach_me', 'Anything else about how to coach me', 'For example: keep explanations short; I train early and have 45 minutes')}
    </div>
  );
}
