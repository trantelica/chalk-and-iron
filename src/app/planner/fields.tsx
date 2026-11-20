'use client';
import { useEffect, useState } from 'react';

// Small boxes that keep what is being typed until the person leaves the box or
// presses Enter, then save once.

export function TextCell({ value, onSave, label, width, placeholder, flag }: {
  value: string; onSave: (v: string) => void | Promise<void>; label: string; width?: number; placeholder?: string; flag?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => { if (v !== value) void onSave(v); };
  return (
    <input type="text" value={v} aria-label={label} placeholder={placeholder} style={width ? { width } : undefined}
      className={flag ? 'flag' : undefined}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

export function NumCell({ value, onSave, label, min, max, step, width, placeholder, blank }: {
  value: number | null; onSave: (v: number | null) => void | Promise<void>; label: string; min: number; max: number; step?: number; width?: number; placeholder?: string; blank?: boolean;
}) {
  const [v, setV] = useState(value === null ? '' : String(value));
  useEffect(() => setV(value === null ? '' : String(value)), [value]);
  const commit = () => {
    if (v.trim() === '') { if (blank && value !== null) void onSave(null); else setV(value === null ? '' : String(value)); return; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) { setV(value === null ? '' : String(value)); return; }
    if (n !== value) void onSave(n);
  };
  return (
    <input type="number" inputMode="decimal" min={min} max={max} step={step ?? 1} value={v} aria-label={label} placeholder={placeholder}
      style={{ width: width ?? 70 }} onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}
