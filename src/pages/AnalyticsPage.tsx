import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BodyMap, HeatLegend } from '../components/BodyMap';
import { ACCENT, AXIS, ChartCard, ChartTooltip, GRID, Legend, OTHER, PREVIOUS, SERIES } from '../components/charts';
import { Icon } from '../components/Icon';
import { Delta, EmptyState, PageHeader, Segmented, Stat } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { MuscleId, Session, WeightUnit } from '../db/types';
import { useCalories } from '../hooks/useCalories';
import {
  BLOCK_MEASURES,
  blockProgressItems,
  bucketize,
  comparisonRanges,
  countBy,
  cumulative,
  EXERCISE_MEASURES,
  exerciseProgressItems,
  inRange,
  measuresWithData,
  METRIC_LABEL,
  metricValue,
  paceSeries,
  pctChange,
  periodTotals,
  WORKOUT_MEASURES,
  workoutProgressItems,
  type ComparePreset,
  type Metric,
  type Range,
  type ValueKind,
} from '../lib/analytics';
import { ageOn, bmrMifflin, netExerciseKcal, weightOn } from '../lib/calories';
import { addDays, addMonths, DAY_MS, formatClock, formatDuration, formatShortDate, fromDateKey, startOfDay, startOfMonth, startOfWeek, toDateKey, type Grain } from '../lib/dates';
import { muscleLoad, muscleShares } from '../lib/muscleLoad';
import { compact, KG_PER_LB } from '../lib/units';
import { activeDays, activityMix, historyFilterKey } from '../lib/activities';
import { PeriodPicker } from '../components/PeriodPicker';
import { GROUP_INFO, type SportGroup } from '../data/sports';

type RangeKey = '1w' | '1m' | '3m' | '6m' | '12m' | 'all';
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '1w', label: 'Week' },
  { value: '1m', label: 'Month' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All' },
];

function rangeStart(key: RangeKey, sessions: Session[], now: number): number {
  switch (key) {
    case '1w':
      return startOfWeek(now);
    case '1m':
      return startOfMonth(now);
    case '3m':
      return addMonths(startOfMonth(now), -2);
    case '6m':
      return addMonths(startOfMonth(now), -5);
    case '12m':
      return addMonths(startOfMonth(now), -11);
    case 'all':
      return sessions.length ? startOfDay(Math.min(...sessions.map((s) => s.startedAt))) : startOfWeek(now);
  }
}

const vol = (kg: number, unit: WeightUnit) => (unit === 'kg' ? kg : kg / KG_PER_LB);

function fmtMetric(m: Metric, v: number, unit: WeightUnit): string {
  switch (m) {
    case 'volume':
      return `${compact(vol(v, unit))} ${unit}`;
    case 'duration':
      return v >= 120 ? `${(v / 60).toFixed(1)} h` : `${Math.round(v)} min`;
    case 'calories':
      return `${compact(v)} kcal`;
    case 'distance':
      return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} km`;
    default:
      return compact(v);
  }
}

export default function AnalyticsPage() {
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('completed').sortBy('startedAt'), []);
  const exercises = useExerciseMap();
  const { unit } = useProfile();
  const { calories } = useCalories();
  const [rangeKey, setRangeKey] = useState<RangeKey>('1m');
  const programs = useLiveQuery(() => db.programs.toArray(), []);
  const now = Date.now();

  if (!sessions) return <div className="page" />;
  if (sessions.length === 0)
    return (
      <div className="page">
        <PageHeader title="Analytics" />
        <div className="card">
          <EmptyState icon="chart" title="No data yet" action={<Link className="btn primary" to="/">Start a workout</Link>}>
            Charts appear after your first finished workout or imported activity.
          </EmptyState>
        </div>
      </div>
    );

  const from = rangeStart(rangeKey, sessions, now);
  const inPeriod = inRange(sessions, from, now);
  const kcal = (s: Session) => calories(s).kcal ?? 0;
  const names = new Map((programs ?? []).map((p) => [p.id, p.name]));
  /** What a session is: a workout by its name, an activity by its sport. */
  const kindOf = (s: Session) => historyFilterKey(s, (id) => names.get(id));

  return (
    <div className="page wide">
      <PageHeader title="Analytics" />
      <div className="row wrap mb" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: '6px 0' }}>
        <Segmented<RangeKey> label="Period" value={rangeKey} onChange={setRangeKey} options={RANGE_OPTIONS} />
      </div>

      <Overview sessions={inPeriod} kindOf={kindOf} unit={unit} kcal={kcal} from={from} now={now} />

      <div className="grid two-wide mt">
        <Progress sessions={inPeriod} unit={unit} kcal={kcal} kindOf={kindOf} names={(id) => exercises.get(id)?.name ?? id} />
        <PeriodComparison sessions={sessions} unit={unit} kcal={kcal} now={now} />
        <ActivityMixChart sessions={inPeriod} from={from} now={now} />
        <CumulativeChart sessions={inPeriod} from={from} now={now} unit={unit} kcal={kcal} />
        <Frequency sessions={inPeriod} from={from} now={now} />
        <MuscleDistribution sessions={sessions} now={now} />
        <CaloriesChart sessions={inPeriod} from={from} now={now} />
      </div>
    </div>
  );
}

type KindOf = (s: Session) => { key: string; label: string; workout: boolean };

function Overview({ sessions, kindOf, unit, kcal, from, now }: { sessions: Session[]; kindOf: KindOf; unit: WeightUnit; kcal: (s: Session) => number; from: number; now: number }) {
  const t = periodTotals(sessions, kcal);
  const days = activeDays(sessions, from, Math.min(now, startOfDay(now) + DAY_MS - 1));
  const workouts = sessions.filter((s) => kindOf(s).workout);
  const activities = sessions.filter((s) => !kindOf(s).workout);
  const list = (items: { label: string; n: number }[]) =>
    items.map((c) => (
      <div key={c.label}>
        {c.n} × {c.label}
      </div>
    ));
  return (
    <div className="stat-tiles">
      <Stat label="Workouts" value={workouts.length} sub={workouts.length ? list(countBy(workouts, kindOf)) : undefined} />
      <Stat label="Activities" value={activities.length} sub={activities.length ? list(countBy(activities, kindOf)) : undefined} />
      <Stat label="Active days" value={days.activeDays} sub={`of ${days.days} · ${days.days ? Math.round((days.activeDays / days.days) * 100) : 0}%`} />
      <Stat label="Distance" value={`${t.distance >= 100 ? Math.round(t.distance) : t.distance.toFixed(1)} km`} />
      <Stat label="Total time" value={formatDuration(t.duration * 60)} />
      <Stat label="Volume" value={`${compact(vol(t.volume, unit))} ${unit}`} sub={`${compact(t.reps)} reps · ${t.sets} sets`} />
      <Stat label="Calories" value={`${compact(t.calories)} kcal`} sub="approximate" />
    </div>
  );
}

type ProgressOf = 'exercise' | 'block' | 'workout';

function fmtKind(kind: ValueKind, v: number, unit: WeightUnit): string {
  switch (kind) {
    case 'weight':
      return `${Math.round(v * 10) / 10} ${unit}`;
    case 'volume':
      return `${compact(v)} ${unit}`;
    case 'clock':
      return formatClock(v);
    case 'minutes':
      return v >= 120 ? `${(v / 60).toFixed(1)} h` : `${Math.round(v)} min`;
    case 'km':
      return `${v >= 100 ? Math.round(v) : Math.round(v * 10) / 10} km`;
    case 'kcal':
      return `${compact(v)} kcal`;
    default:
      return compact(v);
  }
}

/** Progress over time of one exercise, training block or workout; only measures with data are offered. */
function Progress({ sessions, unit, kcal, kindOf, names }: { sessions: Session[]; unit: WeightUnit; kcal: (s: Session) => number; kindOf: KindOf; names: (id: string) => string }) {
  const [params] = useSearchParams();
  const [of, setOf] = useState<ProgressOf>('exercise');
  const [chosen, setChosen] = useState<Record<ProgressOf, string>>({ exercise: params.get('exercise') ?? '', block: '', workout: '' });
  const [measure, setMeasure] = useState<Record<ProgressOf, string>>({ exercise: 'e1rm', block: 'volume', workout: 'duration' });
  const items = useMemo(
    () => (of === 'exercise' ? exerciseProgressItems(sessions, names) : of === 'block' ? blockProgressItems(sessions) : workoutProgressItems(sessions, kindOf, kcal)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [of, sessions],
  );
  const all = of === 'exercise' ? EXERCISE_MEASURES : of === 'block' ? BLOCK_MEASURES : WORKOUT_MEASURES;
  const item = items.find((i) => i.id === chosen[of]) ?? items[0];
  const measures = measuresWithData(item, all);
  const m = measures.find((x) => x.key === measure[of]) ?? measures[0];
  const show = (v: number) => (m && (m.kind === 'weight' || m.kind === 'volume') ? vol(v, unit) : v);
  const data = item && m ? item.points.map((p) => ({ date: p.date, value: show(p.values[m.key] ?? 0) })) : [];
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;
  const fmt = (v: number) => (m ? fmtKind(m.kind, v, unit) : String(v));

  return (
    <ChartCard
      title="Progress"
      controls={
        <>
          <Segmented<ProgressOf>
            label="Progress of"
            value={of}
            onChange={setOf}
            options={[
              { value: 'exercise', label: 'Exercises' },
              { value: 'block', label: 'Training blocks' },
              { value: 'workout', label: 'Workouts' },
            ]}
          />
          {items.length > 0 && (
            <select aria-label="Item" value={item?.id ?? ''} onChange={(e) => setChosen({ ...chosen, [of]: e.target.value })} style={{ flex: '1 1 200px', width: 'auto' }}>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          )}
          {measures.length > 0 && (
            <select aria-label="Measure" value={m?.key ?? ''} onChange={(e) => setMeasure({ ...measure, [of]: e.target.value })} style={{ flex: '1 1 160px', width: 'auto' }}>
              {measures.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label}
                </option>
              ))}
            </select>
          )}
        </>
      }
      footer={
        data.length > 1 ? (
          <p className="small muted mt-s">
            {formatShortDate(data[0].date)} → {formatShortDate(data[data.length - 1].date)}: {fmt(first)} → <strong style={{ color: 'var(--text)' }}>{fmt(last)}</strong> <Delta pct={pctChange(last, first)} />
          </p>
        ) : null
      }
    >
      {data.length === 0 ? (
        <EmptyState icon="chart" title="Nothing logged in this period" />
      ) : (
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => formatShortDate(v)} {...AXIS} minTickGap={24} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => (m?.kind === 'clock' ? formatClock(v) : compact(v))} domain={['auto', 'auto']} />
              <Tooltip cursor={{ stroke: '#898781', strokeWidth: 1 }} content={<ChartTooltip labelFormat={(l) => formatShortDate(Number(l))} format={fmt} />} />
              <Line type="monotone" dataKey="value" name={m?.label} stroke={ACCENT} strokeWidth={2} dot={{ r: 4, fill: ACCENT, stroke: '#161616', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

const COMPARE_METRICS: Metric[] = ['sessions', 'duration', 'distance', 'volume', 'sets', 'reps', 'calories'];

function PeriodComparison({ sessions, unit, kcal, now }: { sessions: Session[]; unit: WeightUnit; kcal: (s: Session) => number; now: number }) {
  const [preset, setPreset] = useState<ComparePreset>('month');
  const [paceMetric, setPaceMetric] = useState<Metric>('volume');
  const today = toDateKey(now);
  const [custom, setCustom] = useState({ aFrom: toDateKey(addDays(now, -13)), aTo: today, bFrom: toDateKey(addDays(now, -27)), bTo: toDateKey(addDays(now, -14)) });

  let ranges: [Range, Range];
  if (preset === 'custom') {
    const r = (f: string, t: string, label: string): Range => ({ from: fromDateKey(f).getTime(), to: fromDateKey(t).getTime() + DAY_MS - 1, label });
    ranges = [r(custom.aFrom, custom.aTo, 'Range A'), r(custom.bFrom, custom.bTo, 'Range B')];
  } else ranges = comparisonRanges(preset, now);
  const [a, b] = ranges;
  const sa = inRange(sessions, a.from, a.to);
  const sb = inRange(sessions, b.from, b.to);
  const ta = periodTotals(sa, kcal);
  const tb = periodTotals(sb, kcal);
  const days = Math.max(1, Math.round((Math.max(a.to - a.from, b.to - b.from) + 1) / DAY_MS));
  const pace = paceSeries(sa, a.from, sb, b.from, Math.min(days, 400), (s) => metricValue(s, paceMetric, kcal)).map((p) => ({
    ...p,
    current: p.day <= Math.ceil((Math.min(now, a.to) - a.from + 1) / DAY_MS) ? (paceMetric === 'volume' ? vol(p.current, unit) : p.current) : null,
    previous: paceMetric === 'volume' ? vol(p.previous, unit) : p.previous,
  }));

  return (
    <ChartCard
      title="Period comparison"
      controls={
        <Segmented<ComparePreset>
          label="Compare"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
      }
    >
      {preset === 'custom' && (
        <div className="form-grid four mb">
          <label className="field">
            A from
            <input type="date" value={custom.aFrom} onChange={(e) => setCustom({ ...custom, aFrom: e.target.value })} />
          </label>
          <label className="field">
            A to
            <input type="date" value={custom.aTo} onChange={(e) => setCustom({ ...custom, aTo: e.target.value })} />
          </label>
          <label className="field">
            B from
            <input type="date" value={custom.bFrom} onChange={(e) => setCustom({ ...custom, bFrom: e.target.value })} />
          </label>
          <label className="field">
            B to
            <input type="date" value={custom.bTo} onChange={(e) => setCustom({ ...custom, bTo: e.target.value })} />
          </label>
        </div>
      )}
      <table className="data-table mb">
        <thead>
          <tr>
            <th />
            <th>
              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: ACCENT }} /> {a.label}
              </span>
            </th>
            <th>
              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: PREVIOUS }} /> {b.label}
              </span>
            </th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {COMPARE_METRICS.map((m) => (
            <tr key={m}>
              <td>{METRIC_LABEL[m]}</td>
              <td>
                <strong>{fmtMetric(m, ta[m], unit)}</strong>
              </td>
              <td className="muted">{fmtMetric(m, tb[m], unit)}</td>
              <td>
                <Delta pct={pctChange(ta[m], tb[m])} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row between wrap" style={{ gap: 8 }}>
        <span className="small muted">Running total by day</span>
        <select aria-label="Pace metric" value={paceMetric} onChange={(e) => setPaceMetric(e.target.value as Metric)} style={{ width: 'auto', minHeight: 38, padding: '4px 32px 4px 10px' }}>
          {COMPARE_METRICS.map((m) => (
            <option key={m} value={m}>
              {METRIC_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="chart-box" style={{ height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={pace} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="day" {...AXIS} tickFormatter={(v) => `Day ${v}`} minTickGap={30} />
            <YAxis {...AXIS} width={48} tickFormatter={(v) => compact(v)} />
            <Tooltip cursor={{ stroke: '#898781', strokeWidth: 1 }} content={<ChartTooltip labelFormat={(l) => `Day ${l}`} format={(v) => fmtMetric(paceMetric, paceMetric === 'volume' ? (unit === 'kg' ? v : v * KG_PER_LB) : v, unit)} />} />
            <Line type="monotone" dataKey="previous" name={b.label} stroke={PREVIOUS} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="current" name={a.label} stroke={ACCENT} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: a.label, color: ACCENT, line: true },
          { label: b.label, color: PREVIOUS, line: true },
        ]}
      />
    </ChartCard>
  );
}

const CUM_METRICS: Metric[] = ['volume', 'duration', 'distance', 'reps', 'sets', 'calories', 'sessions'];

function CumulativeChart({ sessions, from, now, unit, kcal }: { sessions: Session[]; from: number; now: number; unit: WeightUnit; kcal: (s: Session) => number }) {
  const [metric, setMetric] = useState<Metric>('volume');
  const [grain, setGrain] = useState<Grain>('week');
  const [running, setRunning] = useState(false);
  const raw = bucketize(sessions, grain, from, now, (s) => metricValue(s, metric, kcal));
  const data = (running ? cumulative(raw) : raw).map((b) => ({ ...b, value: metric === 'volume' ? vol(b.value, unit) : b.value }));
  const fmt = (v: number) => fmtMetric(metric, metric === 'volume' ? (unit === 'kg' ? v : v * KG_PER_LB) : v, unit);

  return (
    <ChartCard
      title={`${running ? 'Running total' : 'Total'} ${METRIC_LABEL[metric].toLowerCase()} by ${grain}`}
      controls={
        <>
          <select aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)} style={{ width: 'auto', flex: '1 1 120px' }}>
            {CUM_METRICS.map((m) => (
              <option key={m} value={m}>
                {METRIC_LABEL[m]}
              </option>
            ))}
          </select>
          <Segmented<Grain>
            label="Group by"
            value={grain}
            onChange={setGrain}
            options={[
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'year', label: 'Year' },
            ]}
          />
          <Segmented<'per' | 'run'>
            label="View"
            value={running ? 'run' : 'per'}
            onChange={(v) => setRunning(v === 'run')}
            options={[
              { value: 'per', label: 'Per period' },
              { value: 'run', label: 'Running total' },
            ]}
          />
        </>
      }
    >
      <div className="chart-box">
        <ResponsiveContainer>
          {running ? (
            <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} minTickGap={16} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => compact(v)} />
              <Tooltip cursor={{ stroke: '#898781', strokeWidth: 1 }} content={<ChartTooltip format={fmt} />} />
              <Area type="monotone" dataKey="value" name={METRIC_LABEL[metric]} stroke={ACCENT} strokeWidth={2} fill={ACCENT} fillOpacity={0.18} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} minTickGap={16} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => compact(v)} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltip format={fmt} />} />
              <Bar dataKey="value" name={METRIC_LABEL[metric]} fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Frequency({ sessions, from, now }: { sessions: Session[]; from: number; now: number }) {
  const [grain, setGrain] = useState<Grain>('week');
  const data = bucketize(sessions, grain, from, now, () => 1);
  const avg = data.length ? data.reduce((a, b) => a + b.value, 0) / data.length : 0;

  return (
    <ChartCard
      title="Training frequency"
      controls={
        <Segmented<Grain>
          label="Frequency per"
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'week', label: 'Per week' },
            { value: 'month', label: 'Per month' },
          ]}
        />
      }
    >
      <p className="small muted">
        Average <strong style={{ color: 'var(--text)' }}>{avg.toFixed(1)}</strong> workouts per {grain}
      </p>
      <div className="chart-box" style={{ height: 180 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
            <CartesianGrid {...GRID} />
            <XAxis dataKey="label" {...AXIS} minTickGap={16} />
            <YAxis {...AXIS} allowDecimals={false} width={40} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltip format={(v) => `${v} workout${v === 1 ? '' : 's'}`} />} />
            <Bar dataKey="value" name="Workouts" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

type MusclePeriod = 'session' | 'week' | 'month';

function MuscleDistribution({ sessions, now }: { sessions: Session[]; now: number }) {
  const exercises = useExerciseMap();
  const [period, setPeriod] = useState<MusclePeriod>('week');
  const [offset, setOffset] = useState(0);
  const [kind, setKind] = useState<'bar' | 'donut'>('bar');
  const [picking, setPicking] = useState(false);

  let selected: Session[] = [];
  let label = '';
  let canPrev = true;
  let shown = now;
  const desc = [...sessions].reverse();
  if (period === 'session') {
    const s = desc[offset];
    shown = s?.startedAt ?? now;
    selected = s ? [s] : [];
    label = s ? `${s.title} · ${formatShortDate(s.startedAt)}` : 'No workout';
    canPrev = offset < desc.length - 1;
  } else if (period === 'week') {
    const from = addDays(startOfWeek(now), -7 * offset);
    shown = from;
    selected = inRange(sessions, from, addDays(from, 7) - 1);
    label = offset === 0 ? 'This week' : offset === 1 ? 'Last week' : `Week of ${formatShortDate(from)}`;
  } else {
    const from = addMonths(startOfMonth(now), -offset);
    shown = from;
    selected = inRange(sessions, from, addMonths(from, 1) - 1);
    label = new Date(from).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  }

  const shares = muscleShares(muscleLoad(selected, exercises)).filter((s) => s.load > 0);
  const values = Object.fromEntries(shares.map((s) => [s.muscle, s.intensity])) as Record<MuscleId, number>;
  const pct = Object.fromEntries(shares.map((s) => [s.muscle, s.pct])) as Record<MuscleId, number>;
  const top = shares.slice(0, 7);
  const rest = shares.slice(7).reduce((a, s) => a + s.pct, 0);
  const donut = [...top.map((s, i) => ({ name: MUSCLE_LABEL[s.muscle], value: s.pct, color: SERIES[i] })), ...(rest > 0 ? [{ name: 'Other', value: rest, color: OTHER }] : [])];

  return (
    <ChartCard
      title="Muscle distribution"
      controls={
        <>
          <Segmented<MusclePeriod>
            label="Muscle period"
            value={period}
            onChange={(p) => {
              setPeriod(p);
              setOffset(0);
            }}
            options={[
              { value: 'session', label: 'Workout' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
            ]}
          />
          <Segmented<'bar' | 'donut'>
            label="Chart type"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'bar', label: 'Bars' },
              { value: 'donut', label: 'Donut' },
            ]}
          />
        </>
      }
    >
      <div className="row between mb">
        <button className="btn icon small" aria-label="Previous period" onClick={() => setOffset(offset + 1)} disabled={!canPrev}>
          <Icon name="back" />
        </button>
        <button className="period-label" onClick={() => setPicking(true)} aria-label={`${label}. Choose from the calendar`}>
          <Icon name="calendar" size={16} /> {label}
        </button>
        <button className="btn icon small" aria-label="Next period" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0}>
          <Icon name="forward" />
        </button>
      </div>
      {picking && (
        <PeriodPicker
          open
          onClose={() => setPicking(false)}
          mode={period}
          sessions={sessions}
          value={shown}
          onPick={(ms, s) => {
            setPicking(false);
            if (period === 'session') setOffset(Math.max(0, desc.findIndex((x) => x.id === s?.id)));
            else if (period === 'week') setOffset(Math.round((startOfWeek(now) - startOfWeek(ms)) / (7 * DAY_MS)));
            else {
              const a = new Date(now);
              const b = new Date(ms);
              setOffset((a.getFullYear() - b.getFullYear()) * 12 + a.getMonth() - b.getMonth());
            }
          }}
        />
      )}
      {shares.length === 0 ? (
        <EmptyState icon="body" title="No muscle data in this period" />
      ) : (
        <div className="grid two">
          <div>
            <BodyMap values={values} pct={pct} compact />
            <HeatLegend />
          </div>
          <div>
            {kind === 'bar' ? (
              <ul className="list">
                {shares.map((s) => (
                  <li key={s.muscle} className="row" style={{ minHeight: 26 }}>
                    <span className="small" style={{ width: 96, flexShrink: 0 }}>
                      {MUSCLE_LABEL[s.muscle]}
                    </span>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg-elev-2)', borderRadius: 4 }} title={`${MUSCLE_LABEL[s.muscle]}: ${s.pct.toFixed(1)}%`}>
                      <div style={{ width: `${s.intensity * 100}%`, height: '100%', background: ACCENT, borderRadius: 4 }} />
                    </div>
                    <span className="small num" style={{ width: 40, textAlign: 'right' }}>
                      {Math.round(s.pct)}%
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <div style={{ height: 200 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={1} stroke="#161616" strokeWidth={2} isAnimationActive={false}>
                        {donut.map((d) => (
                          <Cell key={d.name} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip format={(v) => `${v.toFixed(1)}%`} labelFormat={() => 'Share of work'} />} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <Legend items={donut.map((d) => ({ label: `${d.name} ${Math.round(d.value)}%`, color: d.color }))} />
              </>
            )}
          </div>
        </div>
      )}
    </ChartCard>
  );
}

type CalView = 'session' | 'week' | 'month' | 'daily';

function CaloriesChart({ sessions, from, now }: { sessions: Session[]; from: number; now: number }) {
  const { calories } = useCalories();
  const profile = useProfile();
  const weights = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? [];
  const [view, setView] = useState<CalView>('week');
  const [running, setRunning] = useState(false);

  const missingWeight = sessions.some((s) => calories(s).missing === 'weight');
  let data: { label: string; estimated: number; imported: number }[] = [];
  if (view === 'session') {
    data = sessions.map((s) => {
      const c = calories(s);
      return { label: formatShortDate(s.startedAt), estimated: c.source === 'estimated' ? c.kcal ?? 0 : 0, imported: c.source !== 'estimated' ? c.kcal ?? 0 : 0 };
    });
  } else if (view !== 'daily') {
    const est = bucketize(sessions, view, from, now, (s) => (calories(s).source === 'estimated' ? calories(s).kcal ?? 0 : 0));
    const imp = bucketize(sessions, view, from, now, (s) => (calories(s).source !== 'estimated' ? calories(s).kcal ?? 0 : 0));
    data = est.map((b, i) => ({ label: b.label, estimated: b.value, imported: imp[i].value }));
  }
  if (running && view !== 'daily') {
    let e = 0;
    let i = 0;
    data = data.map((d) => ({ ...d, estimated: (e += d.estimated), imported: (i += d.imported) }));
  }

  // Daily total: BMR + exercise above resting, for the last 30 days.
  const daily = useMemo(() => {
    if (view !== 'daily') return [];
    const out: { label: string; bmr: number; activity: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const t = startOfDay(now) - i * DAY_MS;
      const key = toDateKey(t);
      const kg = weightOn(key, weights, profile);
      const bmr = bmrMifflin(profile.sex, kg, profile.heightCm, ageOn(profile, t)) ?? 0;
      const activity = sessions
        .filter((s) => s.date === key)
        .reduce((a, s) => a + netExerciseKcal(calories(s), kg, (s.endedAt ? s.endedAt - s.startedAt : 0) / 3600_000), 0);
      out.push({ label: formatShortDate(t), bmr: Math.round(bmr), activity: Math.round(activity) });
    }
    return out;
  }, [view, sessions, weights, profile, calories, now]);
  const bmrMissing = view === 'daily' && daily.every((d) => d.bmr === 0);

  const total = sessions.reduce((a, s) => a + (calories(s).kcal ?? 0), 0);

  return (
    <ChartCard
      title="Calories"
      controls={
        <>
          <Segmented<CalView>
            label="Calories per"
            value={view}
            onChange={setView}
            options={[
              { value: 'session', label: 'Workout' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'daily', label: 'Daily total' },
            ]}
          />
          {view !== 'daily' && (
            <Segmented<'per' | 'run'>
              label="View"
              value={running ? 'run' : 'per'}
              onChange={(v) => setRunning(v === 'run')}
              options={[
                { value: 'per', label: 'Per period' },
                { value: 'run', label: 'Running total' },
              ]}
            />
          )}
        </>
      }
      footer={
        <p className="tiny faint mt-s">
          <Icon name="info" size={12} /> Estimates are approximate (MET method: MET × body weight × hours). Imported values come from your device.
          {view === 'daily' && ' Daily total = BMR (Mifflin-St Jeor) + exercise calories above resting.'}
        </p>
      }
    >
      {missingWeight && (
        <div className="banner warn mb small">
          <div className="grow">
            Some workouts have no estimate because no body weight is set. <Link to="/settings">Add your weight</Link>
          </div>
        </div>
      )}
      {view === 'daily' && bmrMissing ? (
        <EmptyState icon="flame" title="BMR needs your profile">
          Add sex, age or birth date, height and weight in <Link to="/settings">Settings</Link>.
        </EmptyState>
      ) : (
        <>
          {view !== 'daily' && (
            <p className="small muted">
              <strong style={{ color: 'var(--text)' }}>{compact(total)} kcal</strong> from workouts in the selected period
            </p>
          )}
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={(view === 'daily' ? daily : data) as Record<string, string | number>[]} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} minTickGap={16} />
                <YAxis {...AXIS} width={48} tickFormatter={(v) => compact(v)} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltip format={(v) => `${Math.round(v)} kcal`} />} />
                {view === 'daily' ? (
                  <>
                    <Bar dataKey="bmr" name="BMR" stackId="a" fill={OTHER} maxBarSize={28} isAnimationActive={false} />
                    <Bar dataKey="activity" name="Exercise" stackId="a" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="estimated" name="Estimated" stackId="a" fill={ACCENT} maxBarSize={36} isAnimationActive={false} />
                    <Bar dataKey="imported" name="Imported or entered" stackId="a" fill={PREVIOUS} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend
            items={
              view === 'daily'
                ? [
                    { label: 'BMR', color: OTHER },
                    { label: 'Exercise (above resting)', color: ACCENT },
                  ]
                : [
                    { label: 'Estimated', color: ACCENT },
                    { label: 'Imported or entered', color: PREVIOUS },
                  ]
            }
          />
        </>
      )}
    </ChartCard>
  );
}

const GROUPS = Object.keys(GROUP_INFO) as SportGroup[];

function ActivityMixChart({ sessions, from, now }: { sessions: Session[]; from: number; now: number }) {
  const [grain, setGrain] = useState<Grain>('week');
  const data = activityMix(sessions, grain, from, now);
  const used = GROUPS.filter((g) => data.some((b) => (b[g] as number) > 0));
  const avg = data.length ? data.reduce((a, b) => a + b.active, 0) / data.length : 0;
  return (
    <ChartCard
      title="Activity mix"
      controls={
        <Segmented<Grain>
          label="Group by"
          value={grain}
          onChange={setGrain}
          options={[
            { value: 'week', label: 'Per week' },
            { value: 'month', label: 'Per month' },
          ]}
        />
      }
      footer={<p className="tiny faint mt-s">Days on which each type of activity was done. A day with gym and a hike counts for both, so bars can be taller than the active days.</p>}
    >
      <p className="small muted">
        Average <strong style={{ color: 'var(--text)' }}>{avg.toFixed(1)}</strong> active days per {grain}
      </p>
      {used.length === 0 ? (
        <EmptyState icon="calendar" title="No activities in this period" />
      ) : (
        <>
          <div className="chart-box">
            <ResponsiveContainer>
              <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -20 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} minTickGap={16} />
                <YAxis {...AXIS} allowDecimals={false} width={40} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltip format={(v) => `${v} ${v === 1 ? 'day' : 'days'}`} />} />
                {used.map((g, i) => (
                  <Bar key={g} dataKey={g} name={GROUP_INFO[g].label} stackId="mix" fill={GROUP_INFO[g].color} stroke="#161616" strokeWidth={1} radius={i === used.length - 1 ? [4, 4, 0, 0] : 0} maxBarSize={36} isAnimationActive={false} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Legend items={used.map((g) => ({ label: GROUP_INFO[g].label, color: GROUP_INFO[g].color }))} />
        </>
      )}
    </ChartCard>
  );
}
