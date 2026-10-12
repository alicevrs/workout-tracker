import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { EmptyState, NumberField, PageHeader, Segmented, useToast } from '../components/ui';
import { GROUP_INFO, resolveSport, SPORT_BY_ID, SPORTS, type SportGroup } from '../data/sports';
import { db } from '../db/db';
import { useExerciseMap, useProfile } from '../db/repo';
import type { Intensity, Session } from '../db/types';
import { paceInfo } from '../lib/activities';
import { sessionCalories } from '../lib/calories';
import { pad, toDateKey } from '../lib/dates';
import { uid } from '../lib/ids';

const GROUP_ORDER: SportGroup[] = ['foot', 'cycling', 'water', 'snow', 'climbing', 'fitness', 'team', 'other'];

function toLocalInput(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Form {
  sportId: string;
  title: string;
  start: string;
  hours?: number;
  minutes?: number;
  distanceKm?: number;
  elevationM?: number;
  intensity: Intensity;
  avgHr?: number;
  maxHr?: number;
  calories?: number;
  notes: string;
}

export default function ActivityFormPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useProfile();
  const exercises = useExerciseMap();
  const weights = useLiveQuery(() => db.bodyWeights.toArray(), []) ?? [];
  const [existing, setExisting] = useState<Session | null | undefined>(id ? undefined : null);
  const [form, setForm] = useState<Form | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) {
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const date = params.get('date');
      const start = date ? new Date(`${date}T${pad(now.getHours())}:00`).getTime() : now.getTime() - 3600_000;
      setForm({ sportId: params.get('sport') ?? '', title: '', start: toLocalInput(start), hours: 1, minutes: 0, intensity: 'moderate', notes: '' });
      return;
    }
    db.sessions.get(id).then((s) => {
      setExisting(s ?? null);
      if (!s) return;
      const dur = s.endedAt ? Math.round((s.endedAt - s.startedAt) / 60000) : 60;
      setForm({
        sportId: resolveSport(s.activityType)?.id ?? 'other',
        title: s.title,
        start: toLocalInput(s.startedAt),
        hours: Math.floor(dur / 60),
        minutes: dur % 60,
        distanceKm: s.distanceM ? Math.round(s.distanceM / 10) / 100 : undefined,
        elevationM: s.elevationGainM,
        intensity: s.intensity,
        avgHr: s.hr?.avg,
        maxHr: s.hr?.max,
        calories: s.importedCalories,
        notes: s.notes ?? '',
      });
    });
  }, [id, params]);

  const sport = form ? SPORT_BY_ID.get(form.sportId) : undefined;
  const durationSec = form ? ((form.hours ?? 0) * 60 + (form.minutes ?? 0)) * 60 : 0;

  const draft: Session | null = useMemo(() => {
    if (!form || !sport) return null;
    const startedAt = new Date(form.start).getTime();
    if (Number.isNaN(startedAt)) return null;
    const keepImported = existing && existing.importedCalories !== undefined && existing.importedCalories === form.calories && existing.calorieSource !== 'manual';
    return {
      ...(existing ?? {}),
      id: existing?.id ?? uid(),
      date: toDateKey(startedAt),
      title: form.title.trim() || sport.label,
      status: 'completed',
      startedAt,
      endedAt: startedAt + durationSec * 1000,
      blocks: [],
      intensity: form.intensity,
      activityType: sport.id,
      distanceM: sport.distance && form.distanceKm ? form.distanceKm * 1000 : undefined,
      elevationGainM: sport.elevation && form.elevationM ? form.elevationM : undefined,
      hr: form.avgHr || form.maxHr ? { ...(existing?.hr ?? {}), avg: form.avgHr, max: form.maxHr } : existing?.hr?.samples ? existing.hr : undefined,
      importedCalories: form.calories,
      calorieSource: form.calories === undefined ? undefined : keepImported ? existing?.calorieSource : 'manual',
      notes: form.notes.trim() || undefined,
      source: existing?.source ?? 'manual',
      updatedAt: Date.now(),
    };
  }, [form, sport, durationSec, existing]);

  const estimate = useMemo(() => {
    if (!draft) return null;
    return sessionCalories({ ...draft, importedCalories: undefined }, { profile, weights, exercises });
  }, [draft, profile, weights, exercises]);

  const filteredSports = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SPORTS.filter((s) => !q || s.label.toLowerCase().includes(q) || GROUP_INFO[s.group].label.toLowerCase().includes(q));
  }, [query]);

  if (existing === undefined || !form) return <div className="page" />;
  if (id && existing === null)
    return (
      <div className="page">
        <PageHeader title="Activity" back="/history" />
        <EmptyState title="Activity not found" />
      </div>
    );

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });

  const save = async () => {
    setError('');
    if (!draft) return setError('Choose a sport and a valid date.');
    if (durationSec <= 0) return setError('Enter how long the activity lasted.');
    await db.sessions.put(draft);
    toast('Activity saved');
    navigate(`/history/${draft.id}`, { replace: true });
  };

  const remove = async () => {
    if (!existing || !confirm('Delete this activity?')) return;
    await db.sessions.delete(existing.id);
    navigate('/history', { replace: true });
  };

  const pace = paceInfo(draft?.distanceM, durationSec);

  return (
    <div className="page">
      <PageHeader title={id ? 'Edit activity' : 'Log activity'} back={id ? `/history/${id}` : true} />
      <div className="stack">
        <section className="card">
          <h2 className="mb">Sport</h2>
          {sport && (
            <div className="row mb">
              <span style={{ width: 12, height: 12, background: GROUP_INFO[sport.group].color, borderRadius: 2 }} aria-hidden />
              <strong>{sport.label}</strong>
              <span className="small muted">· {GROUP_INFO[sport.group].label}</span>
            </div>
          )}
          <input type="search" placeholder="Search sport" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search sport" />
          {GROUP_ORDER.map((g) => {
            const list = filteredSports.filter((s) => s.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="mt-s">
                <div className="tiny faint" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', margin: '8px 0 4px' }}>
                  {GROUP_INFO[g].label}
                </div>
                <div className="chips">
                  {list.map((s) => (
                    <button key={s.id} type="button" className="chip" aria-pressed={form.sportId === s.id} onClick={() => set({ sportId: s.id })}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {sport && (
          <section className="card form-grid">
            <label className="field full">
              Title
              <input value={form.title} placeholder={sport.label} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="field full">
              Start
              <input type="datetime-local" value={form.start} onChange={(e) => set({ start: e.target.value })} />
            </label>
            <NumberField label="Hours" value={form.hours} onChange={(v) => set({ hours: v })} stepper inputMode="numeric" />
            <NumberField label="Minutes" value={form.minutes} onChange={(v) => set({ minutes: v })} stepper step={5} inputMode="numeric" max={59} />
            {sport.distance && <NumberField label="Distance" suffix="km" value={form.distanceKm} onChange={(v) => set({ distanceKm: v })} />}
            {sport.elevation && <NumberField label="Elevation gain" suffix="m" value={form.elevationM} onChange={(v) => set({ elevationM: v })} inputMode="numeric" />}
            {(pace.kmh || pace.minPerKm) && (
              <p className="full small muted" style={{ margin: 0 }}>
                {pace.kmh!.toFixed(1)} km/h
                {sport.group === 'foot' && pace.minPerKm ? ` · ${Math.floor(pace.minPerKm)}:${pad(Math.round((pace.minPerKm % 1) * 60) % 60)} min/km` : ''}
              </p>
            )}
            <div className="full">
              <div className="small muted" style={{ fontWeight: 600, marginBottom: 6 }}>
                Effort
              </div>
              <Segmented<Intensity>
                label="Effort"
                value={form.intensity}
                onChange={(intensity) => set({ intensity })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'moderate', label: 'Moderate' },
                  { value: 'vigorous', label: 'Vigorous' },
                ]}
              />
            </div>
            <NumberField label="Avg heart rate" suffix="bpm, optional" value={form.avgHr} onChange={(v) => set({ avgHr: v })} inputMode="numeric" />
            <NumberField label="Max heart rate" suffix="optional" value={form.maxHr} onChange={(v) => set({ maxHr: v })} inputMode="numeric" />
            <NumberField label="Calories" suffix="kcal, from a watch or app — optional" value={form.calories} onChange={(v) => set({ calories: v })} inputMode="numeric" />
            <div className="small muted" style={{ alignSelf: 'end' }}>
              {estimate?.kcal ? (
                <>
                  Estimate: <strong style={{ color: 'var(--text)' }}>≈ {estimate.kcal} kcal</strong> ({estimate.met?.toFixed(1)} MET). {form.calories !== undefined ? 'Your value is used instead.' : 'Used if you leave Calories empty.'}
                </>
              ) : estimate?.missing === 'weight' ? (
                'Add your body weight in Settings to get a calorie estimate.'
              ) : null}
            </div>
            <label className="field full">
              Notes
              <textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Conditions, spot, how it felt…" />
            </label>
          </section>
        )}

        {error && (
          <div className="banner error" role="alert">
            {error}
          </div>
        )}
        <button className="btn primary block" onClick={save} disabled={!sport}>
          <Icon name="check" /> Save activity
        </button>
        {existing && (
          <button className="btn danger" onClick={remove}>
            <Icon name="trash" /> Delete activity
          </button>
        )}
      </div>
    </div>
  );
}
