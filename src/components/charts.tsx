import { useState, type ReactNode } from 'react';

// Chart chrome for the dark theme. Categorical slots validated (CVD, contrast) against the
// card surface #14171c with the dataviz palette validator; keep the order fixed.
export const SERIES = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];
export const OTHER = '#6f6f6f';
/** Brand highlight for single-measure charts. */
export const ACCENT = '#fdd70d';
/** Neutral partner for two-period comparisons (current = ACCENT). */
export const PREVIOUS = '#8a8a8a';
/** Sequential yellow ramp for the heatmap, on a dark surface: low = dark. */
export const SEQ = ['#222222', '#5c4f0a', '#9c840c', '#d4b40d', '#fdd70d'];

export const GRID = { stroke: '#2a2a2a', strokeDasharray: '0', vertical: false } as const;
export const AXIS = {
  stroke: '#383835',
  tick: { fill: '#898781', fontSize: 12 },
  tickLine: false,
  axisLine: { stroke: '#383835' },
} as const;

type TooltipPayload = { name?: string; value?: number | string; color?: string; dataKey?: string | number; payload?: Record<string, unknown> };

export function ChartTooltip({
  active,
  payload,
  label,
  format = (v) => String(v),
  labelFormat = (l) => String(l),
}: {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string | number;
  format?: (v: number, name?: string) => string;
  labelFormat?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="custom-tooltip">
      <div className="tiny faint" style={{ marginBottom: 4 }}>
        {labelFormat(label ?? '')}
      </div>
      {payload.map((p, i) => (
        <div key={i} className="row" style={{ gap: 8 }}>
          <span style={{ width: 12, height: 2, background: p.color, display: 'inline-block' }} />
          <strong className="num" style={{ color: 'var(--text)' }}>
            {typeof p.value === 'number' ? format(p.value, p.name) : p.value}
          </strong>
          <span className="small muted">{p.name}</span>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean }[] }) {
  return (
    <div className="row wrap small muted" style={{ gap: 14 }}>
      {items.map((i) => (
        <span key={i.label} className="row" style={{ gap: 6 }}>
          <span style={{ width: 14, height: i.line ? 2 : 10, borderRadius: i.line ? 0 : 2, background: i.color, display: 'inline-block' }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Card wrapper for a chart with a title, optional controls and a table view toggle. */
export function ChartCard({
  title,
  controls,
  children,
  table,
  className = '',
  footer,
}: {
  title: string;
  controls?: ReactNode;
  children: ReactNode;
  table?: { columns: string[]; rows: (string | number)[][] };
  className?: string;
  footer?: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`card ${className}`} aria-label={title}>
      <div className="card-title">
        <h2>{title}</h2>
        {table && (
          <button className="btn small ghost" onClick={() => setShowTable(!showTable)} aria-pressed={showTable}>
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>
      {controls && <div className="row wrap mb" style={{ gap: 8 }}>{controls}</div>}
      {showTable && table ? (
        <div style={{ maxHeight: 320, overflow: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                {table.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
      {footer}
    </section>
  );
}
