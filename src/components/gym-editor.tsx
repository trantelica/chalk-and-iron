'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { TextCell, AreaCell } from '@/app/planner/fields';
import { GymPresetPicker } from '@/components/gym-preset-picker';
import {
  checkEquipment, cleanEquipment, filterEquipment, ITEM_MAX, listToText, parsePasted, previewAdd, renameEquipment, sortEquipment,
} from '@/rules/gym-equipment';

// Gyms and their equipment lists (spec Section 4; design Section 2, gyms).
// Built for a large gym: a filter, one-line add, paste a whole list, rename and
// remove with Undo, and a plain-text view to edit the whole list at once. The
// coach reads the list, and when it is unsure the user has something it asks in
// the chat and proposes adding it (a card in Proposals), so a list can start
// small and grow. A "fully equipped" setting is not built; where it would sit
// is noted in src/rules/gym-equipment.ts.

type Gym = { id: string; name: string; equipment: string[]; notes: string; is_default: boolean; archived_at: string | null };

function EquipmentEditor({ gymName, list, onSave }: { gymName: string; list: string[]; onSave: (next: string[]) => Promise<void> }) {
  const [query, setQuery] = useState('');
  const [one, setOne] = useState('');
  const [pasted, setPasted] = useState('');
  const [mode, setMode] = useState<'list' | 'text'>('list');
  const [text, setText] = useState(listToText(list));
  const [msg, setMsg] = useState('');
  const [undo, setUndo] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [preset, setPreset] = useState(false);
  useEffect(() => { if (mode === 'list') setText(listToText(list)); }, [list, mode]);

  async function commit(next: string[], note = ''): Promise<boolean> {
    const c = checkEquipment(next);
    if (!c.ok) { setMsg(c.error); return false; }
    setBusy(true);
    try { await onSave(c.list); setMsg(note); return true; } catch (e) { setMsg('Not saved: ' + (e as Error).message); return false; } finally { setBusy(false); }
  }

  const shown = useMemo(() => filterEquipment(list, query), [list, query]);
  const add = preview(list, pasted);
  const textNext = cleanEquipment(text.split(/\r?\n/));
  const diff = previewAdd(list, textNext);
  const removed = list.filter((x) => !textNext.some((y) => y.toLowerCase() === x.toLowerCase()));

  return (
    <div className="stack" aria-label={`Equipment for ${gymName}`}>
      <div className="row spread">
        <span className="muted" aria-live="polite">{list.length} item{list.length === 1 ? '' : 's'}, kept in A to Z order</span>
        <span className="row" role="group" aria-label="View">
          <button className={`btn small ${mode === 'list' ? 'selected' : ''}`} aria-pressed={mode === 'list'} onClick={() => setMode('list')}>List</button>
          <button className={`btn small ${mode === 'text' ? 'selected' : ''}`} aria-pressed={mode === 'text'} onClick={() => setMode('text')}>Edit as text</button>
        </span>
      </div>
      {msg && <div className="muted" role="status">{msg}</div>}
      {undo && <div className="row"><span className="muted">Removed an item.</span><button className="btn small" onClick={async () => { if (await commit(undo, 'Put back.')) setUndo(null); }}>Undo</button></div>}

      {mode === 'list' ? (
        <>
          {preset ? (
            <GymPresetPicker current={list} gymLabel={gymName} busy={busy} onCancel={() => setPreset(false)}
              actionLabel={(n) => (n ? `Add ${n} to the list` : 'Nothing new to add')}
              onApply={async (next, n) => { if (await commit(next, `Added ${n} from the preset.`)) setPreset(false); }} />
          ) : (
            <button className="btn" onClick={() => setPreset(true)}>Start from a preset</button>
          )}
          <div className="row">
            <input type="text" aria-label={`Add equipment to ${gymName}`} placeholder="Add one: Rower" maxLength={ITEM_MAX} value={one}
              onChange={(e) => setOne(e.target.value)}
              onKeyDown={async (e) => { if (e.key === 'Enter' && one.trim()) { if (await commit([...list, one], '')) setOne(''); } }} />
            <button className="btn" disabled={busy || !one.trim()} onClick={async () => { if (await commit([...list, one], '')) setOne(''); }}>Add</button>
          </div>
          <details>
            <summary>Add many at once</summary>
            <div className="stack">
              <label>
                Paste a list, one item per line or separated by commas
                <textarea className="paste-box" aria-label={`Paste equipment for ${gymName}`} value={pasted} onChange={(e) => setPasted(e.target.value)} />
              </label>
              {pasted.trim() && <div className="muted" aria-live="polite">{add.fresh.length} new{add.already.length ? `, ${add.already.length} already in the list` : ''}.</div>}
              <button className="btn" disabled={busy || !add.fresh.length}
                onClick={async () => { if (await commit([...list, ...add.fresh], `Added ${add.fresh.length}.`)) setPasted(''); }}>
                Add {add.fresh.length || ''} to the list
              </button>
            </div>
          </details>
          <input type="text" aria-label={`Filter ${gymName} equipment`} placeholder={`Filter ${list.length} items`} value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && <div className="muted">Showing {shown.length} of {list.length}.</div>}
          <div className="gym-list" role="list" aria-label={`${gymName} equipment list`}>
            {shown.length === 0 && <div className="muted" style={{ padding: 10 }}>{list.length ? 'Nothing matches.' : 'No equipment yet. Add what the gym has, or let your coach ask and propose it.'}</div>}
            {shown.map((item) => (
              <div className="gym-item" role="listitem" key={item}>
                <TextCell value={item} label={`Name of ${item}`} onSave={async (v) => {
                  if (!v.trim()) { setMsg('A name cannot be empty. Use Remove to delete it.'); return; }
                  await commit(renameEquipment(list, item, v));
                }} />
                <button className="btn small" aria-label={`Remove ${item}`} disabled={busy}
                  onClick={async () => { const before = list; if (await commit(list.filter((x) => x !== item), '')) setUndo(before); }}>Remove</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <label>
            One item per line. Delete a line to remove it, add a line to add it.
            <textarea className="gym-text" aria-label={`Equipment text for ${gymName}`} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          </label>
          <div className="muted" aria-live="polite">
            {diff.fresh.length} to add, {removed.length} to remove{removed.length ? `: ${removed.slice(0, 5).join(', ')}${removed.length > 5 ? '…' : ''}` : ''}.
          </div>
          <div className="row">
            <button className="btn primary small-primary" disabled={busy || (!diff.fresh.length && !removed.length)}
              onClick={async () => { if (removed.length > 5 && !window.confirm(`Remove ${removed.length} items from ${gymName}?`)) return; if (await commit(textNext, 'List saved.')) setMode('list'); }}>Save the list</button>
            <button className="btn" onClick={() => setText(listToText(list))}>Start over</button>
          </div>
        </>
      )}
    </div>
  );
}

function preview(list: string[], pasted: string) {
  return previewAdd(list, parsePasted(pasted));
}

export function GymsSection() {
  const sb = browserClient();
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newPreset, setNewPreset] = useState(false);

  const load = useCallback(async () => {
    const r = await sb.from('gyms').select('id, name, equipment, notes, is_default, archived_at').order('name');
    if (r.error) { setError('Your gyms could not be read: ' + r.error.message); return; }
    // Shown in the app's own A to Z order (numbers in order, accents with their letter), whatever order the database holds.
    setGyms(((r.data ?? []) as Gym[]).map((g) => ({ ...g, equipment: sortEquipment(g.equipment ?? []) })));
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  async function change(id: string, patch: Record<string, unknown>) {
    const r = await sb.from('gyms').update(patch).eq('id', id);
    if (r.error) { setError('Not saved: ' + r.error.message); await load(); throw new Error(r.error.message); }
    setError('');
    await load();
  }
  async function makeDefault(g: Gym) {
    const other = (gyms ?? []).find((x) => x.is_default && x.id !== g.id);
    if (other) await change(other.id, { is_default: false });
    await change(g.id, { is_default: true });
  }
  async function addGym(equipment: string[] = []) {
    const name = newName.trim();
    if (!name) return;
    if (name.length > 80) { setError('A gym name is at most 80 characters.'); return; }
    const { data: auth } = await sb.auth.getUser();
    if (!auth.user) { setError('You are signed out. Sign in again.'); return; }
    const live = (gyms ?? []).filter((g) => !g.archived_at);
    const r = await sb.from('gyms').insert({ user_id: auth.user.id, name, equipment, notes: '', is_default: live.length === 0 }).select('id').single();
    if (r.error) { setError('Not saved: ' + r.error.message); return; }
    setError('');
    setNewName('');
    setNewPreset(false);
    setOpen(r.data.id);
    await load();
  }

  if (!gyms) return <p className="muted">{error || 'Loading your gyms…'}</p>;
  const live = gyms.filter((g) => !g.archived_at);
  const archived = gyms.filter((g) => g.archived_at);
  return (
    <div className="stack">
      <div className="muted">
        The coach reads each gym&apos;s equipment before it plans a workout. The list can start small: when your coach is not sure you have something, it asks you in the chat and, if you do, proposes adding it here (you will see the card in Proposals).
      </div>
      {error && <div className="error" role="alert">{error}</div>}
      {live.map((g) => (
        <section key={g.id} className="pbox gym-card" aria-label={`Gym ${g.name}`}>
          <div className="row spread">
            <TextCell value={g.name} label={`Name of gym ${g.name}`} width={260} onSave={(v) => { if (!v.trim() || v.trim().length > 80) { setError('A gym needs a name of 1 to 80 characters.'); return; } return change(g.id, { name: v.trim() }); }} />
            {g.is_default ? <span className="tag on">Default gym</span> : <button className="btn small" onClick={() => makeDefault(g)}>Make default</button>}
          </div>
          <div className="intake-field">
            <span className="lab-text">Notes, such as a limit on dumbbell weight</span>
            <AreaCell label={`Notes for ${g.name}`} max={1000} rows={2} value={g.notes} onSave={(v) => change(g.id, { notes: v })} />
          </div>
          <div className="row spread">
            <span>{g.equipment.length} equipment item{g.equipment.length === 1 ? '' : 's'}</span>
            <span className="row">
              <button className="btn small" aria-expanded={open === g.id} onClick={() => setOpen(open === g.id ? null : g.id)}>{open === g.id ? 'Close equipment' : 'Review and edit equipment'}</button>
              <button className="btn small" onClick={() => { if (window.confirm(`Archive "${g.name}"? Your coach stops seeing it. Your history keeps it, and you can restore it.`)) void change(g.id, { archived_at: new Date().toISOString(), is_default: false }); }}>Archive</button>
            </span>
          </div>
          {open === g.id && <EquipmentEditor gymName={g.name} list={g.equipment} onSave={(next) => change(g.id, { equipment: next })} />}
        </section>
      ))}
      {live.length === 0 && <div className="muted">No gym yet. Add one so your coach knows what equipment you have.</div>}
      <div className="row">
        <input type="text" aria-label="Name of a new gym" placeholder="New gym name, for example Home garage" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void addGym(); }} />
        <button className="btn" disabled={!newName.trim()} onClick={() => addGym()}>Add gym</button>
      </div>
      {newPreset ? (
        <GymPresetPicker current={[]} gymLabel="the new gym" actionDisabled={!newName.trim()} onCancel={() => setNewPreset(false)}
          actionLabel={(n) => (newName.trim() ? `Add gym with ${n} items` : 'Type the gym name first')}
          onApply={(next) => addGym(next)} />
      ) : (
        <button className="btn" onClick={() => setNewPreset(true)}>Add a gym from a preset</button>
      )}
      {archived.length > 0 && (
        <details>
          <summary>{archived.length} archived gym{archived.length === 1 ? '' : 's'}</summary>
          <div className="stack">
            {archived.map((g) => (
              <div key={g.id} className="row archived-row"><span>{g.name}</span><button className="btn small" onClick={() => change(g.id, { archived_at: null })}>Restore</button></div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
