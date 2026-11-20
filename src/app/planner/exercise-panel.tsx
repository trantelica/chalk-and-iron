'use client';
import { useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { currentRecords, estimatedOneRepMax, RECORD_LABEL, type RecordType } from '@/rules/workout';
import { viewWeight } from '@/rules/planner';
import { missingFields } from '@/rules/swap-made';
import { usePlanner } from './planner-data';
import { loadExerciseSets, sessionsOf, toFacts, type LoggedSet } from './history-data';
import { Graph } from './graph';

const TIER: Record<string, string> = { bodyweight: 'Bodyweight', basic_gym: 'Basic gym', full_gym: 'Full gym' };

// The exercise panel (spec Section 5): an exercise's details, swaps, graph and
// records, wherever it appears. Weights follow the planner's pounds or
// kilograms view toggle.
export function ExercisePanel() {
  const { data, panelId, showInPanel, view } = usePlanner();
  const sb = browserClient();
  const [sets, setSets] = useState<LoggedSet[] | null>(null);
  const ex = data.exercises.find((x) => x.id === panelId) ?? null;

  useEffect(() => {
    setSets(null);
    if (!panelId) return;
    let live = true;
    void loadExerciseSets(sb, panelId).then((s) => { if (live) setSets(s); });
    return () => { live = false; };
  }, [panelId, sb]);

  const kind = useMemo(() => (ex ? { unit: ex.default_unit, assisted: ex.assisted, loadCount: ex.load_count } : null), [ex]);
  const term = (id: string | null) => data.terms.find((t) => t.id === id)?.name ?? null;
  const live = data.exercises.filter((x) => !x.archived_at);

  return (
    <aside className="panel ex-panel" aria-label="Exercise panel">
      <div className="lab">Exercise</div>
      <select value={panelId ?? ''} onChange={(e) => showInPanel(e.target.value || null)} aria-label="Exercise shown in this panel">
        <option value="">Pick an exercise</option>
        {live.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!ex || !kind ? <div className="muted">Pick an exercise, or press Details on a row, to see its swaps, graph and records.</div> : (
        <>
          <div className="display big-name">{ex.name}</div>
          <div className="fixed-line"><b>{term(ex.muscle_group_id) ?? 'No muscle group'}</b>{term(ex.focus_id) ? ` · ${term(ex.focus_id)}` : ''}</div>
          <div className="muted">{term(ex.equipment_id) ?? 'No equipment'} · unit {ex.default_unit === 'bw' ? 'bodyweight' : ex.default_unit} · {ex.work_seconds}s work per set · {ex.rest_seconds}s rest{ex.assisted ? ' · assisted' : ''}{ex.load_count > 1 ? ` · counts ${ex.load_count}×` : ''}</div>
          {missingFields(ex).length > 0 && <div><span className="tag">Incomplete</span> <span className="muted">missing {missingFields(ex).join(' and ')}</span></div>}
          {ex.note && <div className="muted">Note: {ex.note}</div>}
          <div className="lab">Swaps</div>
          {data.alternates.filter((a) => a.exercise_id === ex.id).length === 0
            ? <div className="muted">No swaps stored.</div>
            : (['bodyweight', 'basic_gym', 'full_gym'] as const).map((t) => {
              const a = data.alternates.find((x) => x.exercise_id === ex.id && x.tier === t);
              return a ? (
                <div key={t} className="row spread small-text"><span className="muted">{TIER[t]}</span>
                  {a.alternate_exercise_id
                    ? <button className="link" onClick={() => showInPanel(a.alternate_exercise_id)}>{a.name}</button>
                    : <span>{a.name}</span>}
                </div>
              ) : null;
            })}
          <div className="lab topline">History</div>
          {sets === null ? <div className="muted">Loading…</div> : <Stats sets={sets} kind={kind} view={view} />}
        </>
      )}
    </aside>
  );
}

function Stats({ sets, kind, view }: { sets: LoggedSet[]; kind: { unit: 'lb' | 'kg' | 'bw'; assisted: boolean; loadCount: number }; view: 'lb' | 'kg' }) {
  const facts = toFacts(sets);
  const recs = currentRecords(facts, kind);
  const e1 = estimatedOneRepMax(facts, kind);
  const sessions = sessionsOf(sets).slice(-6).map((s) => ({ label: s.day.slice(5), sets: s.sets }));
  const rows: RecordType[] = kind.unit === 'bw' ? ['most_reps'] : ['heaviest', '6_plus', '10_plus', '20_plus'];
  const unit = kind.unit === 'bw' ? 'bw' : view;
  return (
    <>
      <Graph sessions={sessions} unit={unit} kind={kind} />
      {kind.unit !== 'bw' && <div className="row spread small-text"><span className="muted">Estimated one-rep max</span><b>{e1 === null ? 'n/a' : viewWeight(Math.round(e1 * 10) / 10, view)}</b></div>}
      {rows.map((t) => {
        const r = recs[t];
        return (
          <div key={t} className="row spread small-text"><span className="muted">{kind.unit === 'bw' ? 'Most reps in a set' : RECORD_LABEL[t]}</span>
            <b>{r ? `${r.lb === null ? '' : viewWeight(r.lb, view) + ' × '}${r.reps}${r.lb === null ? ' reps' : ''} · ${r.day}` : '—'}</b>
          </div>
        );
      })}
    </>
  );
}
