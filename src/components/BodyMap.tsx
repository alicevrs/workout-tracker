import { MUSCLE_LABEL } from '../data/muscles';
import type { MuscleId } from '../db/types';

// Stylised front and back silhouettes. Shapes are drawn for the left half of the figure and
// mirrored. Each muscle region is filled with a color whose intensity is the share of work.

type Shape = { muscle?: MuscleId; d: string };

const FRONT: Shape[] = [
  { muscle: 'neck', d: 'M54 26 L60 26 L60 35 L53 34 Z' },
  { muscle: 'upper_back', d: 'M53 31 L43 36 L53 35 Z' },
  { muscle: 'side_delts', d: 'M39 35 Q31 36 29 45 Q30 50 32 51 Q32 43 39 35 Z' },
  { muscle: 'front_delts', d: 'M39 35 Q45 35 49 39 Q43 44 39 52 Q35 51 32 51 Q32 43 39 35 Z' },
  { muscle: 'chest', d: 'M60 38 L50 39 Q42 45 40 53 Q46 58 60 57 Z' },
  { muscle: 'biceps', d: 'M32 53 Q27 59 27 68 Q29 72 33 72 Q37 64 39 55 Z' },
  { muscle: 'forearms', d: 'M27 73 Q23 83 22 96 L27 97 Q32 86 34 74 Z' },
  { d: 'M21 98 Q20 106 24 108 Q28 106 28 98 Z' },
  { muscle: 'abs', d: 'M60 59 L53 59 L53 90 Q56 94 60 94 Z' },
  { muscle: 'obliques', d: 'M52 59 Q44 57 42 61 Q42 76 45 88 L52 91 Z' },
  { muscle: 'abductors', d: 'M45 89 Q40 93 39 102 L43 106 Q45 97 50 92 Z' },
  { muscle: 'quads', d: 'M43 107 Q39 116 40 132 Q42 146 47 150 L55 148 Q57 132 56 116 L53 99 Q47 97 43 107 Z' },
  { muscle: 'adductors', d: 'M54 96 L60 96 L60 104 Q59 118 56 130 Q56 114 54 100 Z' },
  { d: 'M45 151 Q50 156 55 151 L55 157 Q50 160 45 157 Z' },
  { muscle: 'calves', d: 'M45 159 Q42 171 44 186 Q46 195 48 199 L53 199 Q55 184 55 160 Q50 162 45 159 Z' },
  { d: 'M47 201 L54 201 L55 210 L43 210 Z' },
];

const BACK: Shape[] = [
  { muscle: 'neck', d: 'M54 25 L60 25 L60 32 L54 32 Z' },
  { muscle: 'upper_back', d: 'M60 30 L53 31 L42 37 Q46 47 50 56 L60 64 Z' },
  { muscle: 'side_delts', d: 'M39 35 Q31 36 29 45 L31 48 Q33 40 41 36 Z' },
  { muscle: 'rear_delts', d: 'M41 37 Q33 39 31 48 Q32 51 34 52 Q37 45 45 41 Z' },
  { muscle: 'triceps', d: 'M33 53 Q27 59 27 68 Q29 72 33 72 Q38 63 40 55 Z' },
  { muscle: 'forearms', d: 'M27 73 Q23 83 22 96 L27 97 Q32 86 34 74 Z' },
  { d: 'M21 98 Q20 106 24 108 Q28 106 28 98 Z' },
  { muscle: 'lats', d: 'M44 44 Q40 55 42 66 Q46 76 52 80 L56 70 L50 57 Z' },
  { muscle: 'lower_back', d: 'M57 66 L60 67 L60 92 L53 90 Q52 80 54 72 Z' },
  { muscle: 'abductors', d: 'M52 82 Q44 82 41 93 Q46 89 53 90 Z' },
  { muscle: 'glutes', d: 'M60 93 L53 91 Q42 93 41 104 Q43 114 52 116 Q58 115 60 111 Z' },
  { muscle: 'hamstrings', d: 'M42 117 Q40 131 43 146 L50 150 L56 146 Q58 131 57 118 Q50 120 42 117 Z' },
  { muscle: 'adductors', d: 'M57.5 115 L60 115 L60 121 Q59 132 57.5 138 Q58 127 57.5 115 Z' },
  { d: 'M44 151 Q50 155 56 151 L55 156 Q50 158 45 156 Z' },
  { muscle: 'calves', d: 'M44 157 Q40 167 43 181 Q46 192 49 198 L54 198 Q57 181 55 158 Q50 160 44 157 Z' },
  { d: 'M47 200 L54 200 L55 210 L43 210 Z' },
];

const BASE = '#2a2a2a';
const STOPS: [number, [number, number, number]][] = [
  [0, [60, 54, 24]],
  [0.35, [140, 118, 10]],
  [0.7, [253, 215, 13]],
  [1, [255, 243, 168]],
];

export function heatColor(v: number): string {
  if (!v || v <= 0) return BASE;
  const x = Math.min(1, v);
  for (let i = 1; i < STOPS.length; i++) {
    const [p1, c1] = STOPS[i];
    const [p0, c0] = STOPS[i - 1];
    if (x <= p1) {
      const t = (x - p0) / (p1 - p0);
      const c = c0.map((ch, k) => Math.round(ch + (c1[k] - ch) * t));
      return `rgb(${c[0]},${c[1]},${c[2]})`;
    }
  }
  return 'rgb(255,243,168)';
}

function Figure({ shapes, values, label, pct }: { shapes: Shape[]; values: Partial<Record<MuscleId, number>>; label: string; pct?: Partial<Record<MuscleId, number>> }) {
  const render = (mirror: boolean) =>
    shapes.map((s, i) => {
      const v = s.muscle ? values[s.muscle] ?? 0 : 0;
      const fill = s.muscle ? heatColor(v) : '#1c1c1c';
      const title = s.muscle ? `${MUSCLE_LABEL[s.muscle]}${pct?.[s.muscle] !== undefined ? `: ${Math.round(pct[s.muscle]!)}%` : ''}` : undefined;
      return (
        <path key={`${mirror ? 'r' : 'l'}${i}`} d={s.d} fill={fill} stroke="#0d0d0d" strokeWidth={0.8} strokeLinejoin="round">
          {title && <title>{title}</title>}
        </path>
      );
    });
  return (
    <figure>
      <svg viewBox="16 0 88 214" role="img" aria-label={`${label} view`}>
        <ellipse cx={60} cy={15} rx={8.5} ry={10.5} fill="#1d2128" />
        <g>{render(false)}</g>
        <g transform="translate(120,0) scale(-1,1)">{render(true)}</g>
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

/**
 * values: muscle → 0…1 color intensity. pct (optional) is shown in tooltips.
 */
export function BodyMap({ values, pct, compact = false }: { values: Partial<Record<MuscleId, number>>; pct?: Partial<Record<MuscleId, number>>; compact?: boolean }) {
  const worked = (Object.entries(values) as [MuscleId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <div className="body-map" style={compact ? { maxWidth: 260, margin: '0 auto' } : undefined}>
        <Figure shapes={FRONT} values={values} label="Front" pct={pct} />
        <Figure shapes={BACK} values={values} label="Back" pct={pct} />
      </div>
      <p className="sr-only">
        Muscles worked: {worked.length ? worked.map(([m]) => `${MUSCLE_LABEL[m]}${pct?.[m] !== undefined ? ` ${Math.round(pct[m]!)}%` : ''}`).join(', ') : 'none'}.
      </p>
    </div>
  );
}

export function HeatLegend({ low = 'Less', high = 'More' }: { low?: string; high?: string }) {
  return (
    <div className="row small faint" style={{ gap: 8 }} aria-hidden>
      <span>{low}</span>
      <div className="legend-scale" style={{ flex: 1 }} />
      <span>{high}</span>
    </div>
  );
}
