import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ACCENT, AXIS, ChartTooltip, GRID } from '../components/charts';
import { Icon } from '../components/Icon';
import { InfoButton, LibraryList } from '../components/Library';
import { PageHeader, useToast } from '../components/ui';
import { db } from '../db/db';
import type { Visit } from '../db/types';
import { formatDate, formatShortDate, fromDateKey } from '../lib/dates';
import { setDraft } from '../lib/drafts';
import { bmi, newVisit } from '../lib/nutrition';

/** Value of a chart measure in a visit: weight, BMI or a measure by name. */
function valueOf(v: Visit, key: string): number | undefined {
  if (key === 'weight') return v.weightKg;
  if (key === 'bmi') return bmi(v.weightKg, v.heightCm);
  return v.measures.find((m) => m.name === key)?.value;
}

/** Nutrition visits: measurements over time. */
export default function VisitsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const visits = useLiveQuery(() => db.visits.orderBy('date').reverse().toArray(), []);
  const [measure, setMeasure] = useState('weight');

  // Chart choices: only measures that have values.
  const choices = useMemo(() => {
    const out: { key: string; label: string; unit: string }[] = [];
    const list = visits ?? [];
    if (list.some((v) => v.weightKg)) out.push({ key: 'weight', label: 'Weight', unit: 'kg' });
    if (list.some((v) => bmi(v.weightKg, v.heightCm))) out.push({ key: 'bmi', label: 'BMI', unit: '' });
    for (const v of list) for (const m of v.measures) if (m.value !== undefined && !out.some((o) => o.key === m.name)) out.push({ key: m.name, label: m.name, unit: m.unit });
    return out;
  }, [visits]);
  const current = choices.find((c) => c.key === measure) ?? choices[0];
  const data = current
    ? [...(visits ?? [])]
        .reverse()
        .map((v) => ({ date: fromDateKey(v.date).getTime(), value: valueOf(v, current.key) }))
        .filter((d) => d.value !== undefined)
    : [];

  const create = async () => {
    const last = await db.visits.orderBy('date').last();
    const v = newVisit(last);
    setDraft(`visit:${v.id}`, v, true); // stored only when saved
    navigate(`/nutrition/visits/${v.id}?draft=1`);
  };
  const remove = async (id: string) => {
    const v = await db.visits.get(id);
    if (!v || !confirm(`Delete the visit of ${formatDate(fromDateKey(v.date).getTime())}?`)) return;
    await db.visits.delete(id);
    toast('Visit deleted');
  };

  return (
    <div className="page">
      <PageHeader
        title="Visits"
        back="/nutrition"
        actions={
          <InfoButton title="Visits">
            <p style={{ margin: 0 }}>The measurements taken at each nutrition visit: weight, height, circumferences (cm), skinfolds (mm) and anything else you add.</p>
            <p style={{ margin: 0 }}>A new visit starts with the measures of the last one, ready to fill in. The chart shows how a measure changes from visit to visit.</p>
            <p style={{ margin: 0 }}>The weight of a visit is also added to the weight log, so calorie estimates of workouts use it.</p>
          </InfoButton>
        }
      />
      <div className="big-buttons" style={{ paddingTop: 8 }}>
        <button className="big-btn" onClick={create}>
          <Icon name="plus" /> New visit
        </button>
      </div>
      <div className="stack">
        {current && data.length > 1 && (
          <section className="card">
            <label className="field">
              <span className="sr-only">Measure</span>
              <select value={current.key} onChange={(e) => setMeasure(e.target.value)}>
                {choices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="chart-box mt-s" style={{ height: 200 }}>
              <ResponsiveContainer>
                <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="date" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={(v) => formatShortDate(v)} {...AXIS} />
                  <YAxis domain={['auto', 'auto']} {...AXIS} width={44} />
                  <Tooltip content={<ChartTooltip format={(v) => `${v}${current.unit ? ` ${current.unit}` : ''}`} labelFormat={(l) => formatShortDate(Number(l))} />} />
                  <Line type="monotone" dataKey="value" name={current.label} stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: 'var(--bg-elev)', strokeWidth: 2 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
        <LibraryList
          items={(visits ?? []).map((v) => ({
            id: v.id,
            name: formatDate(fromDateKey(v.date).getTime()),
            sub: v.weightKg ? `${v.weightKg} kg` : undefined,
            to: `/nutrition/visits/${v.id}`,
          }))}
          onDelete={remove}
          empty="No visits yet."
        />
      </div>
    </div>
  );
}
