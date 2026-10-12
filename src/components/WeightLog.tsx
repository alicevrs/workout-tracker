import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { db } from '../db/db';
import { useProfile } from '../db/repo';
import { formatShortDate, fromDateKey, toDateKey } from '../lib/dates';
import { uid } from '../lib/ids';
import { fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { ACCENT, AXIS, ChartTooltip, GRID } from './charts';
import { Icon } from './Icon';
import { NumberField } from './ui';

export function WeightLog() {
  const { unit } = useProfile();
  const log = useLiveQuery(() => db.bodyWeights.orderBy('date').toArray(), []);
  const [date, setDate] = useState(toDateKey(Date.now()));
  const [value, setValue] = useState<number | undefined>();

  const add = async () => {
    const kg = fromDisplayWeight(value, unit);
    if (!kg || !date) return;
    const existing = await db.bodyWeights.where('date').equals(date).first();
    await db.bodyWeights.put({ id: existing?.id ?? uid(), date, weightKg: kg });
    setValue(undefined);
  };

  const data = (log ?? []).map((w) => ({ date: fromDateKey(w.date).getTime(), value: toDisplayWeight(w.weightKg, unit) }));

  return (
    <div className="stack">
      <p className="small muted">Calorie estimates use the weight logged nearest to each workout date. Your profile weight is used when the log is empty.</p>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <label className="field" style={{ flex: 1.2 }}>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div style={{ flex: 1 }}>
          <NumberField label="Weight" suffix={unit} value={value} onChange={setValue} />
        </div>
        <button className="btn primary" onClick={add} disabled={!value} aria-label="Add weight entry">
          <Icon name="plus" />
        </button>
      </div>
      {data.length > 1 && (
        <div className="chart-box" style={{ height: 180 }}>
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(v) => formatShortDate(v)} {...AXIS} />
              <YAxis domain={['auto', 'auto']} {...AXIS} width={44} />
              <Tooltip content={<ChartTooltip format={(v) => `${v} ${unit}`} labelFormat={(l) => formatShortDate(Number(l))} />} />
              <Line type="monotone" dataKey="value" name="Body weight" stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: 'var(--bg-elev)', strokeWidth: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {log && log.length > 0 && (
        <ul className="list">
          {[...log].reverse().slice(0, 12).map((w) => (
            <li key={w.id} className="row between" style={{ minHeight: 44 }}>
              <span>{formatShortDate(fromDateKey(w.date).getTime())} {fromDateKey(w.date).getFullYear()}</span>
              <span className="row">
                <strong className="num">
                  {toDisplayWeight(w.weightKg, unit)} {unit}
                </strong>
                <button className="btn icon small ghost" aria-label={`Delete weight entry of ${w.date}`} onClick={() => db.bodyWeights.delete(w.id)}>
                  <Icon name="trash" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
