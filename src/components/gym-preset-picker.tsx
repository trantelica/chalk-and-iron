'use client';
import { useState } from 'react';
import { allTicked, applyPreset, GYM_PRESETS, presetById, presetItems, presetWeights, presetWeightsLine } from '@/rules/gym-presets';
import type { Weights } from '@/rules/gym-weights';

// Pick one of three starting lists, then untick what the gym lacks. No typing.
// `current` is the gym's list now (empty for a new gym): items already in it are
// marked and never counted, and saving only ever adds.
export function GymPresetPicker({ current, hasWeights, gymLabel, actionLabel, actionDisabled, busy, onApply, onCancel }: {
  current: string[];
  /** The gym already has a Weights line in its notes: the preset's weights are then left unticked, so they never replace it by accident. */
  hasWeights?: boolean;
  gymLabel: string;
  actionLabel: (n: number) => string;
  actionDisabled?: boolean;
  busy?: boolean;
  onApply: (next: string[], added: number, weights: Weights | null) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [withWeights, setWithWeights] = useState(true);
  const preset = id ? presetById(id) : undefined;
  const have = new Set(current.map((x) => x.toLowerCase()));

  if (!preset) {
    return (
      <div className="stack" role="group" aria-label={`Start ${gymLabel} from a preset`}>
        <div className="preset-choices">
          {GYM_PRESETS.map((p) => (
            <button key={p.id} type="button" className="btn" onClick={() => { setId(p.id); setTicked(allTicked(p)); setWithWeights(!hasWeights); }}>
              <span><strong>{p.name}</strong><br /><span className="muted">{presetItems(p).length} items. {p.blurb}</span></span>
            </button>
          ))}
        </div>
        {onCancel && <button type="button" className="btn small" onClick={onCancel}>Cancel</button>}
      </div>
    );
  }

  const result = applyPreset(current, preset, ticked);
  const setMany = (items: string[], on: boolean) => setTicked((t) => { const n = new Set(t); for (const i of items) { if (on) n.add(i); else n.delete(i); } return n; });
  return (
    <div className="stack" role="group" aria-label={`${preset.name} preset for ${gymLabel}`}>
      <div className="row spread">
        <strong>{preset.name}</strong>
        <button type="button" className="btn small" onClick={() => setId(null)}>Choose another preset</button>
      </div>
      <div className="muted">Everything is ticked. Untick what this gym does not have. Nothing already in the list is removed.</div>
      {preset.groups.map((g) => {
        const on = g.items.filter((i) => ticked.has(i)).length;
        return (
          <fieldset key={g.name} className="preset-group">
            <legend>{g.name} ({on} of {g.items.length})</legend>
            <div className="row">
              <button type="button" className="btn small" aria-label={`Select all ${g.name}`} onClick={() => setMany(g.items, true)}>Select all</button>
              <button type="button" className="btn small" aria-label={`Clear ${g.name}`} onClick={() => setMany(g.items, false)}>Clear</button>
            </div>
            {g.items.map((item) => (
              <label key={item} className="preset-tick">
                <input type="checkbox" checked={ticked.has(item)} onChange={(e) => setMany([item], e.target.checked)} />
                <span>{item}</span>
                {have.has(item.toLowerCase()) && <span className="muted">already in the list</span>}
              </label>
            ))}
          </fieldset>
        );
      })}
      <label className="preset-tick">
        <input type="checkbox" checked={withWeights} onChange={(e) => setWithWeights(e.target.checked)} />
        <span>Also record this preset&apos;s typical weights{hasWeights ? ' (replaces the weights already recorded)' : ''}</span>
      </label>
      {withWeights && <div className="muted">{presetWeightsLine(preset).replace(/^Weights: /, '')} You can change them afterwards in Weights.</div>}
      <div className="muted" role="status" aria-live="polite">{result.fresh.length} to add{result.already.length ? `, ${result.already.length} already in the list` : ''}.</div>
      <div className="row">
        <button type="button" className="btn primary small-primary" disabled={busy || actionDisabled || (current.length > 0 && !result.fresh.length && !withWeights)} onClick={() => void onApply(result.next, result.fresh.length, withWeights ? presetWeights(preset) : null)}>{!result.fresh.length && withWeights && current.length > 0 ? 'Record the typical weights' : actionLabel(result.fresh.length)}</button>
        {onCancel && <button type="button" className="btn" onClick={onCancel}>Cancel</button>}
      </div>
    </div>
  );
}
