import 'fake-indexeddb/auto';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { applyActivity } from '../src/lib/importers/apply';
import { importerFor } from '../src/lib/importers/index';
import { parseCsv, parseStravaActivitiesCsv, parseStravaArchive, parseStravaDate } from '../src/lib/importers/stravaArchive';
import { sessionActivity } from '../src/lib/activities';

// Shape of Strava's export: repeated column names, quoted fields, text with commas and newlines.
const CSV = [
  'Activity ID,Activity Date,Activity Name,Activity Type,Activity Description,Elapsed Time,Distance,Max Heart Rate,Relative Effort,Commute,Elapsed Time,Moving Time,Distance,Max Speed,Elevation Gain,Calories,Average Heart Rate',
  '1111,"Oct 5, 2026, 4:12:33 PM",Saturday Lake Run,Run,"Easy, with Michele",3725,10.21,172,45,false,3725.0,3600.0,10210.5,4.1,85.0,702.0,151.3',
  '2222,"Sep 20, 2026, 7:05:00 AM",Bondone,Backcountry Ski,"Line 1\nLine 2",14400,9.8,,,false,14400,12000,9800,,1250,,',
  '3333,"Aug 2, 2026, 12:00:00 PM",Kite session,Kitesurf,,5400,25.1,,,false,5400,5000,25100,,,,',
  '4444,"Aug 3, 2026, 6:30:00 PM",Gym,Weight Training,,3600,0,,,false,3600,3600,0,,,,',
].join('\n');

describe('Strava archive import', () => {
  it('parses CSV with quotes, commas and newlines', () => {
    expect(parseCsv('a,"b, c","d ""e""\nf"\n1,2,3')).toEqual([
      ['a', 'b, c', 'd "e"\nf'],
      ['1', '2', '3'],
    ]);
  });

  it('reads Strava dates as UTC', () => {
    expect(parseStravaDate('Oct 5, 2026, 4:12:33 PM')).toBe(Date.UTC(2026, 9, 5, 16, 12, 33));
    expect(parseStravaDate('Jan 1, 2026, 12:05:00 AM')).toBe(Date.UTC(2026, 0, 1, 0, 5, 0));
  });

  it('maps every column the app uses', () => {
    const [run, ski, kite, gym] = parseStravaActivitiesCsv(CSV);
    expect(run).toMatchObject({
      source: 'strava',
      externalId: 'strava:1111',
      name: 'Saturday Lake Run',
      description: 'Easy, with Michele',
      activityType: 'run',
      durationSec: 3600,
      elapsedSec: 3725,
      distanceM: 10210.5,
      elevationGainM: 85,
      calories: 702,
      avgHr: 151,
      maxHr: 172,
    });
    expect(ski).toMatchObject({ activityType: 'backcountry_ski', elevationGainM: 1250, durationSec: 12000, calories: undefined });
    expect(kite.activityType).toBe('kitesurf');
    expect(gym.activityType).toBe('weight_training');
  });

  it('reads activities.csv from the archive zip', () => {
    const zip = zipSync({ 'export_123/activities.csv': strToU8(CSV), 'export_123/profile.csv': strToU8('x') });
    const list = parseStravaArchive(zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer, 'export_123.zip');
    expect(list).toHaveLength(4);
    expect(importerFor('export_123.zip').id).toBe('strava');
  });

  it('gives clear errors for other files', () => {
    expect(() => parseStravaActivitiesCsv('a,b\n1,2')).toThrow(/not Strava/);
    const zip = zipSync({ 'other.txt': strToU8('x') });
    expect(() => parseStravaArchive(zip.buffer as ArrayBuffer, 'x.zip')).toThrow(/no activities.csv/);
    expect(() => parseStravaArchive(strToU8('nope').buffer as ArrayBuffer, 'x.zip')).toThrow(/not a valid zip/);
  });

  it('creates sessions as the right sport and does not duplicate on re-import', async () => {
    const db = new WorkoutDB('strava-archive');
    const list = parseStravaActivitiesCsv(CSV);
    for (const a of list) await applyActivity(db, a);
    for (const a of list) expect((await applyActivity(db, a)).status).toBe('duplicate');
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(4);
    const labels = sessions.map((s) => sessionActivity(s).label).sort();
    expect(labels).toEqual(['Gym', 'Kitesurfing', 'Running', 'Ski touring (uphill)']);
    expect(sessions.find((s) => s.title === 'Saturday Lake Run')).toMatchObject({ notes: 'Easy, with Michele', importedCalories: 702, elevationGainM: 85 });
  });
});
