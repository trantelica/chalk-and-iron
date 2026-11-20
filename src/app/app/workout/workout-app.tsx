'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { trainingDay } from '@/rules/days';
import { displayWeight, fromPounds, stepReps, stepWeight, weightToStore, type StoredWeight, type WeightUnit } from '@/rules/units';
import {
  addExercise, addRest, allDone, autoFinishIfIdle, blockBudget, blockDone, blockOf, blockSkipped, breakSuperset, canBreak, canReopen,
  deleteSet, editSet, efficiencyOf, factsFor, finishSession, goTo, kindOf, liveBlocks, logSet, moveBlock, pastFacts, realSessions,
  recordsToday, reopenSession, setDetails, setsDone, setsPlanned, skipBlock, skipRest, startExercise, startSession, swapExercise,
  toggleSet, toHistory, undoBreak, volumeOf, lastLoggedSetUndo,
  addSetToBlock, removeSetFromBlock, canDeleteSet, blockOfKey, setBlockRest, blockRest, canRemoveSet, isPaused, pauseSession, resumeSession,
  type History, type LogInput, type PlanItem, type Session,
} from '@/rules/session';
import {
  applyServerRecords, finishOtherChange, mergeHistory, noteChange, pendingChoices, restChange, sessionChanges, unitChange,
  type LibraryFacts,
} from '@/rules/sync';
import type { OutboxStatus } from '@/lib/outbox';
import {
  activeOnServer, fetchHistory, forgetOldPhoneOnlyData, keyFor, loadServerSession, outboxFor, pushSupported, readStore,
  registerServiceWorker, turnOnRestAlerts, writeStore, type ActiveElsewhere,
} from '@/lib/phone-store';
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

const TIER: Record<string, string> = { bodyweight: 'Bodyweight', basic_gym: 'Basic gym', full_gym: 'Full gym' };

function toPlan(e: LibExercise, sets: number, reps: number, rest: number | null, superset: string | null): PlanItem {
  return {
    exerciseId: e.id, name: e.name, muscle: e.muscle, equipment: e.equipment, unit: e.unit, assisted: e.assisted, loadCount: e.loadCount,
    work: e.work, rest: rest ?? e.rest, sets, reps, superset, alternates: e.alternates,
  };
}

/** "Rest over" on screen within this many seconds of the end; later than that, the app was away and stays quiet. */
const LATE_REST_SECONDS = 5;
/** With the app on screen, the server's alert is cancelled this long before the end (design Section 7). */
const CANCEL_ALERT_MS = 2500;
const LAST = 'last' as const;

export function WorkoutApp({ userId, exercises, workouts, timeZone, serverUnits }: {
  userId: string; exercises: LibExercise[]; workouts: LibWorkout[]; today: string; timeZone: string; serverUnits: Record<string, WeightUnit>;
}) {
  const [ready, setReady] = useState(false);
  const [sess, setSessState] = useState<Session | null>(null);
  const sessRef = useRef<Session | null>(null);
  const [lastDone, setLastDone] = useState<Session | null>(null);
  const [serverHistory, setServerHistory] = useState<History>({});
  const [localHistory, setLocalHistory] = useState<History>({});
  const [units, setUnits] = useState<Record<string, WeightUnit>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [sync, setSync] = useState<OutboxStatus>({ state: 'saved' });
  const [rejectedCount, setRejectedCount] = useState(0);
  const [other, setOther] = useState<null | { found: ActiveElsewhere; start: () => void }>(null);
  const [alertsMsg, setAlertsMsg] = useState('');
  const [alertsOn, setAlertsOn] = useState(true);
  const box = useMemo(() => outboxFor(userId), [userId]);
  const K = useCallback((w: Parameters<typeof keyFor>[1]) => keyFor(userId, w), [userId]);
  const alertCancelledFor = useRef<number | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tray, setTray] = useState(false);
  const [sheet, setSheet] = useState<null | 'stats' | 'swap' | 'detail' | 'add' | 'finish' | 'summary'>(null);
  const [detailRound, setDetailRound] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [banner, setBanner] = useState('');
  const [typing, setTyping] = useState(false); // a weight or reps box has the keyboard (Nathan, 19 Nov)
  // While typing, the screen is short. An iPhone has already scrolled down to
  // show the box, which would leave empty space above it (Nathan, 19 Nov), so
  // the page is held at the top while the keyboard is up.
  useEffect(() => {
    if (!typing) return;
    const top = () => { if (window.scrollY !== 0) window.scrollTo(0, 0); };
    const timers = [0, 60, 200, 400, 700].map((ms) => setTimeout(top, ms));
    const vv = window.visualViewport;
    vv?.addEventListener('resize', top);
    vv?.addEventListener('scroll', top);
    window.addEventListener('scroll', top);
    return () => {
      timers.forEach(clearTimeout);
      vv?.removeEventListener('resize', top);
      vv?.removeEventListener('scroll', top);
      window.removeEventListener('scroll', top);
    };
  }, [typing]);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undo, setUndo] = useState<string | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<WakeLockSentinel | null>(null);
  const libById = useMemo(() => new Map(exercises.map((e) => [e.id, e])), [exercises]);
  const libFacts = useCallback((id: string): LibraryFacts | undefined => {
    const x = libById.get(id);
    return x && { name: x.name, muscle: x.muscle, equipment: x.equipment, unit: x.unit, assisted: x.assisted, loadCount: x.loadCount, alternates: x.alternates };
  }, [libById]);

  /**
   * Every change to the running workout goes through here. It is written to
   * the phone's storage and to the outbox in one step, shown at once, and sent
   * when there is a connection. The screen never waits for the network.
   */
  const commit = useCallback((next0: Session | null, opts: { activity?: boolean; send?: boolean } = {}) => {
    const prev = sessRef.current;
    let next = next0;
    if (next && next.endedAt === null && opts.activity !== false) next = { ...next, lastActivityAt: Date.now() };
    if (next && opts.send !== false) box.add(sessionChanges(prev && prev.id === next.id ? prev : null, next));
    sessRef.current = next;
    writeStore(keyFor(userId, 'session'), next);
    setSessState(next);
    void box.flush();
  }, [box, userId]);

  const refreshHistory = useCallback((activeId: string | null) => {
    fetchHistory(activeId).then((h) => {
      setServerHistory(h);
      writeStore(keyFor(userId, 'memory'), h);
      // Sessions finished here that the account now has are dropped from the phone's own list.
      setLocalHistory((lh) => {
        const out: History = {};
        for (const [ex, list] of Object.entries(lh)) {
          const known = new Set((h[ex] ?? []).map((p) => p.sessionId));
          const keep = list.filter((p) => !known.has(p.sessionId)).slice(-10);
          if (keep.length) out[ex] = keep;
        }
        writeStore(keyFor(userId, 'history'), out);
        return out;
      });
    }).catch(() => { /* offline: the phone's copy stands */ });
  }, [userId]);

  useEffect(() => {
    forgetOldPhoneOnlyData();
    registerServiceWorker();
    let s = readStore<Session | null>(K('session'), null);
    // The 30-minute auto-finish, on the next open (design Section 7).
    if (s) {
      const f = autoFinishIfIdle(s, Date.now());
      if (f !== s) { box.add(sessionChanges(s, f)); s = f; writeStore(K('session'), s); }
    }
    sessRef.current = s;
    setSessState(s);
    setLastDone(readStore<Session | null>(K(LAST), null));
    setServerHistory(readStore<History>(K('memory'), {}));
    setLocalHistory(readStore<History>(K('history'), {}));
    const pending = pendingChoices(box.entries);
    const u = { ...readStore<Record<string, WeightUnit>>(K('units'), {}), ...serverUnits, ...pending.units };
    writeStore(K('units'), u);
    setUnits(u);
    setNotes(pending.notes);
    setSync({ ...box.status });
    setRejectedCount(box.rejected.length);
    setReady(true);
    void box.flush();
    refreshHistory(s && s.endedAt === null ? s.id : null);
    setAlertsOn(!pushSupported() || (Notification.permission === 'granted' && !!readStore(K('push'), '')));
    turnOnRestAlerts(userId, true).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sending: on app open (above), after each change (commit), on reconnect, on
  // return to the screen, and every 20 seconds while something waits.
  useEffect(() => {
    const offStatus = box.onChange((o) => { setSync({ ...o.status }); setRejectedCount(o.rejected.length); });
    const offAnswer = box.onAnswer((a) => {
      const cur = sessRef.current;
      if (!cur) return;
      const t = applyServerRecords(cur, a.records); // the server's records win
      if (t !== cur) { sessRef.current = t; writeStore(keyFor(userId, 'session'), t); setSessState(t); }
    });
    const kick = () => { if (document.visibilityState === 'visible') void box.flush(); };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', kick);
    const iv = setInterval(() => { if (box.count && box.status.state !== 'conflict') void box.flush(); }, 20000);
    return () => { offStatus(); offAnswer(); window.removeEventListener('online', kick); document.removeEventListener('visibilitychange', kick); clearInterval(iv); };
  }, [box, userId]);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);

  const active = sess && sess.endedAt === null ? sess : null;
  const activeId = active?.id ?? null;
  const history = useMemo(() => mergeHistory(serverHistory, localHistory, activeId), [serverHistory, localHistory, activeId]);

  // The 30-minute auto-finish while the app stays open.
  useEffect(() => {
    const t = setInterval(() => {
      const cur = sessRef.current;
      if (!cur || cur.endedAt !== null) return;
      const f = autoFinishIfIdle(cur, Date.now());
      if (f !== cur) commit(f, { activity: false });
    }, 30000);
    return () => clearInterval(t);
  }, [commit]);

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
      const last = realSessions(history, id).at(-1);
      return seedWeights(last ? last.sets.map((x) => x.lb) : [], sets, assisted);
    },
    [history],
  );

  const flash = (text: string) => { setBanner(text); setTimeout(() => setBanner((b) => (b === text ? '' : b)), 4000); };

  // With the app on screen, the server's alert is cancelled just before the
  // end, so the banner and sound arrive and not a notification as well. If the
  // app then leaves the screen before the end, the alert is asked for again.
  useEffect(() => {
    if (!active || active.restEndsAt === null) return;
    const left = active.restEndsAt - now;
    if (left > 0 && left <= CANCEL_ALERT_MS && document.visibilityState === 'visible' && alertCancelledFor.current !== active.restEndsAt) {
      alertCancelledFor.current = active.restEndsAt;
      box.add([restChange(active.id, null)]);
      void box.flush();
    }
  }, [now, active, box]);
  useEffect(() => {
    const away = () => {
      const cur = sessRef.current;
      if (document.visibilityState !== 'hidden' || !cur || cur.endedAt !== null || cur.restEndsAt === null) return;
      if (alertCancelledFor.current === cur.restEndsAt && cur.restEndsAt > Date.now()) {
        alertCancelledFor.current = null;
        box.add([restChange(cur.id, cur.restEndsAt)]);
        void box.flush();
      }
    };
    document.addEventListener('visibilitychange', away);
    return () => document.removeEventListener('visibilitychange', away);
  }, [box]);

  // Rest end with the app on screen: a banner and a short sound that mixes with music and follows silent mode.
  useEffect(() => {
    if (!active || active.restEndsAt === null || now < active.restEndsAt) return;
    const late = (now - active.restEndsAt) / 1000 > LATE_REST_SECONDS;
    commit(skipRest(active), { activity: false });
    if (late) return; // the app was away; the notification already said so
    flash('Rest over. Time for your next set.');
    try {
      const ctx = audio.current;
      if (ctx && ctx.state === 'running') {
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.frequency.value = 880; g.gain.value = 0.2; o.connect(g).connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
      }
    } catch { /* no sound */ }
  }, [now, active, commit]);

  function unlockSound() {
    try {
      const sessionApi = (navigator as { audioSession?: { type: string } }).audioSession;
      if (sessionApi) sessionApi.type = 'ambient'; // mixes with music, follows silent mode
      if (!audio.current) audio.current = new AudioContext();
      if (audio.current.state !== 'running') void audio.current.resume();
    } catch { /* no sound */ }
  }

  // ---------------------------------------------------------------- starting
  async function begin(name: string, plan: PlanItem[], workoutId: string | null = null) {
    if (!plan.length) return;
    const start = () => {
      const t = Date.now();
      commit(startSession(name, trainingDay(new Date(t), timeZone), plan, history, t, seedOf, workoutId));
      setSheet(null); setTray(false); setOther(null);
    };
    // Only one workout can run at a time, on any device (decided 17 Nov, question 30).
    try {
      const found = navigator.onLine ? await activeOnServer() : null;
      // This phone's own last workout, whose finish has not reached the account yet, does not count.
      const ours = found && (found.id === sessRef.current?.id || found.id === lastDone?.id || box.entries.some((c) => c.key === `session:${found.id}`));
      if (found && !ours) { setOther({ found, start }); return; }
    } catch { /* no connection: start now; the account is asked when the phone is back online */ }
    start();
  }

  async function carryOnHere(id: string) {
    try {
      const s = await loadServerSession(id, libFacts);
      sessRef.current = s; // the account's own copy: nothing to send
      writeStore(K('session'), s);
      setSessState(s);
      setOther(null);
      refreshHistory(s.id);
      flash(`Carrying on with ${s.name}.`);
    } catch {
      flash('Could not open that workout. Check the connection and try again.');
    }
  }

  function dismissSummary() {
    const cur = sessRef.current;
    if (cur && cur.endedAt !== null) { writeStore(K(LAST), cur); setLastDone(cur); }
    commit(null, { send: false });
    setSheet(null);
  }

  function reopen(s0: Session) {
    commit(reopenSession(s0, Date.now()));
    setSheet(null);
    refreshHistory(s0.id);
  }

  async function allowAlerts() {
    setAlertsMsg('Asking…');
    try {
      const msg = await turnOnRestAlerts(userId);
      setAlertsMsg(msg);
      setAlertsOn(msg === 'Rest alerts are on for this phone.');
    } catch (err) {
      setAlertsMsg((err as Error).message);
    }
  }

  const conflictSheet = sync.state === 'conflict' ? (
    <Sheet title="Another workout is running" onClose={() => { box.clearConflict(); }}>
      <div>{sync.conflict.workout_name}, started {when(sync.conflict.started_at)}, is still running in your account, perhaps on another device. Only one workout can run at a time.</div>
      <div className="muted">Every set on this phone is kept, whichever you choose.</div>
      <button className="btn primary" onClick={() => { box.addFirst(finishOtherChange(sync.conflict.session_id)); box.clearConflict(); void box.flush(); }}>Finish that one, keep this one</button>
      {sessRef.current && sessRef.current.endedAt === null && (
        <button className="btn" onClick={() => {
          const id = sync.conflict.session_id;
          commit(finishSession(sessRef.current!, Date.now()));
          box.clearConflict();
          void box.flush().then(() => carryOnHere(id));
        }}>Finish this one, carry on with that one here</button>
      )}
    </Sheet>
  ) : null;

  const syncLine = <SyncLine sync={sync} rejected={rejectedCount} />;

  if (!ready) return <main className="phone"><div className="muted">Opening…</div></main>;

  if (!active) {
    return (
      <>
        <StartScreen
          exercises={exercises} workouts={workouts} libById={libById}
          summary={sess && sess.endedAt !== null ? sess : null} lastDone={lastDone} now={now} syncLine={syncLine}
          saved={sync.state === 'saved'}
          onDismiss={dismissSummary}
          onReopen={reopen}
          onStart={begin}
          alerts={alertsOn ? null : { msg: alertsMsg, onAllow: allowAlerts }}
        />
        {other && (
          <Sheet title="A workout is already running" onClose={() => setOther(null)}>
            <div>{other.found.workout_name}, started {when(other.found.started_at)}, is still running in your account, perhaps on another device. Only one workout can run at a time.</div>
            <button className="btn primary" onClick={() => void carryOnHere(other.found.id)}>Carry on with it here</button>
            <button className="btn" onClick={() => { box.add([finishOtherChange(other.found.id)]); other.start(); }}>Finish it, and start this one</button>
          </Sheet>
        )}
        {conflictSheet}
      </>
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
  const lastSession = realSessions(history, e.exerciseId).at(-1);
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
    if (!block.started) { commit(startExercise(s, t)); return; }
    if (done) {
      if (everything) { setSheet('finish'); return; }
      const nx = nextOpen(s);
      if (nx) commit(goTo(s, nx, t));
      return;
    }
    if (!entry) return;
    const out = logSet(s, entry, history, t);
    commit(out.session);
    setUndo(e.key);
    setTimeout(() => setUndo((u) => (u === e.key ? null : u)), 6000);
    const name = celebrationName(out.earned);
    if (name) flash(`New record: ${RECORD_LABEL[name]} on ${e.name}`);
  }

  function finish() {
    const t = Date.now();
    const fin = finishSession(s, t);
    setLocalHistory((h) => { const nh = toHistory(fin, h); writeStore(K('history'), nh); return nh; });
    commit(fin); setSheet(null); setTray(false);
    // Once the account has it, its history includes this workout.
    void box.flush().then(() => refreshHistory(null));
  }

  function saveNote(exerciseId: string, text: string, at = false) {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    const send = () => { box.add([noteChange(exerciseId, text)]); void box.flush(); };
    if (at) send(); else noteTimer.current = setTimeout(send, 1200);
  }

  function chooseUnit(exerciseId: string, u: WeightUnit) {
    const next = { ...units, [exerciseId]: u };
    setUnits(next);
    writeStore(K('units'), next);
    box.add([unitChange(exerciseId, u)]);
    void box.flush();
  }

  const phase = block.letter ? `Superset ${block.letter}${block.members.indexOf(e.key) + 1} of ${block.members.length}` : `Exercise ${pos + 1} of ${live.length}`;
  const subline = block.letter
    ? `${block.members.indexOf(e.key) === 0 ? 'Then' : 'With'} ${block.members.filter((k) => k !== e.key).map((k) => s.exercises[k].name).join(', ')}`
    : [e.muscle, e.equipment].filter(Boolean).join(' · ');

  const paused = isPaused(s);
  const typingOn = typing && !paused;
  return (
    <main
      className={`phone ${typingOn ? 'typing' : ''}`}
      onFocus={(ev) => { if ((ev.target as HTMLElement).classList?.contains('num')) { if (typingTimer.current) clearTimeout(typingTimer.current); setTyping(true); } }}
      onBlur={(ev) => {
        if (!(ev.target as HTMLElement).classList?.contains('num')) return;
        // Wait a moment, so a tap on Log set lands before the screen grows back.
        if (typingTimer.current) clearTimeout(typingTimer.current);
        typingTimer.current = setTimeout(() => setTyping(false), 300);
      }}
    >
      <div className="phone-top hide-typing">
        <Link className="btn icon" href="/app" aria-label="Back to the home screen">‹</Link>
        <button className="pull" onClick={() => setTray(true)} aria-label="Pull down the full workout">
          <span>Workout</span><span aria-hidden="true">⌄</span>
        </button>
        <Link className="btn coach" href="/app" aria-label="Coach">Coach</Link>
      </div>

      <div className="phone-head hide-typing">
        <div className="row tight">
          <button className="btn icon" disabled={pos <= 0} onClick={() => commit(goTo(s, live[pos - 1].id, Date.now()))} aria-label="Previous exercise">‹</button>
          <span className="lab">{s.name} · {pos + 1}/{live.length}</span>
          <button className="btn icon" disabled={pos >= live.length - 1} onClick={() => commit(goTo(s, live[pos + 1].id, Date.now()))} aria-label="Next exercise">›</button>
        </div>
        <div className="row tight"><span className="lab">{paused ? 'Paused' : 'Workout'}</span><span className="display clock-text">{mmss(readClock(s.clock, now))}</span></div>
      </div>
      <div className="hide-typing">{syncLine}</div>

      {/* A box in the accent color marks a superset in play (Nathan, 19 Nov). */}
      <div className={`ex-title${block.letter ? ' superset-box' : ''}`}>
        <div className="lab accent-text">{phase}</div>
        <h1 className="ex-name">{e.name}</h1>
 <div className="muted fixed-line hide-typing">{subline}</div>
        {block.members.length > 1 && canBreak(s, block) && (
          <button className="btn small hide-typing" onClick={() => commit(breakSuperset(s, block.id, Date.now()))}>Break superset</button>
        )}
        {block.brokenFrom && s.breakUndo && (
          <button className="btn small hide-typing" onClick={() => commit(undoBreak(s, Date.now()))}>Undo break</button>
        )}
      </div>

      <input
        className="note hide-typing" aria-label="Note for this exercise" placeholder="Add a note that stays with this exercise"
        value={notes[e.exerciseId] ?? libById.get(e.exerciseId)?.note ?? ''}
        onChange={(ev) => { setNotes({ ...notes, [e.exerciseId]: ev.target.value }); saveNote(e.exerciseId, ev.target.value); }}
        onBlur={(ev) => { if (notes[e.exerciseId] !== undefined) saveNote(e.exerciseId, ev.target.value, true); }}
      />

      <div className="typing-strip" aria-hidden={!typingOn}>
        <span>{!block.started ? 'Not started' : d.remaining >= 0 ? `${mmss(d.remaining)} left` : `+${mmss(-d.remaining)} over`}</span>
        {resting && <span className="rest-line on">Rest {mmss(restLeft)}</span>}
      </div>

      {paused && (
        <div className="paused-panel" role="status">
          <div className="display big">Workout paused</div>
          <div className="muted">The clocks are stopped. Paused time is not counted. A paused workout finishes itself after 2 hours.</div>
          <button className="btn primary" onClick={() => commit(resumeSession(s, Date.now()))}>Resume workout</button>
        </div>
      )}

      <div className={`dial-row hide-typing ${paused ? 'is-paused' : ''}`}>
        <DialView fill={d.fill} red={d.red} rest={resting ? restLeft / s.restTotal : 0} />
        <div className="dial-text">
          <div className="lab">Exercise clock</div>
          <div className="display clock-text">{!block.started ? 'Not started' : d.remaining >= 0 ? `${mmss(d.remaining)} left` : `+${mmss(-d.remaining)} over`}</div>
          <div className="muted">Budget {mmss(budget)}</div>
          <div className={`rest-line ${resting ? 'on' : ''}`} aria-live="off">{resting ? `Resting ${mmss(restLeft)}` : 'Not resting'}</div>
          <div className="row tight">
            <button className="btn" disabled={!resting} onClick={() => commit(addRest(s, 15))}>+0:15</button>
            <button className="btn" disabled={!resting} onClick={() => commit(skipRest(s))}>Skip rest</button>
            <button className="btn add-set" disabled={paused || blockSkipped(s, block)} onClick={() => commit(addSetToBlock(s, block.id, Date.now()))} aria-label={block.members.length > 1 ? 'Add a round to this superset' : 'Add a set'}>+ Set</button>
          </div>
        </div>
      </div>

      <SetList
        s={s} e={e} unit={unit} round={round}
        onToggle={(r) => commit(toggleSet(s, r))}
        onDetail={(r) => { setDetailRound(r); setSheet('detail'); }}
      />

      <div className="last-time muted hide-typing">
        {lastSession ? `Last time: ${lastSession.sets.map((x) => `${unit === 'bw' || x.lb === null ? '1 BW' : displayNum(fromPounds(x.lb, unit))}${unit === 'bw' ? '' : ' ' + unit} × ${x.reps}`).join(' · ')}` : 'No history yet for this exercise'}
      </div>

      {!paused && <Entry
        key={`${e.key}-${round}`}
        e={e} round={round} unit={unit}
        disabled={!block.started || done}
        mainLabel={mainLabel}
        onUnit={(u) => chooseUnit(e.exerciseId, u)}
        onMain={onMain}
        undo={undo === e.key ? () => { commit(lastLoggedSetUndo(s, e.key, history, Date.now())); setUndo(null); } : null}
      />}

      <div className="row actions hide-typing">
        <button className="btn grow" onClick={() => setSheet('swap')}>Swap</button>
        <button className="btn grow" onClick={() => setSheet('stats')}>Stats</button>
      </div>

      {banner && <div className="banner" role="status">{banner}</div>}
      {!alertsOn && pushSupported() && (
        <div className="row tight small-text hide-typing"><button className="btn small" onClick={allowAlerts}>Turn on rest alerts</button><span className="muted">{alertsMsg || 'So "Rest over" reaches you with the app in the background.'}</span></div>
      )}
      {conflictSheet}

      {tray && (
        <Tray
          s={s} now={now} libById={libById}
          onClose={() => setTray(false)}
          onGo={(id, key) => { commit(goTo(s, id, Date.now(), key)); setTray(false); }}
          onSkip={(id) => commit(skipBlock(s, id, Date.now()))}
          onMove={(id, dlt) => commit(moveBlock(s, id, dlt))}
          onBreak={(id) => commit(breakSuperset(s, id, Date.now()))}
          onUndoBreak={() => commit(undoBreak(s, Date.now()))}
          onAdd={() => setSheet('add')}
          onFinish={() => setSheet('finish')}
          onAddSet={(id) => commit(addSetToBlock(s, id, Date.now()))}
          onRemoveSet={(id) => commit(removeSetFromBlock(s, id, Date.now()))}
          onRest={(id, secs) => commit(setBlockRest(s, id, secs, Date.now()))}
          onPause={() => commit(paused ? resumeSession(s, Date.now()) : pauseSession(s, Date.now()))}
        />
      )}

      {sheet === 'stats' && (
        <Sheet title="Stats" onClose={() => setSheet(null)} closeLabel="Return to workout">
          <StatsBody s={s} e={e} unit={unit} history={history} now={now} records={records} />
        </Sheet>
      )}
      {sheet === 'swap' && (
        <Sheet title={`Swap ${e.name}`} onClose={() => setSheet(null)} closeLabel="Return to workout">
          <div className="muted">Replaces this exercise for today only. Your library workout is not changed.</div>
          {e.logs.length > 0 && <div className="muted">This exercise already has sets logged, and they stay with it. To change to another exercise now, skip this one in the tray and add the other.</div>}
          {e.alternates.length === 0 && <div className="muted">This exercise has no stored alternates yet.</div>}
          {(['bodyweight', 'basic_gym', 'full_gym'] as const).map((tier) => {
            const a = e.alternates.find((x) => x.tier === tier);
            if (!a) return null;
            const target = exercises.find((x) => x.name.toLowerCase() === a.name.toLowerCase());
            return (
              <button key={tier} className="btn opt" disabled={!target || e.logs.length > 0} onClick={() => {
                if (!target || e.logs.length > 0) return;
                commit(swapExercise(s, e.key, toPlan(target, e.types.length, e.plannedReps, null, null), seedOf));
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
        <DetailSheet s={s} e={e} round={detailRound} unit={unit} onClose={() => setSheet(null)}
          onSave={(type, rpe, edit) => {
            let next = setDetails(s, e.key, detailRound, type, rpe, history);
            if (edit) next = editSet(next, e.key, detailRound, edit, history, Date.now());
            commit(next); setSheet(null);
          }}
          onDelete={() => { commit(deleteSet(s, e.key, detailRound, history, Date.now())); setSheet(null); }} />
      )}
      {sheet === 'add' && (
        <AddSheet exercises={exercises} onClose={() => setSheet(null)}
          onPick={(x) => { commit(addExercise(s, toPlan(x, 3, 10, null, null), seedOf)); setSheet(null); }} />
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
const when = (iso: string) => new Date(iso).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });

// ------------------------------------------------------------------ saving
/** One quiet line saying whether everything has reached the account. */
function SyncLine({ sync, rejected }: { sync: OutboxStatus; rejected: number }) {
  const n = 'count' in sync ? sync.count : 0;
  const changes = `${n} change${n === 1 ? '' : 's'}`;
  const text = sync.state === 'saved' ? 'Saved to your account'
    : sync.state === 'offline' ? `Offline. ${changes} saved on this phone, sent when you're back online.`
      : sync.state === 'signed_out' ? `${changes} saved on this phone. Sign in again to send them.`
        : sync.state === 'conflict' ? 'Waiting for your choice: another workout is running.'
          : 'Saving…';
  return (
    <div className="muted sync-line" role="status" aria-live="polite">
      {text}{rejected ? ` · ${rejected} change${rejected === 1 ? '' : 's'} could not be saved` : ''}
    </div>
  );
}

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
          <div key={n} role="listitem" className={`set ${lg ? 'done' : n === round ? 'now' : ''}`}>
          <button
            className="set-main" aria-label={`Set ${n + 1}. Tap to switch warm-up. Hold or tap the dots for details.`}
            onPointerDown={() => { long.current = false; timer.current = setTimeout(() => { long.current = true; onDetail(n); }, 500); }}
            onPointerUp={() => { if (timer.current) clearTimeout(timer.current); }}
            onPointerLeave={() => { if (timer.current) clearTimeout(timer.current); }}
            onClick={() => { if (!long.current) onToggle(n); }}
          >
            <span>{n + 1} · {label}{lg?.records.length ? <span className="badge">{RECORD_LABEL[celebrationName(lg.records) as RecordType]}</span> : null}{lg?.rpe ? <span className="muted"> · RPE {lg.rpe}</span> : null}</span>
            <span>{!lg ? targetText(e, unit) : `${lg.enteredUnit === 'bw' ? '1 BW' : `${displayNum(unit === 'bw' ? 0 : displayWeight({ lb: lg.lb ?? 0, enteredValue: lg.enteredValue, enteredUnit: lg.enteredUnit as WeightUnit }, unit))} ${unit}`} × ${lg.reps}`}</span>
          </button>
          <button className="set-more" aria-label={`Set ${n + 1} details`} onClick={() => onDetail(n)}>⋯</button>
          </div>
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
function Tray({ s, now, libById, onClose, onGo, onSkip, onMove, onBreak, onUndoBreak, onAdd, onFinish, onAddSet, onRemoveSet, onRest, onPause }: {
  s: Session; now: number; libById: Map<string, LibExercise>; onClose: () => void;
  onGo: (blockId: string, key: string) => void; onSkip: (blockId: string) => void; onMove: (blockId: string, d: -1 | 1) => void;
  onBreak: (blockId: string) => void; onUndoBreak: () => void; onAdd: () => void; onFinish: () => void;
  onAddSet: (blockId: string) => void; onRemoveSet: (blockId: string) => void; onRest: (blockId: string, seconds: number) => void; onPause: () => void;
}) {
  const paused = isPaused(s);
  void libById;
  const live = liveBlocks(s);
  const sd = setsDone(s);
  const sp = setsPlanned(s);
  const exDone = live.filter((b) => blockSkipped(s, b) || blockDone(s, b)).length;
  return (
    <div className="tray" role="dialog" aria-label="Full workout">
      <div className="row spread"><span className="display big">{s.name}</span><span className="display clock-text">{paused ? 'Paused ' : ''}{mmss(readClock(s.clock, now))}</span></div>
      <button className={`btn ${paused ? 'primary' : ''}`} onClick={onPause}>{paused ? 'Resume workout' : 'Pause workout'}</button>
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
            {!blockSkipped(s, b) && (
              <div className="row spread tray-edit">
                <span className="row tight">
                  <span className="lab">{b.members.length > 1 ? 'Rounds' : 'Sets'}</span>
                  <button className="btn small" disabled={!canRemoveSet(s, b)} onClick={() => onRemoveSet(b.id)} aria-label="Remove a set">−</button>
                  <span className="tray-num">{s.exercises[b.members[0]].types.length}</span>
                  <button className="btn small" onClick={() => onAddSet(b.id)} aria-label="Add a set">+</button>
                </span>
                <span className="row tight">
                  <span className="lab">Rest</span>
                  <button className="btn small" disabled={blockRest(s, b) <= 0} onClick={() => onRest(b.id, blockRest(s, b) - 15)} aria-label="15 seconds less rest">−</button>
                  <span className="tray-num">{mmss(blockRest(s, b))}</span>
                  <button className="btn small" disabled={blockRest(s, b) >= 600} onClick={() => onRest(b.id, blockRest(s, b) + 15)} aria-label="15 seconds more rest">+</button>
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
      {s.breakUndo && <button className="btn" onClick={onUndoBreak}>Undo break</button>}
      <div className="muted">Tap an exercise to jump to it. Rows sharing a letter are a superset. Sets and rest changed here apply to today only: your library workout and plan are not changed.</div>
      <div className="row"><button className="btn grow" onClick={onAdd}>Add exercise</button><button className="btn grow" onClick={onFinish}>Finish workout</button></div>
      <button className="btn" onClick={onClose}>Return to workout</button>
    </div>
  );
}

// ------------------------------------------------------------------ sheets
function Sheet({ title, onClose, children, closeLabel = 'Close' }: { title: string; onClose: () => void; children: React.ReactNode; closeLabel?: string }) {
  return (
    <div className="sheet" role="dialog" aria-label={title}>
      <div className="sheet-card">
        <div className="display big">{title}</div>
        {children}
        <button className="btn" onClick={onClose}>{closeLabel}</button>
      </div>
    </div>
  );
}

function DetailSheet({ s, e, round, unit, onClose, onSave, onDelete }: {
  s: Session; e: Session['exercises'][string]; round: number; unit: WeightUnit | 'bw'; onClose: () => void;
  onSave: (t: SetType, rpe: number | null, edit: LogInput | null) => void; onDelete: () => void;
}) {
  const blk = blockOfKey(s, e.key);
  const pairedWith = !blk.closed && blk.members.length > 1 ? blk.members.map((k) => s.exercises[k]) : null;
  const loggedInRound = (pairedWith ?? [e]).filter((m) => m.logs[round]).length;
  const deletable = canDeleteSet(s, e.key, round);
  const [type, setType] = useState<SetType>(e.types[round] ?? 'working');
  const [rpe, setRpe] = useState<number | null>(e.logs[round]?.rpe ?? null);
  const lg = e.logs[round];
  const shown = lg && unit !== 'bw' && lg.enteredUnit !== 'bw' ? displayNum(displayWeight({ lb: lg.lb ?? 0, enteredValue: lg.enteredValue, enteredUnit: lg.enteredUnit }, unit)) : '';
  const [w, setW] = useState(shown);
  const [reps, setReps] = useState(lg ? String(lg.reps) : '');
  const [sure, setSure] = useState(false);
  function edit(): LogInput | null {
    if (!lg) return null;
    const r = Math.round(Number(reps));
    const repsOk = Number.isFinite(r) && r >= 1 ? r : lg.reps;
    if (unit === 'bw' || lg.enteredUnit === 'bw') return repsOk === lg.reps ? null : { lb: null, enteredValue: 1, enteredUnit: 'bw', reps: repsOk };
    const n = Number(w);
    const keep = w === shown || w.trim() === '' || !Number.isFinite(n) || n < 0;
    const stored = keep ? { lb: lg.lb ?? 0, enteredValue: lg.enteredValue, enteredUnit: lg.enteredUnit } : weightToStore(n, unit, null);
    if (keep && repsOk === lg.reps) return null;
    return { lb: stored.lb, enteredValue: stored.enteredValue, enteredUnit: stored.enteredUnit, reps: repsOk };
  }
  return (
    <Sheet title={`Set ${round + 1} details`} onClose={onClose}>
      {lg && (
        <>
          <div className="lab">Logged</div>
          <div className="row tight">
            {unit !== 'bw' && lg.enteredUnit !== 'bw' && (
              <input className="num" inputMode="decimal" aria-label={`Logged weight in ${unit}`} value={w} onChange={(ev) => setW(ev.target.value.replace(/[^0-9.]/g, ''))} />
            )}
            <span className="muted">{unit === 'bw' || lg.enteredUnit === 'bw' ? '1 BW' : unit} ×</span>
            <input className="num" inputMode="numeric" aria-label="Logged reps" value={reps} onChange={(ev) => setReps(ev.target.value.replace(/[^0-9]/g, ''))} />
          </div>
        </>
      )}
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
      <button className="btn primary" onClick={() => onSave(type, rpe, edit())}>Save</button>
      {deletable && (sure
        ? (
          <>
            <div className="muted">
              {pairedWith
                ? `Round ${round + 1} is removed from all ${pairedWith.length} exercises in this superset${loggedInRound ? `, including ${loggedInRound} logged set${loggedInRound === 1 ? '' : 's'}` : ''}. No set is added in its place.`
                : `Set ${round + 1} is removed${lg ? ', with what was logged' : ''}. No set is added in its place.`}
            </div>
            <button className="btn" onClick={onDelete}>{pairedWith ? `Yes, delete round ${round + 1}` : `Yes, delete set ${round + 1}`}</button>
          </>
        )
        : <button className="btn" onClick={() => setSure(true)}>{pairedWith ? `Delete round ${round + 1}` : 'Delete this set'}</button>)}
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
  const sessions = [...realSessions(history, e.exerciseId).slice(-5).map((p) => ({ label: p.day.slice(5), sets: p.sets })),
    ...(e.logs.length ? [{ label: 'Today', sets: e.logs.map((l) => ({ lb: l.lb, reps: l.reps, type: l.type })) }] : [])];
  void s;
  if (!sessions.length) return <div className="muted">No history yet. Log a set to start the graph.</div>;
  const bw = unit === 'bw';
  const h = (lb: number | null) => (unit === 'bw' || lb === null ? 1 : fromPounds(lb, unit));
  const maxBar = Math.max(...sessions.flatMap((x) => x.sets.map((y) => h(y.lb))), 1);
  // Volume is shown in the exercise's own unit, like the bars. Bodyweight and assisted volume is reps.
  const repsOnly = bw || kind.assisted;
  const vols = sessions.map((x) => {
    const v = x.sets.reduce((a, y) => a + setVolume({ id: '', lb: y.lb, reps: y.reps, type: y.type, day: '', order: 0 }, kind), 0);
    return unit === 'bw' || repsOnly ? v : fromPounds(v, unit);
  });
  const maxVol = Math.max(...vols, 1);
  const W = 340, H = 160, x0 = 34, x1 = W - 40, y0 = 26, y1 = H - 6, cw = (x1 - x0) / sessions.length;
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
        <line x1={x0} y1={y0} x2={x0} y2={y1} className="g-axis" />
        <line x1={x1} y1={y0} x2={x1} y2={y1} className="g-axis-line" />
        <polyline points={pts.join(' ')} className="g-line" />
        <text x={x0 - 4} y={10} textAnchor="start" className="g-title">{bw ? 'Reps on bars' : `Weight (${unit})`}</text>
        <text x={x1 + 4} y={10} textAnchor="end" className="g-line-title">{repsOnly ? 'Total reps' : `Volume (${unit})`}</text>
        <text x={x0 - 4} y={y0 + 14 + 4} textAnchor="end" className="g-label">{bw ? '1 BW' : fmt(maxBar)}</text>
        <text x={x0 - 4} y={y1} textAnchor="end" className="g-label">0</text>
        <text x={x1 + 4} y={y0 + 4} className="g-line-text">{fmt(maxVol)}</text>
        <text x={x1 + 4} y={y1} className="g-line-text">0</text>
      </svg>
      <div className="muted">Each bar is one set: height is {bw ? 'the same for every set (1 BW)' : `weight in ${unit}`}, the number above is reps. The line is session {bw ? 'total reps' : 'volume'}.</div>
    </>
  );
}

// ------------------------------------------------------------------ start and finish
function StartScreen({ exercises, workouts, libById, summary, lastDone, now, syncLine, saved, onDismiss, onReopen, onStart, alerts }: {
  exercises: LibExercise[]; workouts: LibWorkout[]; libById: Map<string, LibExercise>;
  summary: Session | null; lastDone: Session | null; now: number; syncLine: React.ReactNode; saved: boolean;
  onDismiss: () => void; onReopen: (s: Session) => void; onStart: (name: string, plan: PlanItem[], workoutId?: string | null) => void;
  alerts: null | { msg: string; onAllow: () => void };
}) {
  const [picked, setPicked] = useState<LibExercise[]>([]);
  const [q, setQ] = useState('');
  const list = q.trim() ? exercises.filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 30) : [];

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
        {summary.finishReason === 'auto' && <div className="muted">This workout finished by itself after 30 minutes with nothing logged. It ends at your last logged step.</div>}
        {syncLine}
        <button className="btn primary" onClick={onDismiss}>Done</button>
        {canReopen(summary, now) && <button className="btn" onClick={() => onReopen(summary)}>Reopen workout</button>}
      </main>
    );
  }

  return (
    <main className="phone">
      <div className="phone-top"><Link className="btn icon" href="/app" aria-label="Back to the home screen">‹</Link></div>
      <h1>Start a workout</h1>
      {syncLine}
      {alerts && (
        <div className="panel">
          <div>Turn on rest alerts, so &quot;Rest over&quot; reaches you when the app is in the background or the phone is locked.</div>
          <button className="btn" onClick={alerts.onAllow}>Turn on rest alerts</button>
          {alerts.msg && <div className="muted">{alerts.msg}</div>}
        </div>
      )}
      {lastDone && canReopen(lastDone, now) && (
        <div className="panel">
          <div>Last workout: {lastDone.name}, finished {when(new Date(lastDone.endedAt!).toISOString())}.</div>
          <div className="muted">It can be reopened for 48 hours. Its clocks carry on, and the time it was closed is not counted.</div>
          <button className="btn" onClick={() => onReopen(lastDone)}>Reopen {lastDone.name}</button>
        </div>
      )}
      {workouts.length > 0 && (
        <>
          <h2>Your workouts</h2>
          {workouts.map((w) => (
            <button key={w.id} className="btn opt" onClick={() => onStart(w.name, w.items.flatMap((i) => { const x = libById.get(i.exerciseId); return x ? [toPlan(x, i.sets, i.reps, i.rest, i.superset)] : []; }), w.id)}>
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
