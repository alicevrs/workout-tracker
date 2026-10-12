import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon, type IconName } from './Icon';

export function PageHeader({
  title,
  back,
  actions,
  subtitle,
}: {
  title: ReactNode;
  back?: string | true;
  actions?: ReactNode;
  subtitle?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <>
      {back && (
        <div>
          {back === true ? (
            <button className="btn ghost small back-link" onClick={() => navigate(-1)}>
              <Icon name="back" /> Back
            </button>
          ) : (
            <Link className="back-link" to={back}>
              <Icon name="back" size={18} /> Back
            </Link>
          )}
        </div>
      )}
      <header className="page-header">
        <div style={{ minWidth: 0 }}>
          <h1 style={{ overflowWrap: 'anywhere' }}>{title}</h1>
          {subtitle && <div className="muted small">{subtitle}</div>}
        </div>
        {actions && <div className="actions">{actions}</div>}
      </header>
    </>
  );
}

export function EmptyState({
  icon = 'info',
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty" role="status">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
      {action && <div className="mt">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Numeric input that keeps a local text state so partially typed values ("7.", "") are not lost. */
export function NumberField({
  value,
  onChange,
  label,
  step = 1,
  min = 0,
  max,
  placeholder,
  stepper = false,
  inputMode = 'decimal',
  hideLabel = false,
  suffix,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
  stepper?: boolean;
  inputMode?: 'decimal' | 'numeric';
  hideLabel?: boolean;
  suffix?: string;
}) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === undefined ? '' : String(value));
    }
  }, [value]);

  const commit = (t: string) => {
    setText(t);
    const normalized = t.replace(',', '.').trim();
    if (normalized === '') {
      last.current = undefined;
      onChange(undefined);
      return;
    }
    const n = Number(normalized);
    if (!Number.isNaN(n)) {
      last.current = n;
      onChange(n);
    }
  };
  const bump = (dir: 1 | -1) => {
    const base = value ?? 0;
    let next = Math.round((base + dir * step) * 1000) / 1000;
    if (next < min) next = min;
    if (max !== undefined && next > max) next = max;
    commit(String(next));
  };

  const input = (
    <input
      type="text"
      inputMode={inputMode}
      value={text}
      placeholder={placeholder}
      aria-label={hideLabel ? label : undefined}
      onChange={(e) => commit(e.target.value)}
      onFocus={(e) => e.target.select()}
    />
  );

  const body = stepper ? (
    <div className="stepper">
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-1)}>
        −
      </button>
      {input}
      <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(1)}>
        +
      </button>
    </div>
  ) : (
    input
  );

  if (hideLabel) return body;
  return (
    <label className="field">
      <span>
        {label}
        {suffix && <span className="faint"> ({suffix})</span>}
      </span>
      {body}
    </label>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row between mb">
          <h2>{title}</h2>
          <button className="btn icon ghost" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const ToastCtx = createContext<(msg: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Delta({ pct }: { pct: number | null }) {
  if (pct === null || !Number.isFinite(pct)) return <span className="faint">–</span>;
  const r = Math.round(pct * 10) / 10;
  if (r === 0) return <span className="muted">0%</span>;
  return (
    <span className={r > 0 ? 'delta-up' : 'delta-down'}>
      {r > 0 ? '▲' : '▼'} {Math.abs(r)}%
    </span>
  );
}
