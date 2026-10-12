import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BodyMap, HeatLegend } from '../components/BodyMap';
import { AXIS, ChartCard, ChartTooltip, GRID, Legend, OTHER, SEQ, SERIES } from '../components/charts';
import { Icon } from '../components/Icon';
import { Delta, EmptyState, PageHeader, Segmented, Stat } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { MuscleId, Session, WeightUnit } from '../db/types';
import { useCalories } from '../hooks/useCalories';
import {
  bucketize,
  comparisonRanges,
  cumulative,
  dayCounts,
  inRange,
  loggedExercises,
  METRIC_LABEL,
  metricValue,
  mostTrainedMuscle,
  mostUsedExercise,
  paceSeries,
  pctChange,
  periodTotals,
  PROGRESS_LABEL,
  progressSeries,
  streaks,
  type ComparePreset,
  type Metric,
  type ProgressMetric,
  type Range,
} from '../lib/analytics';
import { ageOn, bmrMifflin, netExerciseKcal, weightOn } from '../lib/calories';
import { addDays, addMonths, DAY_MS, formatClock, formatDuration, formatShortDate, fromDateKey, startOfDay, startOfMonth, startOfWeek, toDateKey, type Grain } from '../lib/dates';
import { muscleLoad, muscleShares } from '../lib/muscleLoad';
import { compact, KG_PER_LB } from '../lib/units';

type RangeKey = '4w' | '3m' | '6m' | '12m' | 'all';
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: '4w', label: '4 weeks' },
  { value: '3m', label: '3 months' },
  { value: '6m', label: '6 months' },
  { value: '12m', label: '12 months' },
  { value: 'all', label: 'All' },
];

function rangeStart(key: RangeKey, sessions: Session[], now: number): number {
  switch (key) {
    case '4w':
      return startOfWeek(now) - 3 * 7 * DAY_MS;
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

function fmtMetric(m: Metric | ProgressMetric, v: number, unit: WeightUnit): string {
  switch (m) {
    case 'volume':
      return `${compact(vol(v, unit))} ${unit}`;
    case 'e1rm':
    case 'maxWeight':
      return `${Math.round(vol(v, unit) * 10) / 10} ${unit}`;
    case 'duration':
      return v >= 120 ? `${(v / 60).toFixed(1)} h` : `${Math.round(v)} min`;
    case 'maxDuration':
      return formatClock(v);
    case 'calories':
      return `${compact(v)} kcal`;
    default:
      return compact(v);
  }
}

export default function AnalyticsPage() {
  const sessions = useLiveQuery(() => db.sessions.where('status').equals('completed').sortBy('startedAt'), []);
  const exercises = useExerciseMap();
  const { unit } = useProfile();
  const { calories } = useCalories();
  const [rangeKey, setRangeKey] = useState<RangeKey>('3m');
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

  return (
    <div className="page wide">
      <PageHeader title="Analytics" subtitle={`${inPeriod.length} workouts in the selected period`} />
      <div className="row wrap mb" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: '6px 0' }}>
        <Segmented<RangeKey> label="Period" value={rangeKey} onChange={setRangeKey} options={RANGE_OPTIONS} />
      </div>

      <Overview sessions={inPeriod} all={sessions} exercises={exercises} unit={unit} kcal={kcal} />

      <div className="grid two-wide mt">
        <ExerciseProgress sessions={inPeriod} unit={unit} />
        <PeriodComparison sessions={sessions} unit={unit} kcal={kcal} now={now} />
        <CumulativeChart sessions={inPeriod} from={from} now={now} unit={unit} kcal={kcal} />
        <Frequency sessions={inPeriod} all={sessions} from={from} now={now} />
        <MuscleDistribution sessions={sessions} now={now} />
        <CaloriesChart sessions={inPeriod} from={from} now={now} />
      </div>
    </div>
  );
}

function Overview({ sessions, all, exercises, unit, kcal }: { sessions: Session[]; all: Session[]; exercises: ReturnType<typeof useExerciseMap>; unit: WeightUnit; kcal: (s: Session) => number }) {
  const t = periodTotals(sessions, kcal);
  const st = streaks(all);
  const muscle = mostTrainedMuscle(sessions, exercises);
  const ex = mostUsedExercise(sessions);
  return (
    <div className="stat-tiles">
      <Stat label="Workouts" value={t.sessions} />
      <Stat label="Total time" value={formatDuration(t.duration * 60)} />
      <Stat label="Volume" value={`${compact(vol(t.volume, unit))} ${unit}`} sub={`${compact(t.reps)} reps · ${t.sets} sets`} />
      <Stat label="Calories" value={`${compact(t.calories)} kcal`} sub="approximate" />
      <Stat label="Avg duration" value={t.sessions ? formatDuration(t.avgDuration * 60) : '–'} />
      <Stat label="Streak" value={`${st.currentWeeks} wk`} sub={`weeks in a row · best ${st.longestWeeks} wk · longest daily run ${st.longestDays} ${st.longestDays === 1 ? 'day' : 'days'}`} />
      <Stat label="Most trained" value={<span style={{ fontSize: '1.1rem', lineHeight: 1.25, display: 'block' }}>{muscle ? MUSCLE_LABEL[muscle.muscle] : '–'}</span>} sub={muscle ? `${Math.round(muscle.pct)}% of work` : undefined} />
      <Stat
        label="Most used exercise"
        value={<span style={{ fontSize: '1.1rem', lineHeight: 1.25, display: 'block' }}>{ex ? exercises.get(ex.exerciseId)?.name ?? '–' : '–'}</span>}
        sub={ex ? `${ex.sets} sets` : undefined}
      />
    </div>
  );
}

function ExerciseProgress({ sessions, unit }: { sessions: Session[]; unit: WeightUnit }) {
  const exercises = useExerciseMap();
  const [params] = useSearchParams();
  const logged = useMemo(() => loggedExercises(sessions), [sessions]);
  const [chosen, setChosen] = useState<string>(params.get('exercise') ?? '');
  const [metric, setMetric] = useState<ProgressMetric>('e1rm');
  const exerciseId = chosen && logged.includes(chosen) ? chosen : logged[0];
  const data = exerciseId ? progressSeries(exerciseId, sessions, metric) : [];
  const first = data[0]?.value ?? 0;
  const last = data[data.length - 1]?.value ?? 0;

  return (
    <ChartCard
      title="Exercise progress"
      table={{ columns: ['Date', PROGRESS_LABEL[metric]], rows: data.map((d) => [formatShortDate(d.date), fmtMetric(metric, d.value, unit)]) }}
      controls={
        <>
          <select aria-label="Exercise" value={exerciseId ?? ''} onChange={(e) => setChosen(e.target.value)} style={{ flex: '1 1 200px', width: 'auto' }}>
            {logged.map((id) => (
              <option key={id} value={id}>
                {exercises.get(id)?.name ?? id}
              </option>
            ))}
          </select>
          <select aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as ProgressMetric)} style={{ flex: '1 1 160px', width: 'auto' }}>
            {(Object.keys(PROGRESS_LABEL) as ProgressMetric[]).map((m) => (
              <option key={m} value={m}>
                {PROGRESS_LABEL[m]}
              </option>
            ))}
          </select>
        </>
      }
      footer={
        data.length > 1 ? (
          <p className="small muted mt-s">
            {formatShortDate(data[0].date)} → {formatShortDate(data[data.length - 1].date)}: {fmtMetric(metric, first, unit)} → <strong style={{ color: 'var(--text)' }}>{fmtMetric(metric, last, unit)}</strong> <Delta pct={pctChange(last, first)} />
          </p>
        ) : null
      }
    >
      {data.length === 0 ? (
        <EmptyState icon="chart" title="No sets logged in this period" />
      ) : data.every((d) => !d.value) ? (
        <EmptyState icon="chart" title={`No ${PROGRESS_LABEL[metric].toLowerCase()} data for this exercise`}>
          Try another metric.
        </EmptyState>
      ) : (
        <div className="chart-box">
          <ResponsiveContainer>
            <LineChart data={data.map((d) => ({ ...d, value: metric === 'maxDuration' || metric === 'reps' || metric === 'maxReps' ? d.value : vol(d.value, unit) }))} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="date" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(v) => formatShortDate(v)} {...AXIS} minTickGap={24} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => (metric === 'maxDuration' ? formatClock(v) : compact(v))} domain={['auto', 'auto']} />
              <Tooltip
                cursor={{ stroke: '#898781', strokeWidth: 1 }}
                content={<ChartTooltip labelFormat={(l) => formatShortDate(Number(l))} format={(v) => (metric === 'maxDuration' ? formatClock(v) : metric === 'reps' || metric === 'maxReps' ? `${v}` : `${Math.round(v * 10) / 10} ${unit}`)} />}
              />
              <Line type="monotone" dataKey="value" name={PROGRESS_LABEL[metric]} stroke={SERIES[0]} strokeWidth={2} dot={{ r: 4, fill: SERIES[0], stroke: '#14171c', strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartCard>
  );
}

const COMPARE_METRICS: Metric[] = ['sessions', 'duration', 'volume', 'sets', 'reps', 'calories'];

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
      table={{
        columns: ['Metric', a.label, b.label, 'Change'],
        rows: COMPARE_METRICS.map((m) => [METRIC_LABEL[m], fmtMetric(m, ta[m], unit), fmtMetric(m, tb[m], unit), fmtPct(pctChange(ta[m], tb[m]))]),
      }}
      controls={
        <Segmented<ComparePreset>
          label="Compare"
          value={preset}
          onChange={setPreset}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: '30d', label: '30 days' },
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
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SERIES[0] }} /> {a.label}
              </span>
            </th>
            <th>
              <span className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: SERIES[1] }} /> {b.label}
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
            <Line type="monotone" dataKey="previous" name={b.label} stroke={SERIES[1]} strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="current" name={a.label} stroke={SERIES[0]} strokeWidth={2} dot={false} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Legend
        items={[
          { label: a.label, color: SERIES[0], line: true },
          { label: b.label, color: SERIES[1], line: true },
        ]}
      />
    </ChartCard>
  );
}

function fmtPct(p: number | null): string {
  return p === null ? '–' : `${p > 0 ? '+' : ''}${Math.round(p * 10) / 10}%`;
}

const CUM_METRICS: Metric[] = ['volume', 'duration', 'reps', 'sets', 'calories', 'sessions'];

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
      table={{ columns: [grain[0].toUpperCase() + grain.slice(1), METRIC_LABEL[metric]], rows: data.map((d) => [d.label, fmt(d.value)]) }}
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
              <Area type="monotone" dataKey="value" name={METRIC_LABEL[metric]} stroke={SERIES[0]} strokeWidth={2} fill={SERIES[0]} fillOpacity={0.18} isAnimationActive={false} />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: -6 }}>
              <CartesianGrid {...GRID} />
              <XAxis dataKey="label" {...AXIS} minTickGap={16} />
              <YAxis {...AXIS} width={48} tickFormatter={(v) => compact(v)} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} content={<ChartTooltip format={fmt} />} />
              <Bar dataKey="value" name={METRIC_LABEL[metric]} fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

function Frequency({ sessions, all, from, now }: { sessions: Session[]; all: Session[]; from: number; now: number }) {
  const [grain, setGrain] = useState<Grain>('week');
  const data = bucketize(sessions, grain, from, now, () => 1);
  const avg = data.length ? data.reduce((a, b) => a + b.value, 0) / data.length : 0;

  // Heatmap: the last 26 weeks, Monday-first columns.
  const counts = dayCounts(all);
  const weeks = 26;
  const start = startOfWeek(now) - (weeks - 1) * 7 * DAY_MS;
  const cells: { key: string; n: number; future: boolean }[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const t = addDays(start, i);
    const key = toDateKey(t);
    cells.push({ key, n: counts.get(key) ?? 0, future: t > now });
  }

  return (
    <ChartCard
      title="Training frequency"
      table={{ columns: [grain === 'week' ? 'Week of' : 'Month', 'Workouts'], rows: data.map((d) => [d.label, d.value]) }}
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
            <Bar dataKey="value" name="Workouts" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h3 className="small muted mt">Workout days · last 6 months</h3>
      <div className="heatmap mt-s" role="img" aria-label={`Calendar of workout days: ${cells.filter((c) => c.n > 0).length} days with workouts in the last 26 weeks`}>
        {cells.map((c) => (
          <div
            key={c.key}
            title={`${formatShortDate(fromDateKey(c.key).getTime())}: ${c.n} workout${c.n === 1 ? '' : 's'}`}
            style={{ background: c.future ? 'transparent' : SEQ[Math.min(c.n === 0 ? 0 : c.n + 1, SEQ.length - 1)] }}
          />
        ))}
      </div>
      <div className="row tiny faint mt-s" style={{ gap: 6 }} aria-hidden>
        Less
        {[0, 2, 3, 4].map((i) => (
          <span key={i} style={{ width: 12, height: 12, borderRadius: 3, background: SEQ[i], display: 'inline-block' }} />
        ))}
        More
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

  let selected: Session[] = [];
  let label = '';
  let canPrev = true;
  if (period === 'session') {
    const desc = [...sessions].reverse();
    const s = desc[offset];
    selected = s ? [s] : [];
    label = s ? `${s.title} · ${formatShortDate(s.startedAt)}` : 'No workout';
    canPrev = offset < desc.length - 1;
  } else if (period === 'week') {
    const from = addDays(startOfWeek(now), -7 * offset);
    selected = inRange(sessions, from, addDays(from, 7) - 1);
    label = offset === 0 ? 'This week' : offset === 1 ? 'Last week' : `Week of ${formatShortDate(from)}`;
  } else {
    const from = addMonths(startOfMonth(now), -offset);
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
      table={{ columns: ['Muscle', 'Share'], rows: shares.map((s) => [MUSCLE_LABEL[s.muscle], `${s.pct.toFixed(1)}%`]) }}
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
        <strong className="small" style={{ textAlign: 'center' }}>
          {label}
        </strong>
        <button className="btn icon small" aria-label="Next period" onClick={() => setOffset(Math.max(0, offset - 1))} disabled={offset === 0}>
          <Icon name="forward" />
        </button>
      </div>
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
                      <div style={{ width: `${s.intensity * 100}%`, height: '100%', background: SERIES[0], borderRadius: 4 }} />
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
                      <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="90%" paddingAngle={1} stroke="#14171c" strokeWidth={2} isAnimationActive={false}>
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
      return { label: formatShortDate(s.startedAt), estimated: c.source === 'estimated' ? c.kcal ?? 0 : 0, imported: c.source === 'imported' ? c.kcal ?? 0 : 0 };
    });
  } else if (view !== 'daily') {
    const est = bucketize(sessions, view, from, now, (s) => (calories(s).source === 'estimated' ? calories(s).kcal ?? 0 : 0));
    const imp = bucketize(sessions, view, from, now, (s) => (calories(s).source === 'imported' ? calories(s).kcal ?? 0 : 0));
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
      table={
        view === 'daily'
          ? { columns: ['Day', 'BMR', 'Exercise (net)', 'Total'], rows: daily.map((d) => [d.label, d.bmr, d.activity, d.bmr + d.activity]) }
          : { columns: [view === 'session' ? 'Workout' : view, 'Estimated', 'Imported'], rows: data.map((d) => [d.label, Math.round(d.estimated), Math.round(d.imported)]) }
      }
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
                    <Bar dataKey="activity" name="Exercise" stackId="a" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
                  </>
                ) : (
                  <>
                    <Bar dataKey="estimated" name="Estimated" stackId="a" fill={SERIES[0]} maxBarSize={36} isAnimationActive={false} />
                    <Bar dataKey="imported" name="Imported" stackId="a" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
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
                    { label: 'Exercise (above resting)', color: SERIES[0] },
                  ]
                : [
                    { label: 'Estimated', color: SERIES[0] },
                    { label: 'Imported', color: SERIES[1] },
                  ]
            }
          />
        </>
      )}
    </ChartCard>
  );
}
