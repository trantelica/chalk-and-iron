'use client';
import { useEffect, useRef, useState } from 'react';

// Small boxes that keep what is being typed until the person leaves the box or
// presses Enter, then save once. While saving the box is marked, and once
// saved it shows a tick for a moment (Nate, 21 Nov: it was not clear an edit saved).

type Mark = '' | 'saving' | 'saved';
export function useMark() {
  const [mark, setMark] = useState<Mark>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const run = async (p: void | Promise<void>) => {
    setMark('saving');
    try { await p; setMark('saved'); } catch { setMark(''); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMark(''), 1800);
  };
  return { mark, run };
}
export const Tick = ({ mark }: { mark: Mark }) => <span className={`cell-mark ${mark}`} aria-hidden="true">{mark === 'saved' ? '✓' : mark === 'saving' ? '…' : ''}</span>;

export function TextCell({ value, onSave, label, width, placeholder, flag }: {
  value: string; onSave: (v: string) => void | Promise<void>; label: string; width?: number; placeholder?: string; flag?: boolean;
}) {
  const [v, setV] = useState(value);
  const { mark, run } = useMark();
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) void run(onSave(v)); };
  return (
    <span className="cell">
      <input type="text" value={v} aria-label={label} placeholder={placeholder} style={width ? { width } : undefined}
        className={[flag ? 'flag' : '', mark ? `is-${mark}` : ''].join(' ').trim() || undefined}
        onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <Tick mark={mark} />
    </span>
  );
}

export function NumCell({ value, onSave, label, min, max, step, width, placeholder, blank }: {
  value: number | null; onSave: (v: number | null) => void | Promise<void>; label: string; min: number; max: number; step?: number; width?: number; placeholder?: string; blank?: boolean;
}) {
  const [v, setV] = useState(value === null ? '' : String(value));
  const { mark, run } = useMark();
  useEffect(() => setV(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (v.trim() === '') { if (blank && value !== null) void run(onSave(null)); else setV(value === null ? '' : String(value)); return; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { setV(value === null ? '' : String(value)); return; }
    if (n !== value) void run(onSave(n));
  };
  return (
    <span className="cell">
      <input type="number" inputMode="decimal" min={min} max={max} step={step ?? 1} value={v} aria-label={label} placeholder={placeholder}
        style={{ width: width ?? 70 }} className={mark ? `is-${mark}` : undefined} onChange={(e) => setV(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
      <Tick mark={mark} />
    </span>
  );
}

/** A larger box for free text: saves once, when the person leaves the box (the same marks as the small ones). */
export function AreaCell({ value, onSave, label, max, rows, placeholder }: {
  value: string; onSave: (v: string) => void | Promise<void>; label: string; max: number; rows?: number; placeholder?: string;
}) {
  const [v, setV] = useState(value);
  const { mark, run } = useMark();
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) void run(onSave(v)); };
  return (
    <span className="cell area-cell">
      <textarea value={v} aria-label={label} rows={rows ?? 3} maxLength={max} placeholder={placeholder}
        className={mark ? `is-${mark}` : undefined} onChange={(e) => setV(e.target.value)} onBlur={commit} />
      <Tick mark={mark} />
      <span className="muted area-count">{v.length} of {max}</span>
    </span>
  );
}
