'use client';
import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { checkExerciseName, nearDuplicateGroups } from '@/rules/planner';
import { missingFields } from '@/rules/swap-made';
import { plainError, usePlanner, type Ex, type Term } from '../../../planner-data';
import { NumCell, TextCell } from '../../../fields';

type Tier = 'bodyweight' | 'basic_gym' | 'full_gym';
const TIERS: [Tier, string][] = [['bodyweight', 'Bodyweight swap'], ['basic_gym', 'Basic gym swap'], ['full_gym', 'Full gym swap']];

// Library, Exercises (spec Section 5): an editable table. Renaming keeps all
// history (history follows the exercise's id, not its name). An exercise with
// missing fields is flagged Incomplete with the empty fields shown, and the
// flag never blocks its use. Exercises are archived, never deleted.
export default function Exercises() {
  const { data, reload, showInPanel } = usePlanner();
  const sb = browserClient();
  const [msg, setMsg] = useState('');
  const [q, setQ] = useState('');
  const [archived, setArchived] = useState(false);
  const [adding, setAdding] = useState(false);

  const named = useMemo(() => data.exercises.map((x) => ({ id: x.id, name: x.name, archived: !!x.archived_at })), [data.exercises]);
  const dupes = useMemo(() => nearDuplicateGroups(named), [named]);
  const rows = data.exercises
    .filter((x) => (archived ? true : !x.archived_at))
    .filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()));

  async function update(id: string, patch: Record<string, unknown>) {
    setMsg('');
    const r = await sb.from('exercises').update(patch).eq('id', id);
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
  }
  async function rename(x: Ex, name: string) {
    const c = checkExerciseName(name, named, x.id);
    if (c.error) { setMsg(c.error); await reload(); return; }
    if (c.warning && !window.confirm(`${c.warning}\n\nRename anyway? All of this exercise's history stays with it.`)) { await reload(); return; }
    await update(x.id, { name: name.trim() });
  }
  async function saveAlt(x: Ex, tier: Tier, name: string) {
    setMsg('');
    const clean = name.trim();
    const existing = data.alternates.find((a) => a.exercise_id === x.id && a.tier === tier);
    if (!clean) {
      if (existing) await sb.from('exercise_alternates').delete().eq('id', existing.id);
    } else {
      const link = data.exercises.find((e) => !e.archived_at && e.id !== x.id && e.name.toLowerCase() === clean.toLowerCase());
      const r = existing
        ? await sb.from('exercise_alternates').update({ name: clean, alternate_exercise_id: link?.id ?? null }).eq('id', existing.id)
        : await sb.from('exercise_alternates').insert({ user_id: data.userId, exercise_id: x.id, tier, name: clean, alternate_exercise_id: link?.id ?? null });
      if (r.error) setMsg(plainError(r.error.message));
    }
    await reload();
  }
  async function archive(x: Ex, on: boolean) {
    if (on && !window.confirm(`Archive "${x.name}"? It leaves the pickers but keeps its history, and you can restore it.`)) return;
    await update(x.id, { archived_at: on ? new Date().toISOString() : null });
  }

  const muscles = data.terms.filter((t) => t.kind === 'muscle_group');
  const equipment = data.terms.filter((t) => t.kind === 'equipment');

  return (
    <>
      <div className="row">
        <input type="text" placeholder="Search exercises" aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="check"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
        <button className="btn primary small-primary" onClick={() => setAdding(true)}>Add exercise</button>
        <span className="muted">{rows.length} shown</span>
      </div>
      {msg && <div className="error" role="alert">{msg}</div>}
      {adding && <AddExercise onDone={async (made) => { setAdding(false); await reload(); if (made) showInPanel(made); }} muscles={muscles} equipment={equipment} terms={data.terms} named={named} userId={data.userId} setMsg={setMsg} />}
      <div className="pbox scroll">
        <table>
          <thead>
            <tr><th>Name</th><th>Muscle group</th><th>Focus</th><th>Equipment</th><th>Unit</th><th>Work s/set</th><th>Rest s</th><th>Counts</th><th>Note</th>{TIERS.map(([, l]) => <th key={l}>{l}</th>)}<th></th></tr>
          </thead>
          <tbody>
            {rows.map((x) => {
              const miss = missingFields(x);
              const foci = data.terms.filter((t) => t.kind === 'focus' && t.parent_id === x.muscle_group_id && (!t.archived_at || t.id === x.focus_id));
              const opt = (list: Term[], cur: string | null) => list.filter((t) => !t.archived_at || t.id === cur);
              return (
                <tr key={x.id} className={x.archived_at ? 'archived-row' : undefined}>
                  <td>
                    <TextCell value={x.name} label={`Name of ${x.name}`} width={200} onSave={(v) => rename(x, v)} />
                    <div className="row tight">
                      {x.archived_at && <span className="tag">Archived</span>}
                      {miss.length > 0 && <span className="tag on" title="The flag never blocks use of the exercise">Incomplete</span>}
                      {dupes.has(x.id) && <span className="tag" title={`Looks like ${dupes.get(x.id)!.join(', ')}`}>Near-duplicate</span>}
                    </div>
                  </td>
                  <td>
                    <select aria-label={`Muscle group of ${x.name}`} className={!x.muscle_group_id ? 'flag' : undefined} value={x.muscle_group_id ?? ''}
                      onChange={(e) => update(x.id, { muscle_group_id: e.target.value || null, focus_id: null })}>
                      <option value="">(empty)</option>
                      {opt(muscles, x.muscle_group_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Focus of ${x.name}`} value={x.focus_id ?? ''} disabled={!x.muscle_group_id}
                      onChange={(e) => update(x.id, { focus_id: e.target.value || null })}>
                      <option value="">None</option>
                      {foci.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Equipment of ${x.name}`} className={!x.equipment_id ? 'flag' : undefined} value={x.equipment_id ?? ''}
                      onChange={(e) => update(x.id, { equipment_id: e.target.value || null })}>
                      <option value="">(empty)</option>
                      {opt(equipment, x.equipment_id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <select aria-label={`Unit of ${x.name}`} value={x.default_unit}
                      onChange={(e) => update(x.id, e.target.value === 'bw' ? { default_unit: 'bw', assisted: false } : { default_unit: e.target.value })}>
                      <option value="lb">lb</option><option value="kg">kg</option><option value="bw">bodyweight</option>
                    </select>
                  </td>
                  <td><NumCell value={x.work_seconds} label={`Work seconds of ${x.name}`} min={5} max={600} onSave={(v) => update(x.id, { work_seconds: v })} /></td>
                  <td><NumCell value={x.rest_seconds} label={`Rest seconds of ${x.name}`} min={0} max={600} onSave={(v) => update(x.id, { rest_seconds: v })} /></td>
                  <td>
                    <select aria-label={`Load count of ${x.name}`} value={x.load_count} onChange={(e) => update(x.id, { load_count: Number(e.target.value) })}>
                      <option value={1}>1×</option><option value={2}>2×</option><option value={4}>4×</option>
                    </select>
                    {x.default_unit !== 'bw' && (
                      <label className="check"><input type="checkbox" checked={x.assisted} onChange={(e) => update(x.id, { assisted: e.target.checked })} /> Assisted</label>
                    )}
                  </td>
                  <td><TextCell value={x.note} label={`Note of ${x.name}`} width={160} onSave={(v) => update(x.id, { note: v })} /></td>
                  {TIERS.map(([tier, l]) => (
                    <td key={tier}><TextCell value={data.alternates.find((a) => a.exercise_id === x.id && a.tier === tier)?.name ?? ''} label={`${l} of ${x.name}`} width={150} onSave={(v) => saveAlt(x, tier, v)} /></td>
                  ))}
                  <td>
                    <div className="row tight">
                      <button className="btn small" onClick={() => showInPanel(x.id)}>Details</button>
                      <button className="btn small" onClick={() => archive(x, !x.archived_at)}>{x.archived_at ? 'Restore' : 'Archive'}</button>
                    </div>
                    {miss.length > 0 && <div className="muted">Empty: {miss.join(', ')}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="muted">Renaming keeps all history. Work and rest seconds set each exercise&apos;s time budget. The load count is how many times the logged weight is moved in one rep (2 for a pair of dumbbells).</div>
    </>
  );
}

function AddExercise({ onDone, muscles, equipment, terms, named, userId, setMsg }: {
  onDone: (madeId: string | null) => void | Promise<void>; muscles: Term[]; equipment: Term[]; terms: Term[]; named: { id: string; name: string; archived: boolean }[]; userId: string; setMsg: (m: string) => void;
}) {
  const sb = browserClient();
  const [name, setName] = useState('');
  const [mg, setMg] = useState('');
  const [focus, setFocus] = useState('');
  const [eq, setEq] = useState('');
  const [unit, setUnit] = useState<'lb' | 'kg' | 'bw'>('lb');
  const [work, setWork] = useState(45);
  const [rest, setRest] = useState(120);
  const check = checkExerciseName(name, named);
  const live = (list: Term[]) => list.filter((t) => !t.archived_at);
  async function save() {
    if (check.error) { setMsg(check.error); return; }
    if (!mg || !eq) { setMsg('Pick a muscle group and equipment. (Only an exercise made by a swap on the phone may start without them.)'); return; }
    if (check.warning && !window.confirm(`${check.warning}\n\nAdd it anyway?`)) return;
    const r = await sb.from('exercises').insert({
      user_id: userId, name: name.trim(), muscle_group_id: mg, focus_id: focus || null, equipment_id: eq,
      default_unit: unit,
      work_seconds: work, rest_seconds: rest, created_via: 'planner',
    }).select('id').single();
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    await onDone(r.data.id as string);
  }
  return (
    <div className="panel" role="group" aria-label="Add an exercise">
      <div className="lab">New exercise</div>
      <label>Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
      {check.warning && <div className="notice-soft">{check.warning} You can still add it.</div>}
      {check.error && name.trim() && <div className="error">{check.error}</div>}
      <div className="row">
        <label>Muscle group<select value={mg} onChange={(e) => { setMg(e.target.value); setFocus(''); }}><option value="">Pick one</option>{live(muscles).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Focus<select value={focus} disabled={!mg} onChange={(e) => setFocus(e.target.value)}><option value="">None</option>{live(terms.filter((t) => t.kind === 'focus' && t.parent_id === mg)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Equipment<select value={eq} onChange={(e) => setEq(e.target.value)}><option value="">Pick one</option>{live(equipment).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Unit<select value={unit} onChange={(e) => setUnit(e.target.value as 'lb' | 'kg' | 'bw')}><option value="lb">lb</option><option value="kg">kg</option><option value="bw">bodyweight</option></select></label>
      </div>
      <div className="row">
        <label>Work seconds per set<NumCell value={work} label="Work seconds" min={5} max={600} onSave={(v) => setWork(v ?? 45)} /></label>
        <label>Rest seconds<NumCell value={rest} label="Rest seconds" min={0} max={600} onSave={(v) => setRest(v ?? 120)} /></label>
      </div>
      <div className="row"><button className="btn primary small-primary" onClick={save}>Add to library</button><button className="btn" onClick={() => onDone(null)}>Cancel</button></div>
    </div>
  );
}
