import { setVolume, type ExerciseKind } from '@/rules/workout';
import { fromPounds } from '@/rules/units';

// The graph (spec Section 2, "Records, stats and graph"): one bar per set by
// session, bar height is weight and the number above is reps; a line shows
// session volume on a right-hand scale. A bodyweight exercise has equal bars
// (1 BW) and the line shows total reps. Weights show in the planner's view unit.
export interface GraphSession { label: string; sets: { lb: number | null; reps: number; type: 'warm_up' | 'working' | 'drop' }[] }

export function Graph({ sessions, unit, kind }: { sessions: GraphSession[]; unit: 'lb' | 'kg' | 'bw'; kind: ExerciseKind }) {
  if (!sessions.length) return <div className="muted">No history yet. Sets logged on the phone appear here.</div>;
  const bw = unit === 'bw';
  const h = (lb: number | null) => (bw || lb === null ? 1 : unit === 'lb' ? lb : fromPounds(lb, unit));
  const maxBar = Math.max(...sessions.flatMap((x) => x.sets.map((y) => h(y.lb))), 1);
  const repsOnly = bw || kind.assisted;
  const vols = sessions.map((x) => {
    const v = x.sets.reduce((a, y) => a + setVolume({ id: '', lb: y.lb, reps: y.reps, type: y.type, day: '', order: 0 }, kind), 0);
    return bw || repsOnly ? v : unit === 'lb' ? v : fromPounds(v, unit);
  });
  const maxVol = Math.max(...vols, 1);
  const W = 340, H = 160, x0 = 34, x1 = W - 40, y0 = 26, y1 = H - 6, cw = (x1 - x0) / sessions.length;
  const pts: string[] = [];
  const bars = sessions.map((x, i) => {
    const n = Math.max(1, x.sets.length);
    const bwid = Math.min(14, (cw - 8) / n);
    const sx = x0 + cw * i + cw / 2 - (n * bwid) / 2;
    pts.push(`${(x0 + cw * i + cw / 2).toFixed(1)},${(y1 - (vols[i] / maxVol) * (y1 - y0)).toFixed(1)}`);
    return (
      <g key={i}>
        {x.sets.map((y, j) => {
          const ht = bw ? y1 - y0 - 14 : (h(y.lb) / maxBar) * (y1 - y0 - 14);
          return (
            <g key={j}>
              <rect x={sx + j * bwid} y={y1 - ht} width={Math.max(1, bwid - 1)} height={ht} className="g-bar" />
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
      <div className="muted">Each bar is one set: height is {bw ? 'the same for every set (1 BW)' : `weight in ${unit}`}, the number above is reps. The line is session {repsOnly ? 'total reps' : 'volume'}.</div>
    </>
  );
}
