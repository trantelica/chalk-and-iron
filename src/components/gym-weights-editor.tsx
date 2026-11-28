'use client';
import { useState } from 'react';
import {
  DEFAULT_BAR, DUMBBELL_STEPS, KETTLEBELL_SIZES, PLATE_SIZES, checkWeights, emptyWeights, heaviestBarbell, readWeights, setWeights, weightsLine,
  type Weights, type WeightUnit,
} from '@/rules/gym-weights';

// The Weights section of a gym: dumbbell range, kettlebell sizes, plates, bar.
// Big tap targets, steppers and ticks, no typing. Saving writes one "Weights:"
// line into the gym's notes (src/rules/gym-weights.ts) and leaves the person's
// other notes alone. A Weights line edited by hand that cannot be read is
// reported and never overwritten.

const fmt = (n: number) => String(Math.round(n * 100) / 100);

function Stepper({ label, value, step, min, max, unit, onChange }: { label: string; value: number; step: number; min: number; max?: number; unit: string; onChange: (n: number) => void }) {
  const clamp = (n: number) => Math.round(Math.max(min, max === undefined ? n : Math.min(max, n)) * 100) / 100;
  return (
    <div className="wstep" role="group" aria-label={label}>
      <span className="wstep-label">{label}</span>
      <button type="button" className="btn" aria-label={`Less ${label}`} disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      <output aria-label={`${label} value`}>{fmt(value)} {unit}</output>
      <button type="button" className="btn" aria-label={`More ${label}`} disabled={max !== undefined && value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}

function UnitPick({ label, unit, onChange }: { label: string; unit: WeightUnit; onChange: (u: WeightUnit) => void }) {
  return (
    <span className="row" role="group" aria-label={`${label} unit`}>
      {(['lb', 'kg'] as const).map((u) => (
        <button key={u} type="button" className={`btn ${unit === u ? 'selected' : ''}`} aria-pressed={unit === u} onClick={() => unit !== u && onChange(u)}>{u}</button>
      ))}
    </span>
  );
}

function Mode({ label, mode, onChange }: { label: string; mode: 'unset' | 'none' | 'set'; onChange: (m: 'unset' | 'none' | 'set') => void }) {
  const opts = [['unset', 'Not recorded'], ['none', 'None'], ['set', 'Has some']] as const;
  return (
    <span className="row" role="group" aria-label={`${label} present`}>
      {opts.map(([m, t]) => <button key={m} type="button" className={`btn ${mode === m ? 'selected' : ''}`} aria-pressed={mode === m} onClick={() => onChange(m)}>{t}</button>)}
    </span>
  );
}

export function WeightsEditor({ gymName, notes, onSaveNotes }: { gymName: string; notes: string; onSaveNotes: (notes: string) => Promise<void> }) {
  const read = readWeights(notes);
  const saved = read.status === 'ok' ? read.weights : emptyWeights();
  const [w, setW] = useState<Weights>(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [seen, setSeen] = useState(notes);
  // The notes changed underneath (saved here, edited in the Notes box, or the coach's card accepted): start again from what they say.
  if (seen !== notes) { setSeen(notes); setW(saved); }

  if (read.status === 'unreadable') {
    return (
      <div className="stack" role="group" aria-label={`Weights for ${gymName}`}>
        <strong>Weights</strong>
        <div className="muted" role="status">The Weights line in the notes was edited by hand and cannot be read, so it is left as it is: <em>{read.line}</em>. Fix it in the notes box above, or delete that line to start again.</div>
      </div>
    );
  }

  const line = weightsLine(w);
  const current = weightsLine(saved);
  const problem = checkWeights(w);
  const result = setWeights(notes, w);
  const unit = w.bar.unit;
  const dirty = line !== current;
  const set = (patch: Partial<Weights>) => { setMsg(''); setW({ ...w, ...patch }); };
  const mode = (v: unknown): 'unset' | 'none' | 'set' => (v === null ? 'unset' : v === 'none' ? 'none' : 'set');

  function changeUnit(u: WeightUnit) {
    // Sizes differ between pounds and kilograms, so the plates and kettlebells start again in the new unit.
    setMsg('');
    setW({
      ...w,
      bar: { weight: DEFAULT_BAR[u], unit: u },
      plates: w.plates === null ? null : w.plates === 'none' ? 'none' : PLATE_SIZES[u].map((size) => ({ size, count: 0 })),
    });
  }
  const plateCount = (size: number) => (Array.isArray(w.plates) ? w.plates.find((p) => p.size === size)?.count ?? 0 : 0);
  function setPlates(m: 'unset' | 'none' | 'set') {
    set({ plates: m === 'unset' ? null : m === 'none' ? 'none' : (Array.isArray(w.plates) ? w.plates : PLATE_SIZES[unit].map((size) => ({ size, count: size >= 5 ? 2 : 0 }))) });
  }
  function setCount(size: number, count: number) {
    const base = Array.isArray(w.plates) ? w.plates : [];
    const rest = base.filter((p) => p.size !== size);
    set({ plates: [...rest, { size, count }] });
  }
  function setBells(m: 'unset' | 'none' | 'set') {
    set({ kettlebells: m === 'unset' ? null : m === 'none' ? 'none' : (w.kettlebells && w.kettlebells !== 'none' ? w.kettlebells : { unit: 'lb', sizes: [] }) });
  }
  function setDumbbells(m: 'unset' | 'none' | 'set') {
    set({ dumbbells: m === 'unset' ? null : m === 'none' ? 'none' : (w.dumbbells && w.dumbbells !== 'none' ? w.dumbbells : { min: unit === 'lb' ? 5 : 2, max: unit === 'lb' ? 50 : 24, step: unit === 'lb' ? 5 : 2, unit }) });
  }

  const d = w.dumbbells && w.dumbbells !== 'none' ? w.dumbbells : null;
  const k = w.kettlebells && w.kettlebells !== 'none' ? w.kettlebells : null;
  const plates = Array.isArray(w.plates) ? w.plates : null;

  async function save() {
    if (!result.ok) { setMsg(result.error); return; }
    setBusy(true);
    try { await onSaveNotes(result.notes); setMsg('Weights saved in the notes.'); } catch (e) { setMsg('Not saved: ' + (e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="stack weights" role="group" aria-label={`Weights for ${gymName}`}>
      <strong>Weights</strong>
      <div className="muted">What this gym can load. Your coach reads this and never plans a weight the gym does not have. It is kept as one &quot;Weights:&quot; line in the notes.</div>

      <fieldset className="preset-group">
        <legend>Dumbbells</legend>
        <Mode label="Dumbbells" mode={mode(w.dumbbells)} onChange={setDumbbells} />
        {d && (
          <>
            <UnitPick label="Dumbbell" unit={d.unit} onChange={(u) => set({ dumbbells: { min: u === 'lb' ? 5 : 2, max: u === 'lb' ? 50 : 24, step: u === 'lb' ? 5 : 2, unit: u } })} />
            <span className="row" role="group" aria-label="Dumbbell step">
              {DUMBBELL_STEPS[d.unit].map((s) => <button key={s} type="button" className={`btn ${d.step === s ? 'selected' : ''}`} aria-pressed={d.step === s} onClick={() => set({ dumbbells: { ...d, step: s } })}>{fmt(s)} {d.unit} steps</button>)}
            </span>
            <Stepper label="Lightest" value={d.min} step={d.step} min={d.step} max={d.max} unit={d.unit} onChange={(n) => set({ dumbbells: { ...d, min: n } })} />
            <Stepper label="Heaviest" value={d.max} step={d.step} min={d.min} unit={d.unit} onChange={(n) => set({ dumbbells: { ...d, max: n } })} />
          </>
        )}
      </fieldset>

      <fieldset className="preset-group">
        <legend>Kettlebells</legend>
        <Mode label="Kettlebells" mode={mode(w.kettlebells)} onChange={setBells} />
        {k && (
          <>
            <UnitPick label="Kettlebell" unit={k.unit} onChange={(u) => set({ kettlebells: { unit: u, sizes: [] } })} />
            <div role="group" aria-label="Kettlebell sizes">
              {KETTLEBELL_SIZES[k.unit].map((s) => {
                const on = k.sizes.includes(s);
                return (
                  <label key={s} className="tick-row">
                    <input type="checkbox" checked={on} onChange={() => set({ kettlebells: { ...k, sizes: on ? k.sizes.filter((x) => x !== s) : [...k.sizes, s] } })} />
                    <span>{fmt(s)} {k.unit}</span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </fieldset>

      <fieldset className="preset-group">
        <legend>Plates and bar</legend>
        <Mode label="Plates" mode={mode(w.plates)} onChange={setPlates} />
        {w.plates !== null && <UnitPick label="Plate" unit={unit} onChange={changeUnit} />}
        {plates && PLATE_SIZES[unit].map((size) => (
          <Stepper key={size} label={`${fmt(size)} ${unit} plates`} value={plateCount(size)} step={1} min={0} max={40} unit="" onChange={(n) => setCount(size, n)} />
        ))}
        {w.plates !== null && (
          <>
            <Stepper label="Bar" value={w.bar.weight} step={unit === 'lb' ? 5 : 2.5} min={unit === 'lb' ? 5 : 2.5} unit={unit} onChange={(n) => set({ bar: { weight: n, unit } })} />
            <div role="status" aria-live="polite"><strong>Heaviest barbell: {fmt(heaviestBarbell(w.plates, w.bar.weight))} {unit}</strong> <span className="muted">(bar plus plates, in pairs)</span></div>
          </>
        )}
      </fieldset>

      {line && <div className="muted" aria-label="What will be saved">Saved in the notes as: {line}</div>}
      {(problem || (!result.ok && !problem)) && <div className="error" role="alert">{problem || (result.ok ? '' : result.error)}</div>}
      {msg && <div className="muted" role="status">{msg}</div>}
      <div className="row">
        <button type="button" className="btn primary small-primary" disabled={busy || !dirty || !result.ok} onClick={() => void save()}>Save weights</button>
        <button type="button" className="btn" disabled={!dirty} onClick={() => { setW(saved); setMsg(''); }}>Undo changes</button>
      </div>
    </div>
  );
}
