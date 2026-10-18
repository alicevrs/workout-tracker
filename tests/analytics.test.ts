import { describe, expect, it } from 'vitest';
import { BLOCK_MEASURES, blockProgressItems, bucketize, comparisonRanges, countBy, cumulative, inRange, measuresWithData, paceSeries, pctChange, periodTotals, streaks, workoutProgressItems } from '../src/lib/analytics';
import { block, session, set } from './helpers';

const t = (d: string) => new Date(`${d}T12:00:00`).getTime();

describe('period comparison', () => {
  it('compares this month with the full previous month', () => {
    const [cur, prev] = comparisonRanges('month', t('2026-10-12'));
    expect(new Date(cur.from).toDateString()).toBe(new Date(2026, 9, 1).toDateString());
    expect(new Date(prev.from).toDateString()).toBe(new Date(2026, 8, 1).toDateString());
    expect(prev.to).toBe(cur.from - 1);
  });

  it('weeks start on Monday', () => {
    const [cur] = comparisonRanges('week', t('2026-10-15')); // Thursday
    expect(new Date(cur.from).getDay()).toBe(1);
  });

  it('computes percent differences', () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(50, 100)).toBe(-50);
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(0, 0)).toBe(0);
  });

  it('totals a period from its sessions', () => {
    const sessions = [
      session('2026-09-10', [block([set('bench', 100, 10)])]),
      session('2026-10-02', [block([set('bench', 100, 10), set('bench', 100, 10)])]),
      session('2026-10-05', [block([set('bench', 100, 5)])]),
    ];
    const [cur, prev] = comparisonRanges('month', t('2026-10-12'));
    const a = periodTotals(inRange(sessions, cur.from, cur.to), () => 300);
    const b = periodTotals(inRange(sessions, prev.from, prev.to), () => 300);
    expect(a).toMatchObject({ sessions: 2, volume: 2500, sets: 3, reps: 25, calories: 600, duration: 120, avgDuration: 60 });
    expect(b).toMatchObject({ sessions: 1, volume: 1000 });
    expect(pctChange(a.volume, b.volume)).toBe(150);
  });

  it('builds pace (running total by day) for both periods', () => {
    const a = [session('2026-10-01', []), session('2026-10-03', [])];
    const b = [session('2026-09-02', [])];
    const pace = paceSeries(a, t('2026-10-01'), b, t('2026-09-01'), 4, () => 1);
    expect(pace).toEqual([
      { day: 1, current: 1, previous: 0 },
      { day: 2, current: 1, previous: 1 },
      { day: 3, current: 2, previous: 1 },
      { day: 4, current: 2, previous: 1 },
    ]);
  });
});

describe('grouping and cumulative totals', () => {
  const sessions = [session('2026-01-05', []), session('2026-01-07', []), session('2026-01-20', []), session('2026-03-01', [])];

  it('fills empty buckets by month', () => {
    const b = bucketize(sessions, 'month', t('2026-01-01'), t('2026-03-31'), () => 1);
    expect(b.map((x) => x.value)).toEqual([3, 0, 1]);
    expect(b.map((x) => x.label)).toEqual(['Jan 26', 'Feb 26', 'Mar 26']);
    expect(cumulative(b).map((x) => x.value)).toEqual([3, 3, 4]);
  });

  it('groups by week starting Monday', () => {
    const b = bucketize(sessions, 'week', t('2026-01-05'), t('2026-01-25'), () => 1);
    expect(b.map((x) => x.value)).toEqual([2, 0, 1]);
  });
});

describe('streaks', () => {
  it('counts daily and weekly streaks', () => {
    const s = ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-07', '2026-10-11', '2026-10-12'].map((d) => session(d, []));
    expect(streaks(s, t('2026-10-12'))).toEqual({ currentDays: 2, longestDays: 3, currentWeeks: 3, longestWeeks: 3 });
  });
  it('is zero with no workouts', () => {
    expect(streaks([], t('2026-10-12'))).toEqual({ currentDays: 0, longestDays: 0, currentWeeks: 0, longestWeeks: 0 });
  });
});

describe('progress of training blocks and workouts', () => {
  it('follows a training block by name and offers only measures with data', () => {
    const sessions = [
      session('2026-10-01', [block([set('squat', 50, 10)], { name: 'Legs' }), block([set('plank', 0, 0)], { name: 'Core', skipped: true })]),
      session('2026-10-08', [block([set('squat', 60, 10), set('lunge', 20, 8)], { name: 'legs ' })]),
    ];
    const items = blockProgressItems(sessions);
    expect(items.map((i) => i.label)).toEqual(['Legs']);
    expect(items[0].points.map((p) => p.values.volume)).toEqual([500, 760]);
    expect(measuresWithData(items[0], BLOCK_MEASURES).map((m) => m.key)).toEqual(['volume', 'maxWeight', 'reps']);
  });

  it('groups workouts and counts them by kind', () => {
    const sessions = [session('2026-10-01', [], { title: 'Pump' }), session('2026-10-02', [], { title: 'Pump' }), session('2026-10-03', [], { title: 'Run' })];
    const key = (s: { title: string }) => ({ key: s.title, label: s.title });
    expect(countBy(sessions, key)).toEqual([
      { label: 'Pump', n: 2 },
      { label: 'Run', n: 1 },
    ]);
    expect(workoutProgressItems(sessions, key)[0].points).toHaveLength(2);
  });
});
