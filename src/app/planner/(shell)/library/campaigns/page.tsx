'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { activationNeedsConfirm, campaignEndDate, campaignIsOver, copyName, dateOfCampaignDay, nextBlankWeek } from '@/rules/planner';
import { trainingDay } from '@/rules/days';
import { plainError, usePlanner } from '../../../planner-data';
import { TextCell } from '../../../fields';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pretty = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Library, Campaigns (spec Section 5, design Section 5): a grid of weeks by
// days. A draft is edited freely; activating one while another is active ends
// the other after a confirmation; an active campaign can be shifted forward a
// week; a copy is a new draft. A finished campaign prompts to ask the coach.
export default function Campaigns() {
  const { data, reload } = usePlanner();
  const sb = browserClient();
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [coachLink, setCoachLink] = useState<string | null>(null);
  const today = trainingDay(new Date(), data.timeZone);
  const [runFrom, setRunFrom] = useState(today);

  useEffect(() => { void sb.from('profiles').select('coach_link').maybeSingle().then((r) => setCoachLink((r.data as { coach_link?: string } | null)?.coach_link ?? null)); }, [sb]);

  const c = data.campaigns.find((x) => x.id === sel) ?? data.campaigns.find((x) => x.status === 'active') ?? data.campaigns[0] ?? null;
  useEffect(() => { if (c && c.id !== sel) setSel(c.id); }, [c, sel]);

  const blank = useMemo(() => (c ? data.shifts.filter((s) => s.campaign_id === c.id).map((s) => s.blank_week_starts_on.slice(0, 10)) : []), [c, data.shifts]);
  const dayOf = (w: number, d: number) => (c ? data.days.find((x) => x.campaign_id === c.id && x.week === w && x.weekday === d) : undefined);
  const wkName = (id: string) => data.workouts.find((w) => w.id === id);
  const overridesOn = (dayId: string) => data.overrides.filter((o) => o.campaign_day_id === dayId && (o.exercise_id || o.sets !== null || o.reps !== null || o.rest_seconds !== null || o.weight_lb !== null)).length;

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setMsg('');
    const r = await fn();
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
    return !r.error;
  }

  async function create() {
    const name = window.prompt('Name of the new campaign');
    if (!name?.trim()) return;
    const r = await sb.from('campaigns').insert({ user_id: data.userId, name: name.trim(), start_date: today, week_count: 4, status: 'draft' }).select('id').single();
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    await reload(); setSel(r.data.id as string);
  }
  async function copy() {
    if (!c) return;
    const r = await sb.from('campaigns').insert({ user_id: data.userId, name: copyName(c.name, data.campaigns.map((x) => x.name)), start_date: today, week_count: c.week_count, status: 'draft' }).select('id').single();
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    const newId = r.data.id as string;
    const oldDays = data.days.filter((d) => d.campaign_id === c.id);
    if (oldDays.length) {
      const newDays = oldDays.map((d) => ({ id: crypto.randomUUID(), user_id: data.userId, campaign_id: newId, week: d.week, weekday: d.weekday, workout_id: d.workout_id, from: d.id }));
      const ins = await sb.from('campaign_days').insert(newDays.map(({ from, ...rest }) => { void from; return rest; }));
      if (ins.error) { setMsg(plainError(ins.error.message)); await reload(); return; }
      const ov = data.overrides.filter((o) => oldDays.some((d) => d.id === o.campaign_day_id)).map((o) => {
        const nd = newDays.find((d) => d.from === o.campaign_day_id)!;
        return {
          user_id: data.userId, campaign_day_id: nd.id, workout_id: nd.workout_id, workout_item_id: o.workout_item_id, exercise_id: o.exercise_id, sets: o.sets, reps: o.reps,
          weight_lb: o.weight_lb, weight_entered_value: o.weight_entered_value, weight_entered_unit: o.weight_entered_unit, rest_seconds: o.rest_seconds,
        };
      });
      if (ov.length) {
        const o2 = await sb.from('campaign_day_overrides').insert(ov);
        if (o2.error) setMsg(plainError(o2.error.message));
      }
    }
    await reload(); setSel(newId);
  }
  async function setDay(week: number, weekday: number, workoutId: string) {
    if (!c) return;
    const cur = dayOf(week, weekday);
    if (!workoutId) {
      if (!cur) return;
      if (overridesOn(cur.id) && !window.confirm('This day has overrides. Making it a rest day removes them. Continue?')) { await reload(); return; }
      await run(() => sb.from('campaign_days').delete().eq('id', cur.id));
    } else if (cur) {
      if (cur.workout_id === workoutId) return;
      if (overridesOn(cur.id) && !window.confirm("Changing this day's workout clears that day's overrides. Continue?")) { await reload(); return; }
      await run(() => sb.from('campaign_days').update({ workout_id: workoutId }).eq('id', cur.id));
    } else {
      await run(() => sb.from('campaign_days').insert({ user_id: data.userId, campaign_id: c.id, week, weekday, workout_id: workoutId }));
    }
  }
  async function setWeeks(n: number) {
    if (!c || n === c.week_count) return;
    const cut = data.days.filter((d) => d.campaign_id === c.id && d.week > n);
    if (cut.length && !window.confirm(`Shortening to ${n} week${n === 1 ? '' : 's'} removes ${cut.length} planned day${cut.length === 1 ? '' : 's'} after it. Continue?`)) { await reload(); return; }
    if (cut.length) { const d = await sb.from('campaign_days').delete().eq('campaign_id', c.id).gt('week', n); if (d.error) { setMsg(plainError(d.error.message)); return; } }
    await run(() => sb.from('campaigns').update({ week_count: n }).eq('id', c.id));
  }
  async function activate() {
    if (!c) return;
    const other = activationNeedsConfirm(data.campaigns, c.id);
    if (other && !window.confirm(`"${other}" is the active campaign. Activating "${c.name}" ends it. Continue?`)) return;
    const prev = data.campaigns.find((x) => x.status === 'active' && x.id !== c.id);
    if (prev && !(await run(() => sb.from('campaigns').update({ status: 'finished' }).eq('id', prev.id)))) return;
    const ok = await run(() => sb.from('campaigns').update({ status: 'active' }).eq('id', c.id));
    if (!ok && prev) await sb.from('campaigns').update({ status: 'active' }).eq('id', prev.id);
    await reload();
  }
  /** Runs a finished campaign again from a new start date: the same campaign, no copy (Nate, 21 Nov). */
  async function runAgain() {
    if (!c) return;
    const other = activationNeedsConfirm(data.campaigns, c.id);
    const ask = `Run "${c.name}" again from ${pretty(runFrom)}? It becomes the active campaign with the same days and overrides.${other ? ` "${other}" is active now and will end.` : ''} Your past workouts stay in History.`;
    if (!window.confirm(ask)) return;
    const prev = data.campaigns.find((x) => x.status === 'active' && x.id !== c.id);
    // In this order, so a dropped connection part-way never leaves this campaign without
    // its shifts while still finished (review finding 7): end the other, activate this one,
    // and only then clear the last run's shifts.
    if (prev && !(await run(() => sb.from('campaigns').update({ status: 'finished' }).eq('id', prev.id)))) return;
    const ok = await run(() => sb.from('campaigns').update({ status: 'active', start_date: runFrom }).eq('id', c.id));
    if (!ok) { if (prev) { await sb.from('campaigns').update({ status: 'active' }).eq('id', prev.id); await reload(); } return; }
    if (blank.length) await run(() => sb.from('campaign_shifts').delete().eq('campaign_id', c.id));
  }
  async function finish() {
    if (!c || !window.confirm(`End "${c.name}" now? It becomes finished. You can copy it into a new draft.`)) return;
    await run(() => sb.from('campaigns').update({ status: 'finished' }).eq('id', c.id));
  }
  async function shift() {
    if (!c) return;
    const week = nextBlankWeek(today, c.start_date.slice(0, 10), blank);
    if (!window.confirm(`Leave the week of ${pretty(week)} empty and push every later day back one week? This does not count toward the six-week limit.`)) return;
    await run(() => sb.from('campaign_shifts').insert({ user_id: data.userId, campaign_id: c.id, blank_week_starts_on: week, made_by: 'user' }));
  }
  async function undoShift() {
    if (!c || !blank.length) return;
    const last = data.shifts.filter((s) => s.campaign_id === c.id).sort((a, b) => (a.blank_week_starts_on < b.blank_week_starts_on ? 1 : -1))[0];
    if (!last || !window.confirm(`Take back the shift of the week of ${pretty(last.blank_week_starts_on.slice(0, 10))}?`)) return;
    await run(() => sb.from('campaign_shifts').delete().eq('id', last.id));
  }

  const over = c ? campaignIsOver(today, c.start_date.slice(0, 10), c.week_count, blank) : false;
  const finished = c?.status === 'finished' || (c?.status === 'active' && over);

  return (
    <>
      <div className="row">
        <select aria-label="Campaign" value={c?.id ?? ''} onChange={(e) => setSel(e.target.value)}>
          {data.campaigns.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.status})</option>)}
        </select>
        <button className="btn" onClick={create}>New campaign</button>
        <button className="btn" onClick={copy} disabled={!c}>Copy this one</button>
      </div>
      {msg && <div className="error" role="alert">{msg}</div>}
      {!c ? <div className="muted">No campaigns yet. Press New campaign, then pick a workout for each day.</div> : (
        <div className="pbox">
          {finished && (
            <div className="notice" role="status">
              <strong>{c.name} {c.status === 'finished' ? 'is finished' : 'has run its last day'}.</strong>
              <div className="notice-detail">Ask your coach for the next one (your coach is in ChatGPT or Claude, not in this app), or press Run again below to repeat it from a new start date. The app never repeats or extends a campaign by itself.{coachLink ? <> <a href={coachLink} target="_blank" rel="noreferrer">Open my coach</a>.</> : ' Open your coach project and ask for the next campaign.'}</div>
              {c.status === 'active' && <button className="btn" onClick={finish}>Mark it finished</button>}
            </div>
          )}
          <div className="row">
            <label>Name<TextCell value={c.name} label="Campaign name" width={220} onSave={async (v) => { if (v.trim()) await run(() => sb.from('campaigns').update({ name: v.trim() }).eq('id', c.id)); }} /></label>
            <label>Start date
              <input type="date" value={c.start_date.slice(0, 10)} onChange={(e) => e.target.value && run(() => sb.from('campaigns').update({ start_date: e.target.value }).eq('id', c.id))} />
            </label>
            <label>Weeks
              <select value={c.week_count} onChange={(e) => setWeeks(Number(e.target.value))} disabled={c.status === 'finished'}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="tag on">{c.status}</span>
          </div>
          <div className="muted">Week 1 is the week holding the start date. Ends {pretty(campaignEndDate(c.start_date.slice(0, 10), c.week_count, blank))}{blank.length ? `, after ${blank.length} shifted week${blank.length === 1 ? '' : 's'}` : ''}.</div>
          <div className="scroll">
            <table>
              <thead><tr><th>Week</th>{DAYS.map((d) => <th key={d}>{d}</th>)}<th>Overrides</th></tr></thead>
              <tbody>
                {Array.from({ length: c.week_count }, (_, i) => i + 1).map((w) => (
                  <tr key={w}>
                    <td>Week {w}<div className="muted">{pretty(dateOfCampaignDay(c.start_date.slice(0, 10), w, 1, blank))}</div></td>
                    {DAYS.map((d, k) => {
                      const day = dayOf(w, k + 1);
                      const wk = day ? wkName(day.workout_id) : undefined;
                      const date = dateOfCampaignDay(c.start_date.slice(0, 10), w, k + 1, blank);
                      return (
                        <td key={d} className={date === today ? 'today-cell' : undefined}>
                          <select aria-label={`Week ${w} ${d}`} value={day?.workout_id ?? ''} disabled={c.status === 'finished'} onChange={(e) => setDay(w, k + 1, e.target.value)}>
                            <option value="">Rest day</option>
                            {data.workouts.filter((x) => !x.archived_at || x.id === day?.workout_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          {wk?.archived_at && <span className="tag">Archived</span>}
                        </td>
                      );
                    })}
                    <td>{data.days.filter((d) => d.campaign_id === c.id && d.week === w).reduce((n, d) => n + overridesOn(d.id), 0) || 'None'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            {c.status === 'draft' && <button className="btn primary small-primary" onClick={activate}>Activate</button>}
            {c.status === 'active' && <button className="btn" onClick={shift}>Shift forward a week</button>}
            {c.status !== 'finished' && blank.length > 0 && <button className="btn" onClick={undoShift}>Undo last shift</button>}
            {c.status === 'active' && <button className="btn" onClick={finish}>End campaign</button>}
            {c.status === 'finished' && (
              <>
                <label>Run again from<input type="date" value={runFrom} onChange={(e) => e.target.value && setRunFrom(e.target.value)} /></label>
                <button className="btn primary small-primary" onClick={runAgain}>Run again</button>
              </>
            )}
          </div>
          <div className="muted">Per-day overrides are set in Plan, by picking a week and a day. Changing a day&apos;s workout here clears that day&apos;s overrides. One campaign is active at a time; the others wait as drafts.</div>
        </div>
      )}
    </>
  );
}
