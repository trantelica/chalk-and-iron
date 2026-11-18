'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { trainingDay } from '@/rules/days';
import { displayWeight, fromPounds, stepReps, stepWeight, weightToStore, type StoredWeight, type WeightUnit } from '@/rules/units';
import {
  addExercise, addRest, allDone, blockBudget, blockDone, blockOf, blockSkipped, breakSuperset, canBreak, efficiencyOf,
  factsFor, finishSession, goTo, kindOf, liveBlocks, logSet, moveBlock, pastFacts, recordsToday, setDetails, setsDone, setsPlanned,
  skipBlock, skipRest, startExercise, startSession, swapExercise, toggleSet, toHistory, undoBreak, volumeOf,
  lastLoggedSetUndo,
  type History, type PlanItem, type Session,
} from '@/rules/session';
import {
  RECORD_LABEL, celebrationName, currentRecords, dial, estimatedOneRepMax, mmss, readClock, seedWeights, setVolume,
  type RecordType, type SetType,
} from '@/rules/workout';

export interface LibExercise {
  id: string; name: string; muscle: string; equipment: string; unit: 'lb' | 'kg' | 'bw'; work: number; rest: number; note: string;
  assisted: boolean; loadCount: number; alternates: { tier: 'bodyweight' | 'basic_gym' | 'full_gym'; name: string }[];
}
export interface LibWorkout {
  id: string; name: string; items: { exerciseId: string; sets: number; reps: number; rest: number | null; superset: string | null }[];
}

const KEY = { session: 'ci-session-v1', history: 'ci-history-v1', units: 'ci-units-v1', notes: 'ci-notes-v1' };
const read = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage may be blocked */ } };
const TIER: Record<string, string> = { bodyweight: 'Bodyweight', basic_gym: 'Basic gym', full_gym: 'Full gym' };

function toPlan(e: LibExercise, sets: number, reps: number, rest: number | null, superset: string | null): PlanItem {
  return {
    exerciseId: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, unit: e.unit, assisted: e.assisted, loadCount: e.loadCount,
    work: e.work, rest: rest ?? e.rest, sets, reps, superset, alternates: e.alternates,
  };
}

export function WorkoutApp({ exercises, workouts, timeZone }: { exercises: LibExercise[]; workouts: LibWorkout[]; today: string; timeZone: string }) {
  const [ready, setReady] = useState(false);
  const [sess, setSess] = useState<Session | null>(null);
  const [history, setHistory] = useState<History>({});
  const [units, setUnits] = useState<Record<string, WeightUnit>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState<null | 'stats' | 'swap' | 'detail' | 'add' | 'finish' | 'summary'>(null);
  const [detailRound, setDetailRound] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [banner, setBanner] = useState('');
  const [undo, setUndo] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const libById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);

  useEffect(() => {
    setSess(read<Session | null>(KEY.session, null));
    setHistory(read<History>(KEY.history, {}));
    setUnits(read(KEY.units, {}));
    setNotes(read(KEY.notes, {}));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) write(KEY.session, sess); }, [sess, ready]);
  useEffect(() => { if (ready) write(KEY.units, units); }, [units, ready]);
  useEffect(() => { if (ready) write(KEY.notes, notes); }, [notes, ready]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const active = sess && sess.endedAt === null ? sess : null;

  // The screen stays awake during a session, and asks again whenever the app returns to the screen.
  useEffect(() => {
    if (!active) return;
    const ask = async () => { try { lock.current = await navigator.wakeLock?.request('screen'); } catch { /* not available */ } };
    ask();
    const vis = () => { if (document.visibilityState === 'visible') ask(); };
    document.addEventListener('visibilitychange', vis);
    return () => { document.removeEventListener('visibilitychange', vis); lock.current?.release().catch(() => {}); lock.current = null; };
  }, [active]);

  const seedOf = useCallback(
    (id: string, sets: number, assisted: boolean) => {
      const last = (history[id] ?? []).at(-1);
      return seedWeights(last ? last.sets.map((x) => x.lb) : [], sets, assisted);
    },
    [history],
  );

  const flash = (text: string) => { setBanner(text); setTimeout(() => setBanner((b) => (b === text ? '' : b)), 4000); };

  // Rest end with the app on screen: a banner and a short sound that mixes with music and follows silent mode.
  useEffect(() => {
    if (!active || active.restEndsAt === null || now < active.restEndsAt) return;
    setSess(skipRest(active));
    flash('Rest over. Time for your next set.');
    try {
      const ctx = audio.current;
      if (ctx && ctx.state === 'running') {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.2; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
      }
    } catch { /* no sound */ }
  }, [now, active]);

  function unlockSound() {
    try {
      const sessionApi = (navigator as { audioSession?: { type: string } }).audioSession;
      if (sessionApi) sessionApi.type = 'ambient'; // mixes with music, follows silent mode
      if (!audio.current) audio.current = new AudioContext();
      if (audio.current.state !== 'running') void audio.current.resume();
    } catch { /* no sound */ }
  }

  // ---------------------------------------------------------------- starting
  function begin(name: string, plan: PlanItem[]) {
    if (!plan.length) return;
    const t = Date.now();
    setSess(startSession(name, trainingDay(new Date(t), timeZone), plan, history, t, seedOf));
    setSheet(null); setTray(false);
  }

  if (!ready) return <main className="phone"><div className="muted">Opening…</div></main>;

  if (!active) {
    if (sess && sess.endedAt !== null && sheet !== 'summary') {
      // A finished workout waits here until it is dismissed.
    }
    return (
      <StartScreen
        exercises={exercises} workouts={workouts} libById={libById}
        summary={sess && sess.endedAt !== null ? sess : null} history={history} now={now}
        onDismiss={() => setSess(null)}
        onStart={begin}
      />
    );
  }

  const s = active;
  const block = blockOf(s, s.curBlock);
  const e = s.exercises[s.curMember];
  const live = liveBlocks(s);
  const pos = live.findIndex((b) => b.id === block.id);
  const budget = blockBudget(s, block);
  const elapsed = readClock(block.clock, now);
  const d = dial(budget, elapsed, block.started);
  const resting = s.restEndsAt !== null;
  const restLeft = resting ? Math.max(0, (s.restEndsAt! - now) / 1000) : 0;
  const round = e.logs.length;
  const done = blockDone(s, block);
  const everything = allDone(s);
  const unit: WeightUnit | 'bw' = e.unit === 'bw' ? 'bw' : units[e.exerciseId] ?? (e.unit as WeightUnit);
  const prior = history[e.exerciseId] ?? [];
  const lastSession = prior.at(-1);
  const kind = kindOf(e);
  const allFacts = [...pastFacts(history, e.exerciseId), ...factsFor(e, s.day)];
  const records = currentRecords(allFacts, kind);

  const mainLabel = !block.started ? 'Start exercise' : done ? (everything ? 'Finish workout' : 'Next exercise') : 'Log set';

  function nextOpen(from: Session): string | null {
    const lb = liveBlocks(from);
    const i = lb.findIndex((b) => b.id === from.curBlock);
    const after = [...lb.slice(i + 1), ...lb.slice(0, i)].find((b) => !blockSkipped(from, b) && !blockDone(from, b));
    return after?.id ?? null;
  }

  function onMain(entry: { lb: number | null; enteredValue: number; enteredUnit: 'lb' | 'kg' | 'bw'; reps: number } | null) {
    const t = Date.now();
    unlockSound();
    if (!block.started) { setSess(startExercise(s, t)); return; }
    if (done) {
      if (everything) { setSheet('finish'); return; }
      const nx = nextOpen(s);
      if (nx) setSess(goTo(s, nx, t));
      return;
    }
    if (!entry) return;
    const out = logSet(s, entry, history, t);
    setSess(out.session);
    setUndo(e.key);
    setTimeout(() => setUndo((u) => (u === e.key ? null : u)), 6000);
    const name = celebrationName(out.earned);
    if (name) flash(`New record: ${RECORD_LABEL[name]} on ${e.name}`);
  }

  function finish() {
    const t = Date.now();
    const fin = finishSession(s, t);
    setHistory((h) => { const nh = toHistory(fin, h); write(KEY.history, nh); return nh; });
    setSess(fin); setSheet('summary'); setTray(false);
  }

  const phase = block.letter ? `Superset ${block.letter}${block.members.indexOf(e.key) + 1} of ${block.members.length}` : `Exercise ${pos + 1} of ${live.length}`;
  const subline = block.letter
    ? `${block.members.indexOf(e.key) === 0 ? 'Then' : 'With'} ${block.members.filter((k) => k !== e.key).map((k) => s.exercises[k].name).join(', ')}`
    : [e.muscle, e.equipment].filter(Boolean).join(' · ');

  return (
    <main className="phone">
      <div className="phone-top">
        <Link className="btn icon" href="/app" aria-label="Back to the home screen">‹</Link>
        <button className="pull" onClick={() => setTray(true)} aria-label="Pull down the full workout">
          <span>Workout</span><span aria-hidden="true">⌄</span>
        </button>
        <Link className="btn coach" href="/app" aria-label="Coach">Coach</Link>
      </div>

      <div className="phone-head">
        <div className="row tight">
          <button className="btn icon" disabled={pos <= 0} onClick={() => setSess(goTo(s, live[pos - 1].id, Date.now()))} aria-label="Previous exercise">‹</button>
          <span className="lab">{s.name} · {pos + 1}/{live.length}</span>
          <button className="btn icon" disabled={pos >= live.length - 1} onClick={() => setSess(goTo(s, live[pos + 1].id, Date.now()))} aria-label="Next exercise">›</button>
        </div>
        <div className="row tight"><span className="lab">Workout</span><span className="display clock-text">{mmss(readClock(s.clock, now))}</span></div>
      </div>

      <div className="ex-title">
        <div className="lab accent-text">{phase}</div>
        <h1 className="ex-name">{e.name}</h1>
        <div className="muted fixed-line">{subline}</div>
        {block.members.length > 1 && canBreak(s, block) && (
          <button className="btn small" onClick={() => setSess(breakSuperset(s, block.id, Date.now()))}>Break superset</button>
        )}
        {block.brokenFrom && s.breakUndo && (
          <button className="btn small" onClick={() => setSess(undoBreak(s, Date.now()))}>Undo break</button>
        )}
      </div>

      <input
        className="note" aria-label="Note for this exercise" placeholder="Add a note that stays with this exercise"
        value={notes[e.exerciseId] ?? libById.get(e.exerciseId)?.note ?? ''}
        onChange={(ev) => setNotes({ ...notes, [e.exerciseId]: ev.target.value })}
      />

      <div className="dial-row">
        <DialView fill={d.fill} red={d.red} rest={resting ? restLeft / s.restTotal : 0} />
        <div className="dial-text">
          <div className="lab">Exercise clock</div>
          <div className="display clock-text">{!block.started ? 'Not started' : d.remaining >= 0 ? `${mmss(d.remaining)} left` : `+${mmss(-d.remaining)} over`}</div>
          <div className="muted">Budget {mmss(budget)}</div>
          <div className={`rest-line ${resting ? 'on' : ''}`} aria-live="off">{resting ? `Resting ${mmss(restLeft)}` : 'Not resting'}</div>
          <div className="row tight">
            <button className="btn" disabled={!resting} onClick={() => setSess(addRest(s, 15))}>+0:15</button>
            <button className="btn" disabled={!resting} onClick={() => setSess(skipRest(s))}>Skip rest</button>
          </div>
        </div>
      </div>

      <SetList
        s={s} e={e} unit={unit} round={round}
        onToggle={(r) => setSess(toggleSet(s, r))}
        onDetail={(r) => { setDetailRound(r); setSheet('detail'); }}
      />

      <div className="last-time muted">
        {lastSession ? `Last time: ${lastSession.sets.map((x) => `${unit === 'bw' || x.lb === null ? '1 BW' : displayNum(fromPounds(x.lb, unit))}${unit === 'bw' ? '' : ' ' + unit} × ${x.reps}`).join(' · ')}` : 'No history yet for this exercise'}
      </div>

      <Entry
        key={`${e.key}-${round}-${block.started}`}
        e={e} round={round} unit={unit}
        disabled={!block.started || done}
        mainLabel={mainLabel}
        onUnit={(u) => setUnits({ ...units, [e.exerciseId]: u })}
        onMain={onMain}
        undo={undo === e.key ? () => { setSess(lastLoggedSetUndo(s, e.key)); setUndo(null); } : null}
      />

      <div className="row actions">
        <button className="btn grow" onClick={() => setSheet('swap')}>Swap</button>
        <button className="btn grow" onClick={() => setSheet('stats')}>Stats</button>
      </div>

      {banner && <div className="banner" role="status">{banner}</div>}

      {tray && (
        <Tray
          s={s} now={now} libById={libById}
          onClose={() => setTray(false)}
          onGo={(id, key) => { setSess(goTo(s, id, Date.now(), key)); setTray(false); }}
          onSkip={(id) => setSess(skipBlock(s, id, Date.now()))}
          onMove={(id, dlt) => setSess(moveBlock(s, id, dlt))}
          onBreak={(id) => setSess(breakSuperset(s, id, Date.now()))}
          onUndoBreak={() => setSess(undoBreak(s, Date.now()))}
          onAdd={() => setSheet('add')}
          onFinish={() => setSheet('finish')}
        />
      )}

      {sheet === 'stats' && (
        <Sheet title="Stats" onClose={() => setSheet(null)}>
          <StatsBody s={s} e={e} unit={unit} history={history} now={now} records={records} />
        </Sheet>
      )}
      {sheet === 'swap' && (
        <Sheet title={`Swap ${e.name}`} onClose={() => setSheet(null)}>
          <div className="muted">Replaces this exercise for today only. Your library workout is not changed.</div>
          {e.alternates.length === 0 && <div className="muted">This exercise has no stored alternates yet.</div>}
          {(['bodyweight', 'basic_gym', 'full_gym'] as const).map((tier) => {
            const a = e.alternates.find((x) => x.tier === tier);
            if (!a) return null;
            const target = exercises.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
            return (
              <button key={tier} className="btn opt" disabled={!target} onClick={() => {
                if (!target) return;
                setSess(swapExercise(s, e.key, toPlan(target, e.types.length, e.plannedReps, null, null), seedOf));
                setSheet(null);
              }}>
                <span className="lab">{TIER[tier]}</span>
                <span>{a.name}{target ? '' : ' (not in your library yet)'}</span>
              </button>
            );
          })}
          <Link className="btn opt" href="/app">Ask my coach for another</Link>
        </Sheet>
      )}
      {sheet === 'detail' && (
        <DetailSheet s={s} e={e} round={detailRound} onClose={() => setSheet(null)}
          onSave={(type, rpe) => { setSess(setDetails(s, e.key, detailRound, type, rpe)); setSheet(null); }} />
      )}
      {sheet === 'add' && (
        <AddSheet exercises={exercises} onClose={() => setSheet(null)}
          onPick={(x) => { setSess(addExercise(s, toPlan(x, 3, 10, null, null), seedOf)); setSheet(null); }} />
      )}
      {sheet === 'finish' && (
        <Sheet title="Finish workout" onClose={() => setSheet(null)}>
          {!everything && <div className="muted">{setsPlanned(s) - setsDone(s)} sets are not done. They will be marked Skipped and left out of efficiency.</div>}
          <button className="btn primary" onClick={finish}>Finish workout</button>
          <button className="btn" onClick={() => setSheet(null)}>Keep going</button>
        </Sheet>
      )}
    </main>
  );
}

const displayNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, ''));

// ------------------------------------------------------------------ the dial
function DialView({ fill, red, rest }: { fill: number; red: boolean; rest: number }) {
  const c = 2 * Math.PI * 55;
  const y = 60 + 44 - 88 * fill;
  return (
    <svg className="dial" width="120" height="120" viewBox="0 0 120 120" role="img" aria-label="Ring shows rest left. Fill shows exercise time left.">
      <defs><clipPath id="dial-clip"><circle cx="60" cy="60" r="44" /></clipPath></defs>
      <circle cx="60" cy="60" r="44" className="dial-back" />
      <rect x="16" y={y} width="88" height={88 * fill} clipPath="url(#dial-clip)" className={red ? 'dial-red' : 'dial-fill'} />
      <circle cx="60" cy="60" r="55" className="dial-track" />
      {rest > 0 && <circle cx="60" cy="60" r="55" className="dial-rest" strokeDasharray={`${(c * Math.min(1, rest)).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 60 60)" />}
    </svg>
  );
}

// ------------------------------------------------------------------ set list
/** The plan's target for a set not yet logged: reps, and the planned weight if the plan sets one. */
function targetText(e: Session['exercises'][string], unit: WeightUnit | 'bw'): string {
  const w = e.plannedWeightLb;
  if (unit === 'bw' || w === null) return `Target ${e.plannedReps} reps`;
  return `Target ${displayNum(fromPounds(w, unit))} ${unit} × ${e.plannedReps}`;
}

function SetList({ s, e, unit, round, onToggle, onDetail }: { s: Session; e: Session['exercises'][string]; unit: WeightUnit | 'bw'; round: number; onToggle: (r: number) => void; onDetail: (r: number) => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const long = useRef(false);
  void s;
  return (
    <div className="sets" role="list">
      {e.types.map((type, n) => {
        const lg = e.logs[n];
        const state = lg ? 'Done' : n === round ? 'Now' : 'Planned';
        const label = type === 'warm_up' ? 'Warm-up' : type === 'drop' ? 'Drop set' : state;
        return (
          <button
            key={n} role="listitem" className={`set ${lg ? 'done' : n === round ? 'now' : ''}`}
            onPointerDown={() => { long.current = false; timer.current = setTimeout(() => { long.current = true; onDetail(n); }, 500); }}
            onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
            onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
            onClick={() => { if (!long.current) onToggle(n); }}
          >
            <span>{n + 1} · {label}{lg?.records.length ? <span className="badge">{RECORD_LABEL[celebrationName(lg.records) as RecordType]}</span> : null}{lg?.rpe ? <span className="muted"> · RPE {lg.rpe}</span> : null}</span>
            <span>{!lg ? targetText(e, unit) : `${lg.enteredUnit === 'bw' ? '1 BW' : `${displayNum(unit === 'bw' ? 0 : displayWeight({ lb: lg.lb ?? 0, enteredValue: lg.enteredValue, enteredUnit: lg.enteredUnit as WeightUnit }, unit))} ${unit}`} × ${lg.reps}`}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ entry
function Entry({ e, round, unit, disabled, mainLabel, onUnit, onMain, undo }: {
  e: Session['exercises'][string]; round: number; unit: WeightUnit | 'bw'; disabled: boolean; mainLabel: string;
  onUnit: (u: WeightUnit) => void;
  onMain: (entry: { lb: number | null; enteredValue: number; enteredUnit: 'lb' | 'kg' | 'bw'; reps: number } | null) => void;
  undo: (() => void) | null;
}) {
  const seedLb = e.plannedWeightLb ?? e.seeds[round] ?? null;
  const [orig, setOrig] = useState<StoredWeight | null>(seedLb === null ? null : { lb: seedLb, enteredValue: seedLb, enteredUnit: 'lb' });
  const [untouched, setUntouched] = useState(true);
  const [box, setBox] = useState<string>(orig && unit !== 'bw' ? displayNum(displayWeight(orig, unit)) : '');
  const [reps, setReps] = useState(String(e.plannedReps));
  const num = Number(box);
  const weightOk = unit === 'bw' || (box.trim() !== '' && Number.isFinite(num) && num >= 0);
  const repsNum = Math.round(Number(reps));
  const repsOk = Number.isFinite(repsNum) && repsNum >= 1;

  function switchUnit(u: WeightUnit) {
    if (unit === 'bw' || u === unit) return;
    let cur = orig;
    if (weightOk && box.trim() !== '') cur = weightToStore(num, unit, untouched ? orig : null);
    setOrig(cur); setUntouched(true);
    setBox(cur ? displayNum(displayWeight(cur, u)) : '');
    onUnit(u);
  }

  function entry() {
    if (unit === 'bw') return { lb: null, enteredValue: 1, enteredUnit: 'bw' as const, reps: repsNum };
    const w = weightToStore(num, unit, untouched ? orig : null);
    return { lb: w.lb, enteredValue: w.enteredValue, enteredUnit: w.enteredUnit, reps: repsNum };
  }

  const logging = mainLabel === 'Log set';
  return (
    <div className="entry">
      <div className="entry-col">
        <div className="row spread">
          <span className="lab">{e.assisted ? 'Assistance' : 'Weight'}</span>
          {unit !== 'bw' && (
            <span className="row tight">
              <button className={`btn small ${unit === 'lb' ? 'selected' : ''}`} onClick={() => switchUnit('lb')}>lb</button>
              <button className={`btn small ${unit === 'kg' ? 'selected' : ''}`} onClick={() => switchUnit('kg')}>kg</button>
            </span>
          )}
        </div>
        <div className="row tight">
          <button className="btn step" disabled={unit === 'bw'} aria-label={`Subtract 5 ${unit}`} onClick={() => { setUntouched(false); setBox(displayNum(stepWeight(num || 0, -1))); }}>−5</button>
          <input
            className="num" inputMode="decimal" aria-label={unit === 'bw' ? 'Bodyweight' : `Weight in ${unit}`} disabled={unit === 'bw'}
            value={unit === 'bw' ? '1 BW' : box}
            onFocus={() => { if (untouched && unit !== 'bw') setBox(''); }}
            onBlur={() => { if (box.trim() === '' && orig && unit !== 'bw') { setUntouched(true); setBox(displayNum(displayWeight(orig, unit))); } }}
            onChange={(ev) => { setUntouched(false); setBox(ev.target.value.replace(/[^0-9.]/g, '')); }}
          />
          <button className="btn step" disabled={unit === 'bw'} aria-label={`Add 5 ${unit}`} onClick={() => { setUntouched(false); setBox(displayNum(stepWeight(num || 0, 1))); }}>+5</button>
        </div>
      </div>
      <div className="entry-col">
        <div className="row spread"><span className="lab">Reps</span></div>
        <div className="row tight">
          <button className="btn step" aria-label="Subtract 1 rep" onClick={() => setReps(String(stepReps(repsNum || 1, -1)))}>−1</button>
          <input className="num" inputMode="numeric" aria-label="Reps" value={reps} onChange={(ev) => setReps(ev.target.value.replace(/[^0-9]/g, ''))} />
          <button className="btn step" aria-label="Add 1 rep" onClick={() => setReps(String(stepReps(repsNum || 1, 1)))}>+1</button>
        </div>
      </div>
      <button
        className="btn primary main" id="log-btn"
        disabled={logging ? !(weightOk && repsOk) : disabled && mainLabel === 'Log set'}
        onClick={() => onMain(logging ? entry() : null)}
      >{mainLabel}</button>
      {undo && <button className="btn small" onClick={undo}>Undo last set</button>}
    </div>
  );
}

// ------------------------------------------------------------------ tray
function Tray({ s, now, libById, onClose, onGo, onSkip, onMove, onBreak, onUndoBreak, onAdd, onFinish }: {
  s: Session; now: number; libById: Map<string, LibExercise>; onClose: () => void;
  onGo: (blockId: string, key: string) => void; onSkip: (blockId: string) => void; onMove: (blockId: string, d: -1 | 1) => void;
  onBreak: (blockId: string) => void; onUndoBreak: () => void; onAdd: () => void; onFinish: () => void;
}) {
  void libById;
  const live = liveBlocks(s);
  const sd = setsDone(s);
  const sp = setsPlanned(s);
  const exDone = live.filter((b) => blockSkipped(s, b) || blockDone(s, b)).length;
  return (
    <div className="tray" role="dialog" aria-label="Full workout">
      <div className="row spread"><span className="display big">{s.name}</span><span className="display clock-text">{mmss(readClock(s.clock, now))}</span></div>
      <div>
        <div className="row spread lab"><span>{sd} of {sp} sets done</span><span>{exDone} of {live.length} exercises</span></div>
        <div className="bar"><div className="bar-fill" style={{ width: `${sp ? Math.round((sd / sp) * 100) : 0}%` }} /></div>
      </div>
      <div className="tray-list">
        {live.map((b, i) => (
          <div key={b.id} className={`tray-block ${b.id === s.curBlock ? 'current' : ''}`}>
            {b.members.map((k) => {
              const x = s.exercises[k];
              const state = x.skipped ? 'Skipped' : x.logs.length >= x.types.length ? 'Done' : b.id === s.curBlock && k === s.curMember ? 'Now' : '';
              return (
                <button key={k} className="btn opt" onClick={() => onGo(b.id, k)}>
                  <span className="row spread full">
                    <span>{b.letter && <span className="lab accent-text">{b.letter}{b.members.indexOf(k) + 1} </span>}{x.name}</span>
                    <span className="lab">{state}</span>
                  </span>
                  <span className="row tight">
                    {x.types.map((t, n) => <span key={n} className={`box ${x.logs[n] ? 'on' : ''} ${t === 'warm_up' ? 'warm' : ''}`} />)}
                    <span className="muted">{x.logs.length ? x.logs.map((l) => `${l.enteredUnit === 'bw' ? 'BW' : l.enteredValue}×${l.reps}`).join('  ') : `${x.plannedReps} reps planned`}</span>
                  </span>
                </button>
              );
            })}
            <div className="row tight">
              <button className="btn small" disabled={i === 0} onClick={() => onMove(b.id, -1)} aria-label="Move up">↑</button>
              <button className="btn small" disabled={i === live.length - 1} onClick={() => onMove(b.id, 1)} aria-label="Move down">↓</button>
              {!blockDone(s, b) && !blockSkipped(s, b) && <button className="btn small" onClick={() => onSkip(b.id)}>Skip</button>}
              {b.members.length > 1 && canBreak(s, b) && <button className="btn small" onClick={() => onBreak(b.id)}>Break superset</button>}
            </div>
          </div>
        ))}
      </div>
      {s.breakUndo && <button className="btn" onClick={onUndoBreak}>Undo break</button>}
      <div className="muted">Tap an exercise to jump to it. Rows sharing a letter are a superset.</div>
      <div className="row"><button className="btn grow" onClick={onAdd}>Add exercise</button><button className="btn grow" onClick={onFinish}>Finish workout</button></div>
      <button className="btn" onClick={onClose}>Close</button>
    </div>
  );
}

// ------------------------------------------------------------------ sheets
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-card">
        <div className="display big">{title}</div>
        {children}
        <button className="btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

function DetailSheet({ s, e, round, onClose, onSave }: { s: Session; e: Session['exercises'][string]; round: number; onClose: () => void; onSave: (t: SetType, rpe: number | null) => void }) {
  void s;
  const [type, setType] = useState<SetType>(e.types[round] ?? 'working');
  const [rpe, setRpe] = useState<number | null>(e.logs[round]?.rpe ?? null);
  return (
    <Sheet title={`Set ${round + 1} details`} onClose={onClose}>
      <div className="lab">Type</div>
      <div className="row">
        {(['warm_up', 'working', 'drop'] as SetType[]).map((t) => (
          <button key={t} className={`btn grow ${type === t ? 'selected' : ''}`} onClick={() => setType(t)}>{t === 'warm_up' ? 'Warm-up' : t === 'drop' ? 'Drop set' : 'Working'}</button>
        ))}
      </div>
      <div className="lab">Effort (RPE, 1 to 10, optional)</div>
      <div className="row">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} className={`btn step ${rpe === n ? 'selected' : ''}`} onClick={() => setRpe(rpe === n ? null : n)}>{n}</button>
        ))}
      </div>
      <button className="btn primary" onClick={() => onSave(type, rpe)}>Save</button>
    </Sheet>
  );
}

function AddSheet({ exercises, onClose, onPick }: { exercises: LibExercise[]; onClose: () => void; onPick: (e: LibExercise) => void }) {
  const [q, setQ] = useState('');
  const list = exercises.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  return (
    <Sheet title="Add exercise" onClose={onClose}>
      <input type="text" placeholder="Search your library" aria-label="Search your library" value={q} onChange={(ev) => setQ(ev.target.value)} />
      <div className="pick-list">{list.map((x) => <button key={x.id} className="btn opt" onClick={() => onPick(x)}>{x.name}<span className="muted">{[x.muscle, x.equipment].filter(Boolean).join(' · ')}</span></button>)}</div>
    </Sheet>
  );
}

// ------------------------------------------------------------------ stats and graph
function StatsBody({ s, e, unit, history, now, records }: { s: Session; e: Session['exercises'][string]; unit: WeightUnit | 'bw'; history: History; now: number; records: ReturnType<typeof currentRecords> }) {
  const eff = efficiencyOf(s, now);
  const vol = volumeOf(s);
  const kind = kindOf(e);
  const facts = [...pastFacts(history, e.exerciseId), ...factsFor(e, s.day)];
  const e1 = estimatedOneRepMax(facts, kind);
  const show = (lb: number | null) => (lb === null ? '1 BW' : `${displayNum(unit === 'bw' ? lb : fromPounds(lb, unit))} ${unit === 'bw' ? '' : unit}`);
  const rows: [RecordType, string][] = kind.unit === 'bw' ? [['most_reps', 'Most reps in a set']] : [['heaviest', 'Heaviest single set'], ['6_plus', 'Best 6+ rep set'], ['10_plus', 'Best 10+ rep set'], ['20_plus', 'Best 20+ rep set']];
  return (
    <>
      <div className="lab accent-text">This workout</div>
      <div className="grid3">
        <div><span className="lab">Elapsed</span><b>{mmss(readClock(s.clock, now))}</b></div>
        <div><span className="lab">Efficiency</span><b>{eff === null ? 'n/a' : `${eff}%`}</b></div>
        <div><span className="lab">Volume</span><b>{Math.round(vol.lb).toLocaleString()} lb{vol.bw ? ` · ${vol.bw} BW` : ''}</b></div>
        <div><span className="lab">Sets done</span><b>{setsDone(s)} of {setsPlanned(s)}</b></div>
        <div><span className="lab">Records today</span><b>{recordsToday(s)}</b></div>
      </div>
      <div className="muted">Efficiency = time allocated for the sets done ÷ time actually spent. Above 100% is ahead of budget.</div>
      <div className="lab accent-text topline">{e.name}</div>
      <Graph e={e} unit={unit} history={history} s={s} />
      <div className="row spread"><span className="muted">Estimated one-rep max</span><b>{e1 === null ? 'n/a' : show(Math.round(e1 * 10) / 10)}</b></div>
      {rows.map(([t, label]) => {
        const r = records[t];
        return <div key={t} className="row spread small-text"><span className="muted">{label}</span><b>{r ? `${show(r.lb)} × ${r.reps} · ${r.day}` : '—'}</b></div>;
      })}
    </>
  );
}

function Graph({ e, unit, history, s }: { e: Session['exercises'][string]; unit: WeightUnit | 'bw'; history: History; s: Session }) {
  const kind = kindOf(e);
  const sessions = [...(history[e.exerciseId] ?? []).slice(-5).map((p) => ({ label: p.day.slice(5), sets: p.sets })),
    ...(e.logs.length ? [{ label: 'Today', sets: e.logs.map((l) => ({ lb: l.lb, reps: l.reps, type: l.type })) }] : [])];
  void s;
  if (!sessions.length) return <div className="muted">No history yet. Log a set to start the graph.</div>;
  const bw = unit === 'bw';
  const h = (lb: number | null) => (unit === 'bw' || lb === null ? 1 : fromPounds(lb, unit));
  const maxBar = Math.max(...sessions.flatMap((x) => x.sets.map((y) => h(y.lb))), 1);
  const vols = sessions.map((x) => x.sets.reduce((a, y) => a + setVolume({ id: '', lb: y.lb, reps: y.reps, type: y.type, day: '', order: 0 }, kind), 0));
  const maxVol = Math.max(...vols, 1);
  const W = 340, H = 150, x0 = 28, x1 = W - 34, y0 = 12, y1 = H - 6, cw = (x1 - x0) / sessions.length;
  const pts: string[] = [];
  const bars = sessions.map((x, i) => {
    const n = x.sets.length;
    const bwid = Math.min(14, (cw - 8) / n);
    const sx = x0 + cw * i + cw / 2 - (n * bwid) / 2;
    pts.push(`${(x0 + cw * i + cw / 2).toFixed(1)},${(y1 - (vols[i] / maxVol) * (y1 - y0)).toFixed(1)}`);
    return (
      <g key={i}>
        {x.sets.map((y, j) => {
          const ht = bw ? y1 - y0 - 14 : (h(y.lb) / maxBar) * (y1 - y0 - 14);
          return (
            <g key={j}>
              <rect x={sx + j * bwid} y={y1 - ht} width={bwid - 1} height={ht} className="g-bar" />
              <text x={sx + j * bwid + (bwid - 1) / 2} y={y1 - ht - 2} textAnchor="middle" className="g-num">{y.reps}</text>
            </g>
          );
        })}
        <text x={x0 + cw * i + cw / 2} y={H + 10} textAnchor="middle" className="g-label">{x.label}</text>
      </g>
    );
  });
  const fmt = (n: number) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-label="One bar per set by session. The line is session volume." className="graph">
        <line x1={x0} y1={y1} x2={x1} y2={y1} className="g-axis" />
        {bars}
        <polyline points={pts.join(' ')} className="g-line" />
        <text x={x1 + 4} y={y0 + 4} className="g-line-text">{fmt(maxVol)}</text>
        <text x={x0 - 4} y={y0 + 4} textAnchor="end" className="g-label">{bw ? '1 BW' : fmt(maxBar)}</text>
      </svg>
      <div className="muted">Each bar is one set: height is {bw ? 'the same for every set (1 BW)' : `weight in ${unit}`}, the number above is reps. The line is session {bw ? 'total reps' : 'volume'}.</div>
    </>
  );
}

// ------------------------------------------------------------------ start and finish
function StartScreen({ exercises, workouts, libById, summary, history, now, onDismiss, onStart }: {
  exercises: LibExercise[]; workouts: LibWorkout[]; libById: Map<string, LibExercise>;
  summary: Session | null; history: History; now: number; onDismiss: () => void; onStart: (name: string, plan: PlanItem[]) => void;
}) {
  const [picked, setPicked] = useState<LibExercise[]>([]);
  const [q, setQ] = useState('');
  const list = q.trim() ? exercises.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];
  void history;

  if (summary) {
    const eff = efficiencyOf(summary, now);
    const vol = volumeOf(summary);
    const recs = Object.values(summary.exercises).flatMap((x) => x.logs.filter((l) => l.records.length).map((l) => `${x.name}: ${RECORD_LABEL[celebrationName(l.records) as RecordType]}`));
    const total = summary.endedAt ? readClock(summary.clock, summary.endedAt) : 0;
    return (
      <main className="phone" data-skin="liquid">
        <div className="lab">Workout complete</div>
        <h1 className="ex-name">{summary.name}</h1>
        <div className="grid3">
          <div><span className="lab">Time</span><b>{mmss(total)}</b></div>
          <div><span className="lab">Efficiency</span><b>{eff === null ? 'n/a' : `${eff}%`}</b></div>
          <div><span className="lab">Volume</span><b>{Math.round(vol.lb).toLocaleString()} lb{vol.bw ? ` · ${vol.bw} BW` : ''}</b></div>
        </div>
        <div className="lab">Records</div>
        {recs.length ? recs.map((r) => <div key={r}>{r}</div>) : <div className="muted">None today</div>}
        <div className="muted">Saved on this phone. Saving to your account comes with the next step of the build.</div>
        <button className="btn primary" onClick={onDismiss}>Done</button>
      </main>
    );
  }

  return (
    <main className="phone">
      <div className="phone-top"><Link className="btn icon" href="/app" aria-label="Back to the home screen">‹</Link></div>
      <h1>Start a workout</h1>
      {workouts.length > 0 && (
        <>
          <h2>Your workouts</h2>
          {workouts.map((w) => (
            <button key={w.id} className="btn opt" onClick={() => onStart(w.name, w.items.flatMap((i) => { const x = libById.get(i.exerciseId); return x ? [toPlan(x, i.sets, i.reps, i.rest, i.superset)] : []; }))}>
              {w.name}<span className="muted">{w.items.length} exercises</span>
            </button>
          ))}
        </>
      )}
      <h2>Quick workout</h2>
      <div className="muted">Pick exercises from your library. Each starts at 3 sets of 10, and you can change that in the planner later.</div>
      <input type="text" placeholder="Search your library" aria-label="Search your library" value={q} onChange={(ev) => setQ(ev.target.value)} />
      <div className="pick-list">
        {list.map((x) => (
          <button key={x.id} className="btn opt" disabled={picked.some((p) => p.id === x.id)} onClick={() => { setPicked([...picked, x]); setQ(''); }}>
            {x.name}<span className="muted">{[x.muscle, x.equipment].filter(Boolean).join(' · ')}</span>
          </button>
        ))}
      </div>
      {picked.map((x, i) => (
        <div key={x.id} className="row spread panel">
          <span>{i + 1}. {x.name}</span>
          <button className="btn small" onClick={() => setPicked(picked.filter((p) => p.id !== x.id))}>Remove</button>
        </div>
      ))}
      <button className="btn primary" disabled={!picked.length} onClick={() => onStart('Quick workout', picked.map((x) => toPlan(x, 3, 10, null, null)))}>Start workout</button>
    </main>
  );
}
