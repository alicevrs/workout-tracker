import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BodyMap, HeatLegend } from '../components/BodyMap';
import { Icon } from '../components/Icon';
import { EmptyState, PageHeader, Stat, useToast } from '../components/ui';
import { MUSCLE_LABEL } from '../data/muscles';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { MuscleId } from '../db/types';
import { formatClock, formatDate, formatDuration, formatTime } from '../lib/dates';
import { muscleShares, sessionMuscleLoad } from '../lib/muscleLoad';
import { cloneBlock, FORMAT_INFO } from '../lib/program';
import { blockToPerformed, createSession, performedToBlock } from '../lib/session';
import { detectPRs, exerciseHistory, PR_LABEL, sessionMetrics, sessionSummary } from '../lib/stats';
import { compact, formatWeight } from '../lib/units';
import { SessionCalories } from '../components/SessionCalories';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS, ChartTooltip, GRID, SERIES } from '../components/charts';

export default function SessionDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { unit } = useProfile();
  const exercises = useExerciseMap();
  const session = useLiveQuery(() => db.sessions.get(id), [id]);
  const all = useLiveQuery(() => db.sessions.where('status').equals('completed').toArray(), []);

  if (session === undefined || !all) return <div className="page" />;
  if (!session)
    return (
      <div className="page">
        <PageHeader title="Workout" back="/history" />
        <EmptyState title="Workout not found" />
      </div>
    );

  const sum = sessionSummary(session);
  const metrics = sessionMetrics(session);
  const prs = detectPRs(session, all);
  const shares = muscleShares(sessionMuscleLoad(session, exercises));
  const values = Object.fromEntries(shares.map((s) => [s.muscle, s.intensity])) as Record<MuscleId, number>;
  const pct = Object.fromEntries(shares.map((s) => [s.muscle, s.pct])) as Record<MuscleId, number>;
  const worked = shares.filter((s) => s.load > 0);
  const name = (exId?: string) => (exId ? exercises.get(exId)?.name ?? 'Unknown exercise' : '');

  const repeat = async () => {
    const s = createSession({ title: session.title });
    s.programId = session.programId;
    s.programDayId = session.programDayId;
    s.blocks = session.blocks.map((b) => blockToPerformed(cloneBlock(performedToBlock(b))));
    await db.sessions.add(s);
    toast('New workout started from this one');
    navigate(`/workout/${s.id}`);
  };

  return (
    <div className="page wide">
      <PageHeader
        title={session.title}
        back="/history"
        subtitle={`${formatDate(session.startedAt)} · ${formatTime(session.startedAt)}`}
        actions={
          <>
            <button className="btn" onClick={repeat} aria-label="Repeat this workout">
              <Icon name="reset" /> <span className="hide-sm">Repeat</span>
            </button>
            <Link className="btn primary" to={`/workout/${session.id}`}>
              <Icon name="edit" /> Edit
            </Link>
          </>
        }
      />
      <div className="stack">
        <div className="stat-tiles">
          <Stat label="Duration" value={sum.durationSec ? formatDuration(sum.durationSec) : '–'} />
          {sum.sets === 0 && (session.distanceM || session.hr?.avg) ? (
            <>
              <Stat label="Distance" value={session.distanceM ? `${(session.distanceM / 1000).toFixed(2)} km` : '–'} />
              <Stat label="Avg heart rate" value={session.hr?.avg ? `${Math.round(session.hr.avg)} bpm` : '–'} sub={session.hr?.max ? `max ${session.hr.max}` : undefined} />
            </>
          ) : (
            <>
              <Stat label="Volume" value={sum.volume ? `${compact(unit === 'kg' ? sum.volume : sum.volume / 0.45359237)} ${unit}` : '–'} />
              <Stat label="Sets" value={sum.sets || '–'} sub={sum.reps ? `${sum.reps} reps` : undefined} />
            </>
          )}
          <SessionCalories session={session} />
        </div>

        <p className="tiny faint" style={{ marginTop: 6 }}>
          Calorie estimates are approximate. Imported values come from your device.
        </p>
        {prs.length > 0 && (
          <section className="card" style={{ borderColor: 'rgba(255,197,66,0.5)' }}>
            <h2 className="mb row">
              <Icon name="trophy" /> Personal records
            </h2>
            <ul className="list">
              {prs.map((p, i) => (
                <li key={i} className="row between" style={{ minHeight: 40 }}>
                  <span>
                    <strong>{p.exerciseId ? name(p.exerciseId) : session.blocks.find((b) => b.id === p.blockId)?.name ?? 'AMRAP'}</strong> <span className="muted small">· {PR_LABEL[p.kind]}</span>
                  </span>
                  <span className="num">
                    {p.kind === 'reps_at_weight'
                      ? `${p.value} reps @ ${formatWeight(p.weight, unit)} (was ${p.previous})`
                      : p.kind === 'longest_time'
                        ? `${formatClock(p.value)} (was ${formatClock(p.previous)})`
                        : p.kind === 'most_rounds'
                          ? `${p.value} rounds (was ${p.previous})`
                          : `${formatWeight(p.value, unit)} (was ${formatWeight(p.previous, unit)})`}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="grid two-wide">
          {(metrics.size > 0 || session.blocks.length > 0) && (
          <section className="card">
            <h2 className="mb">Exercises</h2>
            {metrics.size === 0 && <p className="muted small">No completed sets.</p>}
            <ul className="list">
              {[...metrics.values()].map((m) => {
                const hist = exerciseHistory(m.exerciseId, all);
                const idx = hist.findIndex((h) => h.sessionId === session.id);
                const point = idx >= 0 ? hist[idx] : undefined;
                return (
                  <li key={m.exerciseId} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                    <div className="row between">
                      <Link to={`/exercises/${m.exerciseId}`} style={{ fontWeight: 650, color: 'var(--text)' }}>
                        {name(m.exerciseId)}
                      </Link>
                      {point?.improved && <span className="chip good">▲ Progress</span>}
                      {point && !point.delta && <span className="chip">First time</span>}
                    </div>
                    <div className="small muted num">
                      {m.sets} {m.sets === 1 ? 'set' : 'sets'} · {m.reps} reps
                      {m.volume > 0 && ` · ${compact(unit === 'kg' ? m.volume : m.volume / 0.45359237)} ${unit}`}
                      {m.bestSet?.weight ? ` · best ${formatWeight(m.bestSet.weight, unit)} × ${m.bestSet.reps}` : ''}
                      {m.e1rm > 0 && ` · e1RM ${formatWeight(m.e1rm, unit)}`}
                      {m.maxDuration > 0 && ` · longest ${formatClock(m.maxDuration)}`}
                    </div>
                    {point?.delta && (
                      <div className="tiny faint num">
                        vs last: {fmtDelta(point.delta.e1rm, unit, 'e1RM')} {fmtDelta(point.delta.maxWeight, unit, 'top')} {point.delta.reps !== 0 && `${point.delta.reps > 0 ? '+' : ''}${point.delta.reps} reps`}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {session.blocks
              .filter((b) => b.result && (b.result.rounds !== undefined || b.result.timeSec !== undefined))
              .map((b) => (
                <div key={b.id} className="row between mt-s">
                  <span>
                    <span className="chip primary">{FORMAT_INFO[b.format].short}</span> {b.name ?? FORMAT_INFO[b.format].label}
                  </span>
                  <strong className="num">
                    {b.result?.rounds !== undefined && `${b.result.rounds} rounds`}
                    {b.result?.reps ? ` + ${b.result.reps} reps` : ''}
                    {b.result?.timeSec !== undefined && ` · ${formatClock(b.result.timeSec)}`}
                  </strong>
                </div>
              ))}
          </section>
          )}

          <section className="card" aria-labelledby="muscle-h">
            <h2 id="muscle-h" className="mb">
              Muscles worked
            </h2>
            {worked.length === 0 ? (
              <p className="muted small">No muscle data for this session.</p>
            ) : (
              <>
                <BodyMap values={values} pct={pct} compact />
                <HeatLegend />
                <ul className="list mt-s">
                  {worked.slice(0, 8).map((s) => (
                    <li key={s.muscle} className="row" style={{ minHeight: 28 }}>
                      <span style={{ width: 110 }} className="small">
                        {MUSCLE_LABEL[s.muscle]}
                      </span>
                      <div style={{ flex: 1, height: 8, background: 'var(--bg-elev-2)', borderRadius: 4 }}>
                        <div style={{ width: `${s.intensity * 100}%`, height: '100%', background: 'var(--accent)', borderRadius: 4 }} />
                      </div>
                      <span className="small num" style={{ width: 40, textAlign: 'right' }}>
                        {Math.round(s.pct)}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {session.hr && (session.hr.avg || session.hr.max) && (
          <section className="card">
            <h2 className="mb row">
              <Icon name="heart" /> Heart rate
            </h2>
            <div className="stat-tiles">
              {session.hr.avg && <Stat label="Average" value={`${Math.round(session.hr.avg)} bpm`} />}
              {session.hr.max && <Stat label="Max" value={`${Math.round(session.hr.max)} bpm`} />}
              {session.distanceM ? <Stat label="Distance" value={`${(session.distanceM / 1000).toFixed(2)} km`} /> : null}
            </div>
            {session.hr.samples && session.hr.samples.length > 1 && (
              <div className="chart-box mt" style={{ height: 200 }} role="img" aria-label={`Heart rate over time, average ${session.hr.avg} bpm, max ${session.hr.max} bpm`}>
                <ResponsiveContainer>
                  <LineChart data={session.hr.samples.map(([t, bpm]) => ({ t, bpm }))} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(v) => formatClock(v)} {...AXIS} minTickGap={30} />
                    <YAxis {...AXIS} width={44} domain={['dataMin - 5', 'dataMax + 5']} />
                    <Tooltip cursor={{ stroke: '#898781', strokeWidth: 1 }} content={<ChartTooltip format={(v) => `${v} bpm`} labelFormat={(l) => formatClock(Number(l))} />} />
                    <Line type="monotone" dataKey="bpm" name="Heart rate" stroke={SERIES[0]} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        )}

        {session.notes && (
          <section className="card">
            <h2 className="mb">Notes</h2>
            <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>
              {session.notes}
            </p>
          </section>
        )}
      </div>
    </div>
  );
}

function fmtDelta(v: number, unit: 'kg' | 'lb', label: string) {
  if (Math.abs(v) < 0.05) return '';
  const w = formatWeight(Math.abs(v), unit);
  return `${label} ${v > 0 ? '+' : '−'}${w} `;
}
