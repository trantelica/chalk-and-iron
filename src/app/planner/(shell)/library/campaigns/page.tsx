'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { browserClient } from '@/lib/supabase/browser';
import { copyName } from '@/rules/planner';
import { trainingDay } from '@/rules/days';
import { campaignStatusLine } from '@/rules/campaign-run';
import { plainError, usePlanner } from '../../../planner-data';
import { TextCell } from '../../../fields';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Library, Campaigns (Nate, 27 Nov): the DESIGN of a campaign only, which
// workout (or rest) goes on which day of which week. Running one (start date,
// start, shift, end) lives in Plan. A copy is a new draft with the same days.
export default function Campaigns() {
  const { data, reload } = usePlanner();
  const sb = browserClient();
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const today = trainingDay(new Date(), data.timeZone);

  const c = data.campaigns.find((x) => x.id === sel) ?? data.campaigns.find((x) => x.status === 'active') ?? data.campaigns[0] ?? null;
  useEffect(() => { if (c && c.id !== sel) setSel(c.id); }, [c, sel]);

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
          <div className="row">
            <label>Name<TextCell value={c.name} label="Campaign name" width={220} onSave={async (v) => { if (v.trim()) await run(() => sb.from('campaigns').update({ name: v.trim() }).eq('id', c.id)); }} /></label>
            <label>Weeks
              <select value={c.week_count} onChange={(e) => setWeeks(Number(e.target.value))} disabled={c.status === 'finished'}>
                {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="tag on" role="status" aria-label="Campaign status">{campaignStatusLine(c, data.timeZone)}</span>
          </div>
          {c.status === 'active' && (
            <div className="muted">This campaign is running; changes to its days apply from today on. <Link href="/planner/plan">Open Plan</Link> to shift it, end it or change a day&apos;s sets, reps, weight and rest.</div>
          )}
          {c.status === 'finished' && <div className="muted">This campaign is finished, so its days are read-only. Copy it for a new draft, or start it again from <Link href="/planner/plan">Plan</Link>.</div>}
          <div className="scroll">
            <table>
              <thead><tr><th>Week</th>{DAYS.map((d) => <th key={d}>{d}</th>)}</tr></thead>
              <tbody>
                {Array.from({ length: c.week_count }, (_, i) => i + 1).map((w) => (
                  <tr key={w}>
                    <td>Week {w}</td>
                    {DAYS.map((d, k) => {
                      const day = dayOf(w, k + 1);
                      const wk = day ? wkName(day.workout_id) : undefined;
                      return (
                        <td key={d}>
                          <select aria-label={`Week ${w} ${d}`} value={day?.workout_id ?? ''} disabled={c.status === 'finished'} onChange={(e) => setDay(w, k + 1, e.target.value)}>
                            <option value="">Rest day</option>
                            {data.workouts.filter((x) => !x.archived_at || x.id === day?.workout_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                          </select>
                          {wk?.archived_at && <span className="tag">Archived</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="muted">This is the campaign&apos;s design: which workout goes on which day. The workouts hold their exercises and default sets and reps. Starting, shifting and ending a campaign, and this run&apos;s sets, reps, weight and rest, are in Plan. Changing a day&apos;s workout here clears that day&apos;s overrides in Plan.</div>
        </div>
      )}
    </>
  );
}
