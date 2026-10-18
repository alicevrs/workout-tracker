import { FLOOR, skeleton, type FrontPose, type Motion, type Prop, type Skeleton } from '../lib/motion';

// Stylised exercise animation: a yellow stick figure moving between two poses (SVG + SMIL, so it
// keeps running without JavaScript and costs nothing when off screen). Equipment in pink.

type P = [number, number];

const reduced = () => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

function anim(attr: string, a: number, b: number, dur: number) {
  if (a === b) return null;
  return (
    <animate
      attributeName={attr}
      values={`${a};${b};${a}`}
      keyTimes="0;0.5;1"
      calcMode="spline"
      keySplines="0.45 0 0.55 1;0.45 0 0.55 1"
      dur={`${dur}s`}
      repeatCount="indefinite"
    />
  );
}

function Seg({ a1, a2, b1, b2, dur, className }: { a1: P; a2: P; b1: P; b2: P; dur: number; className?: string }) {
  return (
    <line x1={a1[0]} y1={a1[1]} x2={a2[0]} y2={a2[1]} className={className}>
      {anim('x1', a1[0], b1[0], dur)}
      {anim('y1', a1[1], b1[1], dur)}
      {anim('x2', a2[0], b2[0], dur)}
      {anim('y2', a2[1], b2[1], dur)}
    </line>
  );
}

function Dot({ a, b, r, dur, className }: { a: P; b: P; r: number; dur: number; className?: string }) {
  return (
    <circle cx={a[0]} cy={a[1]} r={r} className={className}>
      {anim('cx', a[0], b[0], dur)}
      {anim('cy', a[1], b[1], dur)}
    </circle>
  );
}

function Rect({ a, b, w, h, dur, className }: { a: P; b: P; w: number; h: number; dur: number; className?: string }) {
  return (
    <rect x={a[0] - w / 2} y={a[1] - h / 2} width={w} height={h} rx={2} className={className}>
      {anim('x', a[0] - w / 2, b[0] - w / 2, dur)}
      {anim('y', a[1] - h / 2, b[1] - h / 2, dur)}
    </rect>
  );
}

const add = (p: P, dx: number, dy: number): P => [p[0] + dx, p[1] + dy];

/** A point on the figure for a prop. */
function anchor(s: Skeleton, at: 'hand' | 'neck' | 'hip' | 'foot'): P {
  if (at === 'hand') return s.hand;
  if (at === 'neck') return add(s.neck, -2, -3);
  if (at === 'hip') return add(s.hip, 0, -9);
  return s.ankle;
}

function StaticProp({ p }: { p: Prop }) {
  switch (p.kind) {
    case 'bench': {
      const h = p.h ?? 8;
      return (
        <g className="ea-prop">
          <rect x={p.x} y={p.y} width={p.w} height={h} rx={2} />
          {!p.h && (
            <>
              <line x1={p.x + 8} y1={p.y + h} x2={p.x + 8} y2={FLOOR} />
              <line x1={p.x + p.w - 8} y1={p.y + h} x2={p.x + p.w - 8} y2={FLOOR} />
            </>
          )}
        </g>
      );
    }
    case 'bar':
      return <line className="ea-prop" x1={p.x ?? 55} y1={p.y} x2={(p.x ?? 55) + (p.w ?? 90)} y2={p.y} />;
    case 'box':
      return <rect className="ea-prop" x={p.x} y={p.y} width={p.w} height={p.h} rx={2} />;
    case 'wall':
      return <line className="ea-prop" x1={p.x} y1={20} x2={p.x} y2={FLOOR} />;
    case 'line':
      return <line className="ea-prop" x1={p.from[0]} y1={p.from[1]} x2={p.to[0]} y2={p.to[1]} />;
    case 'wheel':
      return <circle className="ea-prop" cx={p.at[0]} cy={p.at[1]} r={p.r} />;
    default:
      return null;
  }
}

function MovingProp({ p, a, b, dur }: { p: Prop; a: Skeleton; b: Skeleton; dur: number }) {
  switch (p.kind) {
    case 'barbell':
    case 'plate':
      return <Dot a={anchor(a, p.at)} b={anchor(b, p.at)} r={p.kind === 'barbell' ? 11 : 8} dur={dur} className="ea-prop ea-fill-soft" />;
    case 'dumbbell':
      return <Rect a={anchor(a, p.at)} b={anchor(b, p.at)} w={15} h={8} dur={dur} className="ea-prop ea-fill" />;
    case 'kettlebell':
      return <Dot a={add(anchor(a, p.at), 0, 7)} b={add(anchor(b, p.at), 0, 7)} r={7} dur={dur} className="ea-prop ea-fill" />;
    case 'ball':
      return <Dot a={anchor(a, p.at)} b={anchor(b, p.at)} r={9} dur={dur} className="ea-prop ea-fill-soft" />;
    case 'cable': {
      const to = p.to === 'foot' ? 'ankle' : 'hand';
      return <Seg a1={p.from} a2={a[to]} b1={p.from} b2={b[to]} dur={dur} className="ea-cable" />;
    }
    default:
      return null;
  }
}

function SideFigure({ motion, still }: { motion: Motion; still: boolean }) {
  const dur = motion.dur ?? 2.4;
  const a = skeleton(motion.a);
  const b = still || !motion.b ? a : skeleton(motion.b);
  const seg = (k1: keyof Skeleton, k2: keyof Skeleton, className?: string) => <Seg a1={a[k1]} a2={a[k2]} b1={b[k1]} b2={b[k2]} dur={dur} className={className} />;
  const props = motion.props ?? [];
  return (
    <>
      {props.map((p, i) => (
        <StaticProp key={`s${i}`} p={p} />
      ))}
      <g className="ea-body ea-far">
        {seg('neck', 'elbow2')}
        {seg('elbow2', 'hand2')}
        {seg('hip', 'knee2')}
        {seg('knee2', 'ankle2')}
        {seg('ankle2', 'toe2')}
      </g>
      <g className="ea-body">
        {seg('hip', 'neck')}
        {seg('hip', 'knee')}
        {seg('knee', 'ankle')}
        {seg('ankle', 'toe')}
        {seg('neck', 'elbow')}
        {seg('elbow', 'hand')}
        <Dot a={a.head} b={b.head} r={9} dur={dur} className="ea-head" />
      </g>
      {props.map((p, i) => (
        <MovingProp key={`m${i}`} p={p} a={a} b={b} dur={dur} />
      ))}
    </>
  );
}

/** Front view joints for side-to-side movements. */
function frontJoints(f: FrontPose) {
  const lift = f.lift ?? 0;
  const hipY = (f.seated ? 122 : 108) - lift;
  const neck: P = [100, hipY - 48];
  const sh = (side: -1 | 1): P => [100 + side * 12, neck[1] + 3];
  const hand = (side: -1 | 1): P => {
    const s = sh(side);
    const r = (f.arms * Math.PI) / 180;
    return [s[0] + side * 48 * Math.sin(r), s[1] + 48 * Math.cos(r)];
  };
  const hip = (side: -1 | 1): P => [100 + side * 7, hipY];
  const knee = (side: -1 | 1): P => {
    const h = hip(side);
    const r = (f.legs * Math.PI) / 180;
    return f.seated ? [h[0] + side * 22 * Math.sin(r) + side * 4, h[1] + 8] : [h[0] + side * 34 * Math.sin(r), h[1] + 34 * Math.cos(r)];
  };
  const ankle = (side: -1 | 1): P => {
    const k = knee(side);
    const r = (f.legs * Math.PI) / 180;
    return f.seated ? [k[0], k[1] + 44] : [k[0] + side * 34 * Math.sin(r), k[1] + 34 * Math.cos(r)];
  };
  return { neck, head: [100, neck[1] - 15] as P, mid: [100, hipY] as P, sh, hand, hip, knee, ankle };
}

function FrontFigure({ motion, still }: { motion: Motion; still: boolean }) {
  const fr = motion.front!;
  const dur = motion.dur ?? 2;
  const a = frontJoints(fr.a);
  const b = frontJoints(still || !fr.b ? fr.a : fr.b);
  const sides = [-1, 1] as const;
  return (
    <>
      {fr.a.seated && <rect className="ea-prop" x={70} y={126} width={60} height={10} rx={2} />}
      <g className="ea-body">
        <Seg a1={a.mid} a2={a.neck} b1={b.mid} b2={b.neck} dur={dur} />
        <Seg a1={a.sh(-1)} a2={a.sh(1)} b1={b.sh(-1)} b2={b.sh(1)} dur={dur} />
        <Seg a1={a.hip(-1)} a2={a.hip(1)} b1={b.hip(-1)} b2={b.hip(1)} dur={dur} />
        {sides.map((s) => (
          <g key={s}>
            <Seg a1={a.sh(s)} a2={a.hand(s)} b1={b.sh(s)} b2={b.hand(s)} dur={dur} />
            <Seg a1={a.hip(s)} a2={a.knee(s)} b1={b.hip(s)} b2={b.knee(s)} dur={dur} />
            <Seg a1={a.knee(s)} a2={a.ankle(s)} b1={b.knee(s)} b2={b.ankle(s)} dur={dur} />
          </g>
        ))}
        <Dot a={a.head} b={b.head} r={9} dur={dur} className="ea-head" />
      </g>
      {(fr.props ?? []).some((p) => p.kind === 'dumbbell') &&
        sides.map((s) => <Rect key={s} a={a.hand(s)} b={b.hand(s)} w={8} h={15} dur={dur} className="ea-prop ea-fill" />)}
    </>
  );
}

/** The animation of an exercise (side view, or front view for sideways movements). */
export function ExerciseAnimation({ motion, label }: { motion: Motion; label: string }) {
  const still = reduced();
  return (
    <svg className="ex-anim" viewBox="0 0 200 200" role="img" aria-label={label}>
      <line className="ea-floor" x1={8} y1={FLOOR + 1} x2={192} y2={FLOOR + 1} />
      {motion.front ? <FrontFigure motion={motion} still={still} /> : <SideFigure motion={motion} still={still} />}
    </svg>
  );
}
