'use client';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { fromPounds } from '@/rules/units';
import { mmss, RECORD_LABEL, type RecordType } from '@/rules/workout';
import { setsToDelete, summarizeSession, typedToPounds, viewWeight, volumeText, type ViewUnit } from '@/rules/planner';
import { usePlanner } from '../../planner-data';
import { loadSessions, loadWorkoutNames, type LoggedSet, type SessionData } from '../../history-data';
import { ExercisePanel } from '../../exercise-panel';

// History (spec Section 5): the past. Sessions by workout, and any exercise's
// graph and records (the exercise panel). Logged sets can be edited or
// deleted here, and records are worked out again by the database (spec
// Section 10; confirmed by Nate, 20 Nov). Nothing else in History can be edited.
export default function History() {
  const { data, view, showInPanel } = usePlanner();
  const sb = browserClient();
  const [list, setList] = useState<SessionData[] | null>(null);
  const [workout, setWorkout] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [shown, setShown] = useState(10);

  const [names, setNames] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const PAGE = 10;
  // Loads the first `count` sessions (for the chosen workout), one more than shown, to know whether more exist.
  const load = useCallback(async (count: number) => {
    const got = await loadSessions(sb, { offset: 0, limit: count + 1, workout: workout || undefined });
    setMore(got.length > count);
    setList(got.slice(0, count));
  }, [sb, workout]);
  useEffect(() => { void load(shown); }, [load, shown]);
  useEffect(() => { void loadWorkoutNames(sb).then(setNames); }, [sb]);

  const kindOf = useCallback((id: string) => {
    const e = data.exercises.find((x) => x.id === id);
    return { unit: e?.default_unit ?? 'lb', assisted: e?.assisted ?? false, loadCount: e?.load_count ?? 1 } as const;
  }, [data.exercises]);

  const rows = useMemo(() => (list ?? []).map((x) => ({
    x,
    sum: summarizeSession({
      clockBanked: x.session.clock_banked_seconds,
      blocks: x.blocks.map((b) => ({ ...b })),
      exercises: x.exercises.map((e) => ({ id: e.id, block_id: e.block_id, exercise_id: e.exercise_id, state: e.state, planned: e.planned, sets_before_break: e.sets_before_break })),
      sets: x.sets.map((s) => ({ id: s.id, session_exercise_id: s.sessionExerciseId, lb: s.lb, reps: s.reps, type: s.type, records: s.records })),
      kind: kindOf,
    }),
  })), [list, kindOf]);

  async function apply(changes: { kind: string; data: Record<string, unknown> }[]) {
    setMsg('');
    const r = await sb.rpc('apply_changes', { p_changes: changes.map((c) => ({ id: crypto.randomUUID(), ...c })) });
    if (r.error) { setMsg(r.error.message); return false; }
    const ans = r.data as { rejected?: { reason: string }[] };
    if (ans.rejected?.length) { setMsg(ans.rejected[0].reason); return false; }
    await load(shown);
    return true;
  }

  return (
    <div className="cols">
      <div className="stack">
        <div className="muted">What you already did: past sessions, graphs and records. Click a session to see its sets. A logged set can be edited or deleted with its Edit button (records are worked out again). Nothing else here can be edited.</div>
        {msg && <div className="error" role="alert">{msg}</div>}
        <div className="row">
          <select aria-label="Show sessions of" value={workout} onChange={(e) => { setWorkout(e.target.value); setShown(10); }}>
            <option value="">All workouts</option>
            {names.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <span className="muted">{list === null ? 'Loading…' : `Showing ${rows.length} session${rows.length === 1 ? '' : 's'}${more ? ', newest first' : ''}`}</span>
        </div>
        <div className="pbox scroll">
          <table>
            <thead><tr><th>Date</th><th>Workout</th><th>Time</th><th>Volume</th><th>Efficiency</th><th>Records</th><th></th></tr></thead>
            <tbody>
              {rows.map(({ x, sum }) => {
                const isOpen = x.session.id === sel;
                const toggle = () => setSel(isOpen ? null : x.session.id);
                return (
                  <Fragment key={x.session.id}>
                    <tr className={`click-row ${isOpen ? 'sel-row' : ''}`} onClick={toggle} aria-expanded={isOpen}>
                      <td>{x.session.local_date}</td>
                      <td>{x.session.workout_name}{x.session.status === 'active' && <span className="tag on">In progress</span>}{x.session.finish_reason === 'replaced' && <span className="tag">Replaced</span>}</td>
                      <td>{mmss(sum.elapsed)}</td>
                      <td>{volumeText(sum.volumeLb, sum.volumeBw, view)}</td>
                      <td>{sum.efficiency === null ? 'n/a' : `${sum.efficiency}%`}</td>
                      <td>{sum.records}</td>
                      <td><button className="btn small" onClick={(e) => { e.stopPropagation(); toggle(); }}>{isOpen ? 'Close' : 'Open'}</button></td>
                    </tr>
                    {isOpen && (
                      <tr className="detail-row"><td colSpan={7}><SessionDetail s={x} view={view} onDetails={showInPanel} apply={apply} /></td></tr>
                    )}
                  </Fragment>
                );
              })}
              {list !== null && rows.length === 0 && <tr><td colSpan={7} className="muted">No sessions yet. They appear here as you finish workouts on the phone.</td></tr>}
            </tbody>
          </table>
        </div>
        {more && <button className="btn" onClick={() => setShown((n) => n + PAGE)}>Show 10 more</button>}
      </div>
      <ExercisePanel />
    </div>
  );
}

function SessionDetail({ s, view, onDetails, apply }: {
  s: SessionData; view: ViewUnit; onDetails: (id: string) => void;
  apply: (c: { kind: string; data: Record<string, unknown> }[]) => Promise<boolean>;
}) {
  const running = s.session.status === 'active';
  const blockOf = (seId: string) => {
    const e = s.exercises.find((x) => x.id === seId);
    return e ? { block: e.block_id, members: s.exercises.filter((x) => x.block_id === e.block_id).map((x) => x.id) } : null;
  };
  const setsOf = (seId: string) => s.sets.filter((x) => x.sessionExerciseId === seId).map((x) => ({ id: x.id, setNumber: x.setNumber }));
  const ordered = s.exercises.slice().sort((a, b) => {
    const pa = s.blocks.find((x) => x.id === a.block_id)?.position ?? 0;
    const pb = s.blocks.find((x) => x.id === b.block_id)?.position ?? 0;
    return pa - pb || a.position_in_block - b.position_in_block;
  });
  async function del(set: LoggedSet) {
    const ids = setsToDelete({ id: set.id, sessionExerciseId: set.sessionExerciseId, setNumber: set.setNumber }, blockOf, setsOf);
    const more = ids.length > 1 ? ` This is a superset, so the same round of the other exercise${ids.length > 2 ? 's' : ''} is deleted too.` : '';
    if (!window.confirm(`Delete set ${set.setNumber}? Records are worked out again.${more}`)) return;
    await apply(ids.map((id) => ({ kind: 'set.delete', data: { id } })));
  }
  return (
    <div className="pbox" aria-label="Session detail">
      <div className="row spread"><b>{s.session.workout_name}</b><span className="muted">{s.session.local_date}</span></div>
      {running && <div className="muted">This workout is still running on the phone, so its sets cannot be changed here.</div>}
      {ordered.map((e) => {
        const sets = s.sets.filter((x) => x.sessionExerciseId === e.id).sort((a, b) => a.setNumber - b.setNumber);
        const blockLetter = s.blocks.find((b) => b.id === e.block_id)?.superset_letter;
        return (
          <div key={e.id} className="stack">
            <div className="row">
              <b>{e.exercise_name_then}</b>
              {blockLetter && <span className="tag">Superset {blockLetter}</span>}
              {e.state === 'skipped' && <span className="tag">Skipped</span>}
              {e.state === 'replaced' && <span className="tag">Replaced</span>}
              <button className="btn small" onClick={() => onDetails(e.exercise_id)}>Graph and records</button>
            </div>
            {sets.length === 0 ? <div className="muted">No sets logged.</div> : sets.map((st) => (
              <SetRow key={st.id + st.reps + (st.lb ?? '') + st.type + (st.rpe ?? '')} set={st} view={view} locked={running} onDelete={() => del(st)}
                onSave={(d) => apply([{ kind: 'set.put', data: { id: st.id, session_exercise_id: st.sessionExerciseId, set_number: st.setNumber, logged_at: st.loggedAt, ...d } }])} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SetRow({ set, view, locked, onSave, onDelete }: {
  set: LoggedSet; view: ViewUnit; locked: boolean; onDelete: () => void; onSave: (d: Record<string, unknown>) => Promise<boolean>;
}) {
  const bw = set.enteredUnit === 'bw';
  const shown = bw ? '' : String(set.enteredUnit === view ? set.enteredValue : fromPounds(set.lb ?? 0, view));
  const [editing, setEditing] = useState(false);
  const [w, setW] = useState(shown);
  const [reps, setReps] = useState(String(set.reps));
  const [type, setType] = useState(set.type);
  const [rpe, setRpe] = useState(set.rpe === null ? '' : String(set.rpe));
  const [busy, setBusy] = useState(false);
  const label = (t: string) => `${t} of set ${set.setNumber}`;
  const TYPE: Record<LoggedSet['type'], string> = { warm_up: 'Warm-up', working: 'Working', drop: 'Drop set' };
  const reset = () => { setW(shown); setReps(String(set.reps)); setType(set.type); setRpe(set.rpe === null ? '' : String(set.rpe)); setEditing(false); };
  async function save() {
    const n = Number(reps);
    if (!Number.isInteger(n) || n < 1 || n > 500) { window.alert('Reps must be a whole number of 1 or more.'); return; }
    const r = rpe.trim() === '' ? null : Number(rpe);
    if (r !== null && !(r >= 1 && r <= 10)) { window.alert('RPE is a score from 1 to 10, or blank.'); return; }
    let weight: Record<string, unknown>;
    if (bw) weight = { weight_lb: null, entered_value: 1, entered_unit: 'bw' };
    else if (w === shown) weight = { weight_lb: set.lb, entered_value: set.enteredValue, entered_unit: set.enteredUnit };
    else {
      const v = Number(w);
      if (!Number.isFinite(v) || v < 0 || w.trim() === '') { window.alert('A weight must be zero or more.'); return; }
      weight = { weight_lb: typedToPounds(v, view), entered_value: v, entered_unit: view };
    }
    setBusy(true);
    const ok = await onSave({ ...weight, reps: n, set_type: type, rpe: r });
    setBusy(false);
    if (ok) setEditing(false);
  }
  const badges = set.records.map((t) => <span key={t} className="tag on">{RECORD_LABEL[t as RecordType] ?? t}</span>);
  if (!editing) {
    return (
      <div className="row set-edit">
        <span className="muted set-no">Set {set.setNumber}</span>
        <span className="set-text">{bw ? '1 BW' : viewWeight(set.lb ?? 0, view)} × {set.reps}</span>
        <span className="muted">{TYPE[set.type]}{set.rpe !== null ? ` · RPE ${set.rpe}` : ''}</span>
        {badges}
        {!locked && <button className="btn small" onClick={() => setEditing(true)}>Edit</button>}
      </div>
    );
  }
  return (
    <div className="row set-edit editing" role="group" aria-label={`Editing set ${set.setNumber}`}>
      <span className="muted set-no">Set {set.setNumber}</span>
      {bw ? <span>1 BW</span> : <label className="inline">Weight ({view})<input type="number" min={0} step="0.5" value={w} aria-label={label(`Weight in ${view}`)} onChange={(e) => setW(e.target.value)} /></label>}
      <label className="inline">Reps<input type="number" min={1} value={reps} aria-label={label('Reps')} onChange={(e) => setReps(e.target.value)} /></label>
      <label className="inline">Type<select value={type} aria-label={label('Type')} onChange={(e) => setType(e.target.value as LoggedSet['type'])}>
        <option value="warm_up">Warm-up</option><option value="working">Working</option><option value="drop">Drop set</option>
      </select></label>
      <label className="inline">RPE<input type="number" min={1} max={10} step="0.5" placeholder="blank" value={rpe} aria-label={label('RPE')} onChange={(e) => setRpe(e.target.value)} /></label>
      <button className="btn primary small-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      <button className="btn small" disabled={busy} onClick={reset}>Cancel</button>
      <button className="btn small danger" disabled={busy} onClick={onDelete}>Delete set</button>
    </div>
  );
}
