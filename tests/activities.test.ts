import { describe, expect, it } from 'vitest';
import exercises from '../src/data/exercises.json';
import { metForSpeed, resolveSport, SPORTS, sportMET } from '../src/data/sports';
import { MUSCLE_IDS } from '../src/data/muscles';
import { DEFAULT_PROFILE } from '../src/db/repo';
import type { Exercise, Profile } from '../src/db/types';
import { activeDays, activityMix, monthGrid, sessionActivity } from '../src/lib/activities';
import { sessionCalories } from '../src/lib/calories';
import { sessionMuscleLoad } from '../src/lib/muscleLoad';
import { block, session, set } from './helpers';

const exMap = new Map((exercises as Exercise[]).map((e) => [e.id, e]));
const profile: Profile = { ...DEFAULT_PROFILE, weightKg: 60 };
const ctx = { profile, weights: [], exercises: exMap };
const day = (d: string, h = 10) => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime();

describe('sport catalog', () => {
  it('has unique ids and valid muscles', () => {
    expect(new Set(SPORTS.map((s) => s.id)).size).toBe(SPORTS.length);
    for (const s of SPORTS) for (const m of [...s.primary, ...s.secondary]) expect(MUSCLE_IDS).toContain(m);
  });

  it('recognises Strava and Garmin activity types', () => {
    expect(resolveSport('Kitesurf')?.id).toBe('kitesurfing');
    expect(resolveSport('BackcountrySki')?.id).toBe('ski_touring');
    expect(resolveSport('backcountry_ski')?.id).toBe('ski_touring');
    expect(resolveSport('AlpineSki')?.id).toBe('downhill_skiing');
    expect(resolveSport('alpine_skiing')?.id).toBe('downhill_skiing');
    expect(resolveSport('RockClimbing')?.id).toBe('sport_climbing');
    expect(resolveSport('TrailRun')?.id).toBe('trail_running');
    expect(resolveSport('wakeboarding')?.id).toBe('wakeboarding');
    expect(resolveSport('Biking')?.id).toBe('cycling');
    expect(resolveSport('WeightTraining')).toBeUndefined(); // gym, not a sport
    expect(resolveSport('something_new')).toBeUndefined();
  });
});

describe('activity intensity (MET)', () => {
  it('uses speed for running, walking and cycling when distance and time are known', () => {
    expect(metForSpeed('run', 10)).toBe(9.8);
    expect(metForSpeed('run', 12.5)).toBe(11.8);
    expect(metForSpeed('walk', 5)).toBe(3.5);
    expect(metForSpeed('bike', 24)).toBe(10.0);
    expect(sportMET(resolveSport('running')!, { intensity: 'light', hours: 1, distanceM: 12_000 })).toBe(11.5); // 12 km/h
  });

  it('scales by effort when speed is unknown', () => {
    const kite = resolveSport('kitesurfing')!;
    expect(sportMET(kite, { intensity: 'moderate', hours: 2 })).toBe(7.0);
    expect(sportMET(kite, { intensity: 'vigorous', hours: 2 })).toBe(9.1);
  });

  it('adds intensity for steep climbs on foot and on skis', () => {
    const tour = resolveSport('ski_touring')!;
    expect(sportMET(tour, { intensity: 'moderate', hours: 2, elevationGainM: 1200 })).toBe(10.0); // 7 + 600 m/h ÷ 200
    expect(sportMET(resolveSport('hiking')!, { intensity: 'moderate', hours: 5, elevationGainM: 500 })).toBe(6.5);
    expect(sportMET(resolveSport('kitesurfing')!, { intensity: 'moderate', hours: 1, elevationGainM: 500 })).toBe(7.0); // not a climbing sport
  });

  it('estimates calories for a manually logged hike', () => {
    const hike = session('2026-09-06', [], { activityType: 'hiking', startedAt: day('2026-09-06', 8), endedAt: day('2026-09-06', 12), elevationGainM: 800 });
    const c = sessionCalories(hike, ctx);
    expect(c).toMatchObject({ source: 'estimated', met: 7.0, kcal: Math.round(7.0 * 60 * 4) });
  });

  it('shows typed-in calories as entered, not imported', () => {
    const s = session('2026-09-06', [], { activityType: 'wakeboarding', importedCalories: 300, calorieSource: 'manual' });
    expect(sessionCalories(s, ctx)).toEqual({ kcal: 300, source: 'manual' });
  });
});

describe('calendar and activity mix', () => {
  const gym = session('2026-09-01', [block([set('back-squat', 80, 5)])]);
  const run = session('2026-09-01', [], { activityType: 'running', startedAt: day('2026-09-01', 18) });
  const kite = session('2026-09-03', [], { activityType: 'kitesurfing' });
  const ski = session('2026-09-10', [], { activityType: 'AlpineSki', source: 'strava' });

  it('classifies sessions', () => {
    expect(sessionActivity(gym)).toMatchObject({ group: 'gym', label: 'Gym' });
    expect(sessionActivity(kite)).toMatchObject({ group: 'water', label: 'Kitesurfing' });
    expect(sessionActivity(ski)).toMatchObject({ group: 'snow', label: 'Downhill skiing' });
  });

  it('counts active days and days per activity type', () => {
    const sum = activeDays([gym, run, kite, ski], day('2026-09-01', 0), day('2026-09-30', 23));
    expect(sum).toMatchObject({ days: 30, activeDays: 3, daysByGroup: { gym: 1, foot: 1, water: 1, snow: 1 } });
  });

  it('builds weekly buckets for the activity-mix chart', () => {
    const mix = activityMix([gym, run, kite, ski], 'week', day('2026-09-01', 0), day('2026-09-14', 23));
    expect(mix.map((b) => b.active)).toEqual([2, 1, 0]); // weeks of 31 Aug, 7 Sep, 14 Sep
    expect(mix[0]).toMatchObject({ gym: 1, foot: 1, water: 1 });
  });

  it('lays out a Monday-first month grid', () => {
    const weeks = monthGrid(new Date(2026, 8, 1).getTime()); // September 2026 starts on a Tuesday
    expect(weeks[0][0]).toMatchObject({ key: '2026-08-31', inMonth: false });
    expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
  });

  it('colours the muscle map from the sport', () => {
    const load = sessionMuscleLoad(kite, exMap);
    expect(load.abs).toBeGreaterThan(0);
    expect(load.chest).toBe(0);
  });
});

describe('history filter', () => {
  it('groups workouts by saved workout and activities by sport, not by title', async () => {
    const { historyFilterKey } = await import('../src/lib/activities');
    const { session, block, set } = await import('./helpers');
    const names = (id: string) => (id === 'p1' ? 'Legs & glutes 1' : undefined);
    const gym = session('2026-10-01', [block([set('back-squat', 100, 5)])], { programId: 'p1', title: 'Old name' });
    expect(historyFilterKey(gym, names)).toEqual({ key: 'w:legs & glutes 1', label: 'Legs & glutes 1', workout: true });
    const run1 = session('2026-10-02', [], { activityType: 'running', title: 'Morning jog' });
    const run2 = session('2026-10-03', [], { activityType: 'Run', title: 'Evening run by the lake' });
    expect(historyFilterKey(run1, names).key).toBe(historyFilterKey(run2, names).key);
    expect(historyFilterKey(run1, names)).toMatchObject({ label: 'Running', workout: false });
  });
});
