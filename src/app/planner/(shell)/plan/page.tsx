'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { trainingDay, nextRollover } from '@/rules/days';
import { mmss } from '@/rules/workout';
import {
  dateOfCampaignDay, effectiveRows, maxPlanWeight, overrideChange, overridesAny, planFromRows, rowBudget, sendSummary, typedToPounds, viewWeight,
  type OverrideField, type OverrideRow, type WorkoutRow,
} from '@/rules/planner';
import { fromPounds } from '@/rules/units';
import { plainError, usePlanner, type Ovr } from '../../planner-data';
import { NumCell } from '../../fields';
import { ExercisePanel } from '../../exercise-panel';
import { ProposalCards } from '@/components/proposal-cards';
import { todayState } from '../../today-check';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const toOverride = (o: Ovr): OverrideRow => ({
  id: o.id, campaignDayId: o.campaign_day_id, workoutItemId: o.workout_item_id, exerciseId: o.exercise_id, sets: o.sets, reps: o.reps,
  weightLb: o.weight_lb, weightValue: o.weight_entered_value, weightUnit: o.weight_entered_unit, rest: o.rest_seconds,
});

// Plan (spec Section 5): the future. Pick a campaign, a week and a day. The
// workout pane lists that day's rows, where the exercise, sets, reps, weight
// and rest can be overridden for that day only; an override shows the library
// value beside it. A button sends the day to the phone.
export default function Plan() {
  const { data, reload, showInPanel, view } = usePlanner();
  const sb = browserClient();
  const today = trainingDay(new Date(), data.timeZone);
  const [cid, setCid] = useState<string | null>(null);
  const [week, setWeek] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [msg, setMsg] = useState('');
  const [note, setNote] = useState('');

  const campaigns = data.campaigns.filter((c) => c.status !== 'finished' || c.id === cid);
  const c = data.campaigns.find((x) => x.id === cid) ?? data.campaigns.find((x) => x.status === 'active') ?? campaigns[0] ?? null;
  useEffect(() => { if (c && c.id !== cid) setCid(c.id); }, [c, cid]);
  const blank = useMemo(() => (c ? data.shifts.filter((s) => s.campaign_id === c.id).map((s) => s.blank_week_starts_on.slice(0, 10)) : []), [c, data.shifts]);
  const dateOf = (w: number, d: number) => (c ? dateOfCampaignDay(c.start_date.slice(0, 10), w, d, blank) : '');
  useEffect(() => { if (c && week > c.week_count) setWeek(1); }, [c, week]);

  const day = c ? data.days.find((d) => d.campaign_id === c.id && d.week === week && d.weekday === weekday) : undefined;
  const workout = day ? data.workouts.find((w) => w.id === day.workout_id) : undefined;
  const lib: WorkoutRow[] = useMemo(() => (workout ? data.items.filter((i) => i.workout_id === workout.id).sort((a, b) => a.position - b.position)
    .map((i) => ({ id: i.id, exerciseId: i.exercise_id, sets: i.sets, reps: i.reps, rest: i.rest_seconds, superset: i.superset_letter })) : []), [workout, data.items]);
  const ovrs = useMemo(() => (day ? data.overrides.filter((o) => o.campaign_day_id === day.id).map(toOverride) : []), [day, data.overrides]);
  const eff = useMemo(() => effectiveRows(lib, ovrs), [lib, ovrs]);
  const exById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);
  const overrideCount = ovrs.filter(overridesAny).length;

  /** Writes override rows in one request (the database checks supersets when a change is committed). */
  async function change(itemId: string, field: OverrideField, value: Parameters<typeof overrideChange>[5]) {
    if (!day || !workout) return;
    setMsg('');
    const ups = overrideChange(lib, ovrs, day.id, itemId, field, value);
    const r = await sb.from('campaign_day_overrides').upsert(ups.map((o) => ({
      user_id: data.userId, campaign_day_id: day.id, workout_id: workout.id, workout_item_id: o.workoutItemId, exercise_id: o.exerciseId, sets: o.sets, reps: o.reps,
      weight_lb: o.weightLb, weight_entered_value: o.weightValue, weight_entered_unit: o.weightUnit, rest_seconds: o.rest,
    })), { onConflict: 'campaign_day_id,workout_item_id' });
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
  }
  async function clearAll() {
    if (!day || !overrideCount || !window.confirm(`Clear all ${overrideCount} override${overrideCount === 1 ? '' : 's'} on this day? The library workout is not touched.`)) return;
    const r = await sb.from('campaign_day_overrides').delete().eq('campaign_day_id', day.id);
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
  }

  async function send() {
    if (!c || !day || !workout) return;
    setMsg(''); setNote('');
    const state = await todayState(sb, data, today);
    const plan = planFromRows(eff);
    if (!plan.length) { setMsg('This day has no exercises to send.'); return; }
    if (state.pendingCards && !window.confirm('A day sent earlier is still waiting in your inbox for today. Send this one as well?')) return;
    if (!state.workoutName && !state.running) {
      const r = await sb.from('today_plans').insert({
        user_id: data.userId, local_date: today, source_kind: 'campaign_day', campaign_day_id: day.id, workout_id: workout.id, plan, made_by: 'user',
      });
      if (r.error) { setMsg(plainError(r.error.message)); return; }
      setNote(`Sent. ${workout.name} is today's workout on your phone now. Your library and campaign are unchanged.`);
      return;
    }
    const replaces = state.running ? `the workout in progress, ${state.running} (what you have logged is saved as its own workout first)` : `today's ${state.workoutName}`;
    const expires = nextRollover(new Date(), data.timeZone).toISOString();
    const r = await sb.from('proposals').insert({
      user_id: data.userId, source: 'planner', kind: 'today_change', applies_to: 'today', expires_at: expires,
      summary_lines: sendSummary(workout.name, plan.length, replaces),
      payload: { local_date: today, workout_name: workout.name, workout_id: workout.id, campaign_day_id: day.id, plan_items: plan, replaces },
    });
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    setNote(`Today already has a workout, so ${workout.name} is waiting in the inbox on your phone, and below, with Accept and Dismiss.`);
    setInboxKey((k) => k + 1);
  }
  const [inboxKey, setInboxKey] = useState(0);

  if (!c) return <div className="muted">No campaigns yet. Make one under Library, Campaigns, then plan its days here.</div>;
  return (
    <>
      <ProposalCards key={inboxKey} />
      <div className="muted">What you are going to do: pick a campaign, a week and a day, and adjust that day.</div>
      <div className="row">
        <select aria-label="Campaign" value={c.id} onChange={(e) => { setCid(e.target.value); setWeek(1); }}>
          {data.campaigns.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.status})</option>)}
        </select>
        {Array.from({ length: c.week_count }, (_, i) => i + 1).map((w) => (
          <button key={w} className={`btn small ${w === week ? 'selected' : ''}`} aria-pressed={w === week} onClick={() => setWeek(w)}>Week {w}</button>
        ))}
      </div>
      <div className="week-row plan-week">
        {DAYS.map((d, i) => {
          const dd = data.days.find((x) => x.campaign_id === c.id && x.week === week && x.weekday === i + 1);
          const name = dd ? data.workouts.find((w) => w.id === dd.workout_id)?.name : null;
          const date = dateOf(week, i + 1);
          return (
            <button key={d} className={`wk-day plan-day ${weekday === i + 1 ? 'is-today' : ''}`} aria-pressed={weekday === i + 1} onClick={() => setWeekday(i + 1)}>
              <b>{d}{date === today ? ' · today' : ''}</b><span className="wk-name">{name ?? 'Rest day'}</span><span className="lab">{pretty(date)}</span>
            </button>
          );
        })}
      </div>
      {msg && <div className="error" role="alert">{msg}</div>}
      {note && <div className="notice-soft" role="status">{note}</div>}
      <div className="cols">
        <div className="pbox">
          <h2 className="tight-h2">Week {week} · {DAYS[weekday - 1]} · {workout ? workout.name : 'Rest day'}</h2>
          {workout?.archived_at && <span className="tag">Archived</span>}
          {!day || !workout ? <div className="muted">Nothing scheduled. Pick a workout for this day under Library, Campaigns.</div> : (
            <>
              <div className="scroll">
                <table>
                  <thead><tr><th>#</th><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight ({view})</th><th>Rest s</th><th>Superset</th><th>Budget</th></tr></thead>
                  <tbody>
                    {eff.map((r, i) => {
                      const ex = exById.get(r.exerciseId);
                      const libEx = r.library.exerciseId ? exById.get(r.library.exerciseId) : null;
                      const bwEx = ex?.default_unit === 'bw';
                      const shown = r.weightLb === null ? null : r.weightUnit === view ? r.weightValue : fromPounds(r.weightLb, view);
                      return (
                        <tr key={r.id}>
                          <td>{i + 1}</td>
                          <td>
                            <div className="row tight">
                            <select aria-label={`Exercise ${i + 1} for this day`} className={libEx ? 'ov-input' : undefined} value={r.exerciseId} onChange={(e) => change(r.id, 'exerciseId', e.target.value)}>
                              {data.exercises.filter((e) => !e.archived_at || e.id === r.exerciseId).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                            <button className="btn small" onClick={() => showInPanel(r.exerciseId)}>Details</button>
                            </div>
                            {libEx && <div className="override-note">library: {libEx.name}</div>}
                          </td>
                          <td>
                            <NumCell value={r.sets} label={`Sets of row ${i + 1} this day`} min={1} max={12} onSave={(v) => change(r.id, 'sets', v)} />
                            {r.library.sets !== undefined && <div className="override-note">library: {r.library.sets}</div>}
                          </td>
                          <td>
                            <NumCell value={r.reps} label={`Reps of row ${i + 1} this day`} min={1} max={50} onSave={(v) => change(r.id, 'reps', v)} />
                            {r.library.reps !== undefined && <div className="override-note">library: {r.library.reps}</div>}
                          </td>
                          <td>
                            {bwEx ? <span className="muted">BW</span> : (
                              <NumCell value={shown} blank label={`Weight of row ${i + 1} this day in ${view}`} min={0} max={maxPlanWeight(view)} step={0.5} width={80} placeholder="last weight"
                                onSave={(v) => change(r.id, 'weight', v === null ? null : { lb: typedToPounds(v, view), value: v, unit: view })} />
                            )}
                            {r.library.weight && r.weightLb !== null && <div className="override-note">{viewWeight(r.weightLb, view)} (library: last weight used)</div>}
                          </td>
                          <td>
                            <NumCell value={r.rest} blank label={`Rest of row ${i + 1} this day`} min={0} max={600} placeholder={ex ? String(ex.rest_seconds) : ''} onSave={(v) => change(r.id, 'rest', v)} />
                            {r.library.rest !== undefined && <div className="override-note">library: {r.library.rest ?? `${ex?.rest_seconds ?? ''} (exercise)`}</div>}
                          </td>
                          <td>{r.superset ?? 'None'}</td>
                          <td>{ex ? mmss(rowBudget(eff, i, (id) => { const e = exById.get(id); return e ? { work: e.work_seconds, rest: e.rest_seconds } : undefined; })) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="row">
                <button className="btn primary small-primary" onClick={send}>Send to phone as today&apos;s workout</button>
                <button className="btn" onClick={clearAll} disabled={!overrideCount}>Clear this day&apos;s overrides{overrideCount ? ` (${overrideCount})` : ''}</button>
              </div>
              <div className="muted">Anything changed here (exercise, sets, reps, weight, rest) applies only to {DAYS[weekday - 1]} of week {week} in this campaign. A blank weight uses your last weight. Changing the sets of one superset exercise changes them all. The library workout and exercises stay as they are.</div>
            </>
          )}
        </div>
        <ExercisePanel />
      </div>
    </>
  );
}
