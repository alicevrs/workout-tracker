// Date helpers. Weeks start on Monday. Dates without time use the local calendar (YYYY-MM-DD).

export const DAY_MS = 86_400_000;

export function toDateKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parse YYYY-MM-DD as local midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Monday 00:00 of the week containing ms. */
export function startOfWeek(ms: number): number {
  const d = new Date(startOfDay(ms));
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}

export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function startOfYear(ms: number): number {
  return new Date(new Date(ms).getFullYear(), 0, 1).getTime();
}

export function addDays(ms: number, days: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
}

export type Grain = 'day' | 'week' | 'month' | 'year';

export function startOf(grain: Grain, ms: number): number {
  switch (grain) {
    case 'day':
      return startOfDay(ms);
    case 'week':
      return startOfWeek(ms);
    case 'month':
      return startOfMonth(ms);
    case 'year':
      return startOfYear(ms);
  }
}

export function nextStart(grain: Grain, ms: number): number {
  switch (grain) {
    case 'day':
      return addDays(ms, 1);
    case 'week':
      return addDays(ms, 7);
    case 'month':
      return addMonths(ms, 1);
    case 'year':
      return new Date(new Date(ms).getFullYear() + 1, 0, 1).getTime();
  }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatBucket(grain: Grain, ms: number): string {
  const d = new Date(ms);
  switch (grain) {
    case 'day':
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    case 'week':
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    case 'month':
      return `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`;
    case 'year':
      return String(d.getFullYear());
  }
}

export function formatDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatShortDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** 75 -> "1:15", 3725 -> "1:02:05" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** 3725 -> "1 h 2 min" */
export function formatDuration(totalSec: number): string {
  const s = Math.round(totalSec);
  if (s < 60) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

export function ageFromBirthDate(birthDate: string, at: number = Date.now()): number {
  const b = fromDateKey(birthDate);
  const now = new Date(at);
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age;
}
