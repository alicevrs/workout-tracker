// Strava bulk export ("Download your account" archive). Free for every Strava account.
// The archive is a .zip with activities.csv (one row per activity) and the original files.
// The CSV has everything the app needs (type, start, durations, distance, elevation, calories,
// heart rate), so it is the only file read. Activity ids become "strava:<id>", the same ids the
// Strava API import uses, so the two never create duplicates.

import { unzipSync } from 'fflate';
import { ImportError, normaliseType, type FileImporter, type ImportedActivity } from './types';

/** RFC 4180 CSV parser (quoted fields, escaped quotes, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 5, 2026, 4:12:33 PM" (UTC, as in Strava's export) → ms. */
export function parseStravaDate(s: string): number {
  const m = s.trim().match(/^([A-Za-z]{3})[a-z]* (\d{1,2}),? (\d{4}),? (\d{1,2}):(\d{2})(?::(\d{2}))? ?([AP]M)?$/i);
  if (m) {
    const month = MONTHS.findIndex((x) => x.toLowerCase() === m[1].toLowerCase());
    let h = Number(m[4]) % 12;
    if (m[7]?.toUpperCase() === 'PM') h += 12;
    if (!m[7]) h = Number(m[4]);
    return Date.UTC(Number(m[3]), month, Number(m[2]), h, Number(m[5]), Number(m[6] ?? 0));
  }
  const t = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(s) ? s : `${s} UTC`);
  if (Number.isNaN(t)) throw new ImportError(`unknown date format “${s}”`);
  return t;
}

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || s.trim() === '') return undefined;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

export function parseStravaActivitiesCsv(text: string): ImportedActivity[] {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  if (rows.length === 0) throw new ImportError('the file is empty');
  const head = rows[0].map((h) => h.trim());
  const first = (name: string) => head.indexOf(name);
  const last = (name: string) => head.lastIndexOf(name);
  if (first('Activity ID') < 0 || first('Activity Date') < 0) throw new ImportError('this is not Strava’s activities.csv (missing “Activity ID” / “Activity Date” columns)');
  // Strava repeats some columns: the first “Elapsed Time” is in seconds; when “Distance” appears
  // twice, the second one is in metres (the first uses the profile unit).
  const iDist = first('Distance') !== last('Distance') ? last('Distance') : first('Distance');
  const distInKm = first('Distance') === last('Distance');
  const col = {
    id: first('Activity ID'),
    date: first('Activity Date'),
    name: first('Activity Name'),
    type: first('Activity Type'),
    desc: first('Activity Description'),
    elapsed: first('Elapsed Time'),
    moving: first('Moving Time'),
    elevation: first('Elevation Gain'),
    calories: first('Calories'),
    avgHr: first('Average Heart Rate'),
    maxHr: first('Max Heart Rate'),
  };
  const out: ImportedActivity[] = [];
  for (const r of rows.slice(1)) {
    const id = r[col.id]?.trim();
    if (!id) continue;
    const elapsed = num(r[col.elapsed]) ?? 0;
    const moving = (col.moving >= 0 ? num(r[col.moving]) : undefined) ?? elapsed;
    let dist = iDist >= 0 ? num(r[iDist]) : undefined;
    if (dist !== undefined && distInKm) dist *= 1000;
    out.push({
      source: 'strava',
      externalId: `strava:${id}`,
      name: r[col.name]?.trim() || undefined,
      description: col.desc >= 0 ? r[col.desc]?.trim() || undefined : undefined,
      activityType: normaliseType(r[col.type]?.trim()),
      startTime: parseStravaDate(r[col.date]),
      durationSec: Math.round(moving),
      elapsedSec: Math.round(elapsed),
      distanceM: dist || undefined,
      elevationGainM: col.elevation >= 0 ? num(r[col.elevation]) || undefined : undefined,
      calories: col.calories >= 0 ? num(r[col.calories]) || undefined : undefined,
      avgHr: col.avgHr >= 0 && num(r[col.avgHr]) ? Math.round(num(r[col.avgHr])!) : undefined,
      maxHr: col.maxHr >= 0 && num(r[col.maxHr]) ? Math.round(num(r[col.maxHr])!) : undefined,
    });
  }
  return out;
}

export function parseStravaArchive(data: ArrayBuffer, fileName: string): ImportedActivity[] {
  if (fileName.toLowerCase().endsWith('.csv')) return parseStravaActivitiesCsv(new TextDecoder().decode(data));
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(new Uint8Array(data), { filter: (f) => /(^|\/)activities\.csv$/i.test(f.name) });
  } catch {
    throw new ImportError('the file is not a valid zip archive');
  }
  const csv = Object.values(files)[0];
  if (!csv) throw new ImportError('the zip has no activities.csv. Choose the archive from Strava (“Download your account”)');
  return parseStravaActivitiesCsv(new TextDecoder().decode(csv));
}

export const stravaArchiveImporter: FileImporter = {
  id: 'strava',
  label: 'Strava archive',
  extensions: ['.zip', '.csv'],
  parse: async ({ name, data }) => parseStravaArchive(data, name),
};
