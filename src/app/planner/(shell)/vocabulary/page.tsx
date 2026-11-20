'use client';
import { useMemo, useState } from 'react';
import { browserClient } from '@/lib/supabase/browser';
import { canDeleteTerm, nameTaken, termUsage } from '@/rules/vocabulary';
import { plainError, usePlanner, type Term } from '../../planner-data';
import { TextCell } from '../../fields';

// Vocabulary (spec Section 5): editable lists of muscle groups, focus values
// and equipment. The only place the vocabulary is managed; the phone has no
// vocabulary screen. Rename carries through to every exercise using the value.
// A value in use is archived, not deleted.
export default function Vocabulary() {
  const { data, reload } = usePlanner();
  const sb = browserClient();
  const [msg, setMsg] = useState('');
  const usage = useMemo(() => termUsage(data.exercises), [data.exercises]);

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setMsg('');
    const r = await fn();
    if (r.error) setMsg(plainError(r.error.message));
    await reload();
  }
  const rename = (t: Term, name: string) => {
    const sib = data.terms.filter((x) => x.kind === t.kind && x.parent_id === t.parent_id);
    if (!name.trim()) return;
    if (nameTaken(name, sib, t.id)) { setMsg(`"${name.trim()}" is already in this list.`); return reload(); }
    return run(() => sb.from('vocabulary_terms').update({ name: name.trim() }).eq('id', t.id));
  };
  const add = (kind: Term['kind'], parent: string | null) => {
    const name = window.prompt(kind === 'focus' ? 'New focus value' : kind === 'muscle_group' ? 'New muscle group' : 'New equipment value');
    if (!name?.trim()) return;
    const sib = data.terms.filter((x) => x.kind === kind && x.parent_id === parent);
    if (nameTaken(name, sib)) { setMsg(`"${name.trim()}" is already in this list.`); return; }
    const order = Math.max(0, ...sib.map((s) => s.sort_order)) + 1;
    return run(() => sb.from('vocabulary_terms').insert({ user_id: data.userId, kind, name: name.trim(), parent_id: parent, sort_order: order }));
  };
  const archive = (t: Term, on: boolean) => {
    if (on && !window.confirm(`Archive "${t.name}"? Exercises that use it keep it. It leaves the pickers, and you can restore it.`)) return;
    return run(() => sb.from('vocabulary_terms').update({ archived_at: on ? new Date().toISOString() : null }).eq('id', t.id));
  };
  const del = (t: Term) => {
    if (!window.confirm(`Delete "${t.name}"? Nothing uses it. This cannot be undone.`)) return;
    return run(() => sb.from('vocabulary_terms').delete().eq('id', t.id));
  };

  function TermRow({ t }: { t: Term }) {
    const n = usage.get(t.id) ?? 0;
    return (
      <div className="row term-row">
        <TextCell value={t.name} label={`Name of ${t.name}`} width={200} onSave={(v) => rename(t, v)} />
        {t.archived_at && <span className="tag">Archived</span>}
        <span className="muted">{n ? `used by ${n} exercise${n === 1 ? '' : 's'}` : 'not used'}</span>
        <button className="btn small" onClick={() => archive(t, !t.archived_at)}>{t.archived_at ? 'Restore' : 'Archive'}</button>
        {canDeleteTerm(t, data.terms, usage) && <button className="btn small" onClick={() => del(t)}>Delete</button>}
      </div>
    );
  }

  const muscles = data.terms.filter((t) => t.kind === 'muscle_group');
  const equipment = data.terms.filter((t) => t.kind === 'equipment');
  return (
    <>
      <div className="muted">The allowed muscle groups, focus values and equipment. Renaming one changes it in every exercise that uses it. A value in use is archived, not deleted: exercises keep it, but it drops out of the pickers.</div>
      {msg && <div className="error" role="alert">{msg}</div>}
      <h2>Muscle groups and focus values</h2>
      <div className="box">
        {muscles.map((m) => (
          <div key={m.id} className="vocab-group">
            <TermRow t={m} />
            <div className="vocab-focus">
              {data.terms.filter((f) => f.kind === 'focus' && f.parent_id === m.id).map((f) => <TermRow key={f.id} t={f} />)}
              <button className="btn small" onClick={() => add('focus', m.id)}>Add focus value to {m.name}</button>
            </div>
          </div>
        ))}
        <button className="btn" onClick={() => add('muscle_group', null)}>Add muscle group</button>
      </div>
      <h2>Equipment</h2>
      <div className="box">
        {equipment.map((t) => <TermRow key={t.id} t={t} />)}
        <button className="btn" onClick={() => add('equipment', null)}>Add equipment value</button>
      </div>
    </>
  );
}
