'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { copyName, moveRow, nextSupersetLetter, removeRow, rowBudget, setRowSets, setRowSuperset, workoutProblems, type WorkoutRow } from '@/rules/planner';
import { mmss } from '@/rules/workout';
import { plainError, usePlanner } from '../../../planner-data';
import { NumCell, TextCell } from '../../../fields';
import { ExercisePanel } from '../../../exercise-panel';

// Library, Workouts (spec Section 5): the selected workout's ordered rows
// beside the exercise panel. Supersets hold two or three exercises and stay
// equal in sets: changing one member's sets changes them all, and a row that
// joins a superset takes its set count. Workouts are archived, never deleted.
export default function Workouts() {
  const { data, reload, showInPanel } = usePlanner();
  const sb = browserClient();
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const list = data.workouts.filter((w) => showArchived || !w.archived_at);
  const w = data.workouts.find((x) => x.id === sel) ?? list[0] ?? null;
  useEffect(() => { if (w && w.id !== sel) setSel(w.id); }, [w, sel]);

  const rows: WorkoutRow[] = useMemo(() => (w ? data.items.filter((i) => i.workout_id === w.id).sort((a, b) => a.position - b.position)
    .map((i) => ({ id: i.id, exerciseId: i.exercise_id, sets: i.sets, reps: i.reps, rest: i.rest_seconds, superset: i.superset_letter })) : []), [w, data.items]);
  const exById = useMemo(() => new Map(data.exercises.map((e) => [e.id, e])), [data.exercises]);
  const pickable = data.exercises.filter((e) => !e.archived_at);
  const usedBy = (id: string) => data.days.filter((d) => d.workout_id === id).length;

  /** Writes the whole list of rows in one request, so the database sees a finished superset, never a half-changed one. */
  async function save(next: WorkoutRow[], removed: string[] = []) {
    if (!w) return;
    const problems = workoutProblems(next);
    if (problems.length) { setMsg(problems[0]); return; }
    setMsg('');
    // A row being removed first leaves its superset, in the same request, so the database never sees a superset of one.
    const leaving = rows.filter((r) => removed.includes(r.id)).map((r) => ({ ...r, superset: null }));
    const upsert = [...next, ...leaving].map((r, i) => ({
      id: r.id, user_id: data.userId, workout_id: w.id, position: i, exercise_id: r.exerciseId, sets: r.sets, reps: r.reps, rest_seconds: r.rest, superset_letter: r.superset,
    }));
    if (upsert.length) {
      const r = await sb.from('workout_items').upsert(upsert, { onConflict: 'id' });
      if (r.error) { setMsg(plainError(r.error.message)); await reload(); return; }
    }
    if (removed.length) {
      const r = await sb.from('workout_items').delete().in('id', removed);
      if (r.error) setMsg(plainError(r.error.message));
    }
    await reload();
  }
  const patch = (i: number, p: Partial<WorkoutRow>) => save(rows.map((r, k) => (k === i ? { ...r, ...p } : r)));

  async function newWorkout() {
    const name = window.prompt('Name of the new workout');
    if (!name?.trim()) return;
    const r = await sb.from('workouts').insert({ user_id: data.userId, name: name.trim() }).select('id').single();
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    await reload(); setSel(r.data.id as string);
  }
  async function copy() {
    if (!w) return;
    const r = await sb.from('workouts').insert({ user_id: data.userId, name: copyName(w.name, data.workouts.map((x) => x.name)) }).select('id').single();
    if (r.error) { setMsg(plainError(r.error.message)); return; }
    const newId = r.data.id as string;
    if (rows.length) {
      const ins = await sb.from('workout_items').insert(rows.map((x, i) => ({
        user_id: data.userId, workout_id: newId, position: i, exercise_id: x.exerciseId, sets: x.sets, reps: x.reps, rest_seconds: x.rest, superset_letter: x.superset,
      })));
      if (ins.error) setMsg(plainError(ins.error.message));
    }
    await reload(); setSel(newId);
  }
  async function archive(on: boolean) {
    if (!w) return;
    if (on && usedBy(w.id) && !window.confirm(`"${w.name}" is still used by ${usedBy(w.id)} campaign day${usedBy(w.id) === 1 ? '' : 's'}. Those days keep running and show an Archived tag. Archive it?`)) return;
    const r = await sb.from('workouts').update({ archived_at: on ? new Date().toISOString() : null }).eq('id', w.id);
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
  }
  async function addRow(exerciseId: string) {
    const ex = exById.get(exerciseId);
    if (!ex) return;
    await save([...rows, { id: crypto.randomUUID(), exerciseId, sets: 3, reps: 10, rest: null, superset: null }]);
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="row">
          <select aria-label="Workout" value={w?.id ?? ''} onChange={(e) => setSel(e.target.value)}>
            {list.map((x) => <option key={x.id} value={x.id}>{x.name}{x.archived_at ? ' (archived)' : ''}</option>)}
          </select>
          <button className="btn" onClick={newWorkout}>New workout</button>
          <button className="btn" onClick={copy} disabled={!w}>Copy this one</button>
          <label className="check"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived</label>
        </div>
        {msg && <div className="error" role="alert">{msg}</div>}
        {!w ? <div className="muted">No workouts yet. Press New workout.</div> : (
          <div className="pbox">
            <div className="row">
              <label>Name<TextCell value={w.name} label="Workout name" width={240} onSave={async (v) => {
                if (!v.trim()) return;
                const r = await sb.from('workouts').update({ name: v.trim() }).eq('id', w.id);
                if (r.error) setMsg(plainError(r.error.message));
                await reload();
              }} /></label>
              {w.archived_at && <span className="tag">Archived</span>}
              <button className="btn" onClick={() => archive(!w.archived_at)}>{w.archived_at ? 'Restore' : 'Archive'}</button>
              {usedBy(w.id) > 0 && <span className="muted">Used by {usedBy(w.id)} campaign day{usedBy(w.id) === 1 ? '' : 's'}</span>}
            </div>
            <div className="scroll">
              <table>
                <thead><tr><th>#</th><th>Exercise</th><th>Sets</th><th>Reps</th><th>Rest s</th><th>Superset</th><th>Budget</th><th></th></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const ex = exById.get(r.exerciseId);
                    const members = r.superset ? rows.filter((x) => x.superset === r.superset).length : 0;
                    return (
                      <tr key={r.id}>
                        <td>{i + 1}</td>
                        <td>
                          <div className="row tight">
                          <select aria-label={`Exercise ${i + 1}`} value={r.exerciseId} onChange={(e) => patch(i, { exerciseId: e.target.value })}>
                            {pickable.concat(ex && ex.archived_at ? [ex] : []).map((e) => <option key={e.id} value={e.id}>{e.name}{e.archived_at ? ' (archived)' : ''}</option>)}
                          </select>
                          <button className="btn small" onClick={() => showInPanel(r.exerciseId)}>Details</button>
                          </div>
                        </td>
                        <td><NumCell value={r.sets} label={`Sets of row ${i + 1}`} min={1} max={12} onSave={(v) => save(setRowSets(rows, i, v ?? r.sets))} /></td>
                        <td><NumCell value={r.reps} label={`Reps of row ${i + 1}`} min={1} max={50} onSave={(v) => patch(i, { reps: v ?? r.reps })} /></td>
                        <td><NumCell value={r.rest} blank placeholder={ex ? String(ex.rest_seconds) : ''} label={`Rest of row ${i + 1}, blank uses the exercise's rest`} min={0} max={600} onSave={(v) => patch(i, { rest: v })} /></td>
                        <td>
                          <select aria-label={`Superset letter of row ${i + 1}`} value={r.superset ?? ''} onChange={(e) => {
                            const v = e.target.value === '__new' ? nextSupersetLetter(rows) : e.target.value || null;
                            const res = setRowSuperset(rows, i, v);
                            if (res.problem) { setMsg(res.problem); return; }
                            void save(res.rows);
                          }}>
                            <option value="">None</option>
                            {[...new Set(rows.map((x) => x.superset).filter(Boolean) as string[])].map((l) => <option key={l} value={l}>{l}</option>)}
                            <option value="__new">New superset…</option>
                          </select>
                          {r.superset && members < 2 && <div className="muted">needs a partner</div>}
                        </td>
                        <td>{ex ? mmss(rowBudget(rows, i, (id) => { const e = exById.get(id); return e ? { work: e.work_seconds, rest: e.rest_seconds } : undefined; })) : '—'}</td>
                        <td>
                          <div className="row tight">
                            <button className="btn small icon" aria-label={`Move row ${i + 1} up`} disabled={i === 0} onClick={() => save(moveRow(rows, i, -1))}>↑</button>
                            <button className="btn small icon" aria-label={`Move row ${i + 1} down`} disabled={i === rows.length - 1} onClick={() => save(moveRow(rows, i, 1))}>↓</button>
                            <button className="btn small" onClick={() => save(removeRow(rows, i), [r.id])}>Remove</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row">
              <select aria-label="Add an exercise to this workout" value="" onChange={(e) => e.target.value && addRow(e.target.value)}>
                <option value="">Add exercise…</option>
                {pickable.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="muted">Blank rest uses the exercise&apos;s own rest. Rows sharing a superset letter are bound together: two or three exercises, always the same number of sets. A day in a campaign follows this workout until it is performed.</div>
          </div>
        )}
      </div>
      <ExercisePanel />
    </div>
  );
}
