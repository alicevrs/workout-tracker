// Classifying sessions by activity (gym vs. sports) for the calendar and the activity statistics.

import { GROUP_INFO, isGymType, resolveSport, type Sport, type SportGroup } from '../data/sports';
import type { Session } from '../db/types';
import { addDays, formatBucket, fromDateKey, nextStart, startOf, startOfWeek, toDateKey, type Grain } from './dates';

export interface ActivityKind {
  group: SportGroup;
  sport?: Sport;
  /** Short label, e.g. "Gym", "Hiking". */
  label: string;
  color: string;
}

/** A session is “gym” when it has planned blocks or is a strength activity; otherwise its sport. */
export function sessionActivity(s: Session): ActivityKind {
  const sport = s.blocks.length === 0 ? resolveSport(s.activityType) : undefined;
  if (sport) return { group: sport.group, sport, label: sport.label, color: GROUP_INFO[sport.group].color };
  if (s.blocks.length > 0 || isGymType(s.activityType) || !s.activityType) return { group: 'gym', label: 'Gym', color: GROUP_INFO.gym.color };
  return { group: 'other', label: s.title, color: GROUP_INFO.other.color };
}

/** True when the session is a sport activity edited with the activity form (no sets/blocks). */
export function isActivitySession(s: Session): boolean {
  return s.blocks.length === 0 && !!resolveSport(s.activityType);
}

/** Sessions grouped by calendar day (YYYY-MM-DD). */
export function sessionsByDay(sessions: Session[]): Map<string, Session[]> {
  const m = new Map<string, Session[]>();
  for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
  for (const list of m.values()) list.sort((a, b) => a.startedAt - b.startedAt);
  return m;
}

export interface ActiveDaySummary {
  /** Days in the range (up to today). */
  days: number;
  /** Days with at least one activity. */
  activeDays: number;
  /** Number of days on which each group was done (a day with gym and a run counts for both). */
  daysByGroup: Partial<Record<SportGroup, number>>;
  /** Number of days on which each sport (or "gym") was done, by label. */
  daysByLabel: Record<string, number>;
}

export function activeDays(sessions: Session[], from: number, to: number): ActiveDaySummary {
  const byDay = sessionsByDay(sessions.filter((s) => s.startedAt >= from && s.startedAt <= to));
  const daysByGroup: Partial<Record<SportGroup, number>> = {};
  const daysByLabel: Record<string, number> = {};
  for (const list of byDay.values()) {
    const groups = new Set(list.map((s) => sessionActivity(s).group));
    const labels = new Set(list.map((s) => sessionActivity(s).label));
    for (const g of groups) daysByGroup[g] = (daysByGroup[g] ?? 0) + 1;
    for (const l of labels) daysByLabel[l] = (daysByLabel[l] ?? 0) + 1;
  }
  let days = 0;
  for (let t = from; t <= to; t = addDays(t, 1)) days++;
  return { days, activeDays: byDay.size, daysByGroup, daysByLabel };
}

/** Monday-first grid of weeks covering the month that contains `monthStart`. */
export function monthGrid(monthStart: number): { key: string; date: Date; inMonth: boolean }[][] {
  const first = new Date(monthStart);
  const month = first.getMonth();
  const weeks: { key: string; date: Date; inMonth: boolean }[][] = [];
  let t = startOfWeek(monthStart);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(t);
      week.push({ key: toDateKey(t), date: d, inMonth: d.getMonth() === month });
      t = addDays(t, 1);
    }
    weeks.push(week);
  } while (new Date(t).getMonth() === month);
  return weeks;
}

/** km/h and min/km for display. */
export function paceInfo(distanceM?: number, durationSec?: number): { kmh?: number; minPerKm?: number } {
  if (!distanceM || !durationSec) return {};
  const km = distanceM / 1000;
  return { kmh: km / (durationSec / 3600), minPerKm: durationSec / 60 / km };
}

export interface MixBucket {
  start: number;
  label: string;
  /** Days with any activity. */
  active: number;
  /** Days per group (a day with two groups counts once for each). */
  [group: string]: number | string;
}

/** Active days per week/month, split by activity group, for the activity-mix chart. */
export function activityMix(sessions: Session[], grain: Grain, from: number, to: number): MixBucket[] {
  const out: MixBucket[] = [];
  for (let t = startOf(grain, from); t <= to; t = nextStart(grain, t)) out.push({ start: t, label: formatBucket(grain, t), active: 0 });
  const index = new Map(out.map((b, i) => [b.start, i]));
  for (const [day, list] of sessionsByDay(sessions.filter((s) => s.startedAt >= startOf(grain, from) && s.startedAt <= to))) {
    const t = fromDateKey(day).getTime();
    const b = out[index.get(startOf(grain, t)) ?? -1];
    if (!b) continue;
    b.active += 1;
    for (const g of new Set(list.map((s) => sessionActivity(s).group))) b[g] = ((b[g] as number) ?? 0) + 1;
  }
  return out;
}
