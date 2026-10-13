import { useId, type ReactNode } from 'react';
import { MR_RING, MR_X } from './mrSymbol';

// The timer ring is the Monday Resolution circle: a faint copy is the track and the real brush
// stroke is revealed clockwise from its tail as the phase runs, so the symbol "draws itself".
// When `complete` is set the X is drawn in as well and the full symbol appears.

const C = 2 * Math.PI * 304; // circumference of the reveal circle (mid-line of the ring)
const START_DEG = -125; // angle of the brush stroke's tail (top left)

export function BrandRing({
  progress,
  phaseKey,
  complete = false,
  children,
  onClick,
  label,
}: {
  /** 0…1 of the ring that is drawn. */
  progress: number;
  /** Changes when a new phase starts, so the ring restarts without animating backwards. */
  phaseKey: string | number;
  complete?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  label?: string;
}) {
  const id = useId().replace(/:/g, '');
  const p = Math.min(1, Math.max(0, complete ? 1 : progress));
  const content = (
    <>
      <svg viewBox="0 0 676 676.1" className="ring-svg" aria-hidden>
        <defs>
          <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="676" height="676.1">
            <rect width="676" height="676.1" fill="#000" />
            <circle
              key={phaseKey}
              className="ring-reveal"
              cx="338"
              cy="338"
              r="304"
              fill="none"
              stroke="#fff"
              strokeWidth="112"
              strokeDasharray={`${C} ${C}`}
              strokeDashoffset={C * (1 - p)}
              transform={`rotate(${START_DEG} 338 338)`}
            />
          </mask>
        </defs>
        <path d={MR_RING} fill="currentColor" opacity={0.16} />
        <path d={MR_RING} fill="currentColor" mask={`url(#m${id})`} />
        {complete ? (
          MR_X.map((d, i) => <path key={i} d={d} fill="currentColor" className={`ring-x ring-x-${i}`} />)
        ) : (
          MR_X.map((d, i) => <path key={i} d={d} fill="currentColor" opacity={0.05} />)
        )}
      </svg>
      <div className="ring-content">{children}</div>
    </>
  );
  return onClick ? (
    <button type="button" className="ring-wrap" onClick={onClick} aria-label={label}>
      {content}
    </button>
  ) : (
    <div className="ring-wrap">{content}</div>
  );
}

/** The full symbol, e.g. for the finished screen. */
export function BrandSymbol({ size = 120 }: { size?: number }) {
  return (
    <svg viewBox="0 0 676 676.1" width={size} height={size} aria-hidden style={{ color: 'var(--accent)' }}>
      <path d={MR_RING} fill="currentColor" />
      {MR_X.map((d, i) => (
        <path key={i} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

/** Loading indicator: the Monday Resolution circle drawing itself over and over. */
export function BrandLoader({ label = 'Loading' }: { label?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <div className="brand-loader" role="status" aria-label={label}>
      <svg viewBox="0 0 676 676.1" aria-hidden>
        <defs>
          <mask id={`l${id}`} maskUnits="userSpaceOnUse" x="0" y="0" width="676" height="676.1">
            <rect width="676" height="676.1" fill="#000" />
            <circle className="brand-loader-reveal" cx="338" cy="338" r="304" fill="none" stroke="#fff" strokeWidth="112" strokeDasharray={`${C} ${C}`} transform={`rotate(${START_DEG} 338 338)`} />
          </mask>
        </defs>
        <path d={MR_RING} fill="currentColor" opacity={0.15} />
        <path d={MR_RING} fill="currentColor" mask={`url(#l${id})`} />
        {MR_X.map((d, i) => (
          <path key={i} d={d} fill="currentColor" opacity={0.15} />
        ))}
      </svg>
    </div>
  );
}

