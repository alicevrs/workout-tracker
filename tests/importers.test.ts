// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { FitBaseType, FitEncoder } from 'fit-file-parser';
import { describe, expect, it } from 'vitest';
import { WorkoutDB } from '../src/db/db';
import { applyActivity, findMatch } from '../src/lib/importers/apply';
import { parseFit } from '../src/lib/importers/fit';
import { importerFor } from '../src/lib/importers/index';
import { parseTcx } from '../src/lib/importers/tcx';
import { ImportError, type ImportedActivity } from '../src/lib/importers/types';
import { session } from './helpers';

const START = new Date('2026-09-14T06:30:00Z');

function makeFit(): ArrayBuffer {
  const enc = new FitEncoder();
  const ts = FitEncoder.toFitTimestamp(START);
  enc.writeMessage(0, [
    { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 }, // type = activity
    { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 }, // manufacturer = garmin
    { number: 4, size: 4, baseType: FitBaseType.Uint32, value: ts },
  ]);
  for (let i = 0; i <= 1800; i += 60) {
    enc.writeMessage(20, [
      { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + i },
      { number: 3, size: 1, baseType: FitBaseType.Uint8, value: 120 + Math.round(i / 60) },
    ], 1);
  }
  enc.writeMessage(18, [
    { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + 1800 },
    { number: 2, size: 4, baseType: FitBaseType.Uint32, value: ts },
    { number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 }, // sport = running
    { number: 7, size: 4, baseType: FitBaseType.Uint32, value: 1_860_000 }, // elapsed 1860 s (scale 1000)
    { number: 8, size: 4, baseType: FitBaseType.Uint32, value: 1_800_000 }, // timer 1800 s
    { number: 9, size: 4, baseType: FitBaseType.Uint32, value: 520_000 }, // 5200 m (scale 100)
    { number: 11, size: 2, baseType: FitBaseType.Uint16, value: 412 },
    { number: 16, size: 1, baseType: FitBaseType.Uint8, value: 148 },
    { number: 17, size: 1, baseType: FitBaseType.Uint8, value: 171 },
  ], 2);
  const bytes = enc.close();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Biking">
      <Id>2026-09-15T17:00:00Z</Id>
      <Lap StartTime="2026-09-15T17:00:00Z">
        <TotalTimeSeconds>1200</TotalTimeSeconds>
        <DistanceMeters>8000</DistanceMeters>
        <Calories>250</Calories>
        <AverageHeartRateBpm><Value>130</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>150</Value></MaximumHeartRateBpm>
        <Track>
          <Trackpoint><Time>2026-09-15T17:00:00Z</Time><HeartRateBpm><Value>110</Value></HeartRateBpm></Trackpoint>
          <Trackpoint><Time>2026-09-15T17:10:00Z</Time><HeartRateBpm><Value>140</Value></HeartRateBpm></Trackpoint>
        </Track>
      </Lap>
      <Lap StartTime="2026-09-15T17:20:00Z">
        <TotalTimeSeconds>600</TotalTimeSeconds>
        <DistanceMeters>4000</DistanceMeters>
        <Calories>150</Calories>
        <AverageHeartRateBpm><Value>160</Value></AverageHeartRateBpm>
        <MaximumHeartRateBpm><Value>175</Value></MaximumHeartRateBpm>
        <Track>
          <Trackpoint><Time>2026-09-15T17:30:00Z</Time><HeartRateBpm><Value>170</Value></HeartRateBpm></Trackpoint>
        </Track>
      </Lap>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

describe('FIT import', () => {
  it('reads start, duration, distance, calories, heart rate and sport', async () => {
    const [a] = await parseFit(makeFit());
    expect(a.startTime).toBe(START.getTime());
    expect(a.durationSec).toBe(1800);
    expect(a.elapsedSec).toBe(1860);
    expect(a.distanceM).toBeCloseTo(5200, 0);
    expect(a.calories).toBe(412);
    expect(a.avgHr).toBe(148);
    expect(a.maxHr).toBe(171);
    expect(a.activityType).toBe('running');
    expect(a.hrSamples?.length).toBe(31);
    expect(a.hrSamples?.[0]).toEqual([0, 120]);
    expect(a.externalId).toBe(`fit:${START.getTime()}:1800`);
  });

  it('gives a clear error for files that are not FIT', async () => {
    await expect(parseFit(new TextEncoder().encode('hello, not a fit file').buffer as ArrayBuffer)).rejects.toThrow(ImportError);
  });
});

describe('TCX import', () => {
  it('sums laps and reads heart rate', () => {
    const [a] = parseTcx(TCX);
    expect(a.startTime).toBe(new Date('2026-09-15T17:00:00Z').getTime());
    expect(a.durationSec).toBe(1800);
    expect(a.distanceM).toBe(12000);
    expect(a.calories).toBe(400);
    expect(a.avgHr).toBe(140); // time-weighted: (130 × 1200 + 160 × 600) / 1800
    expect(a.maxHr).toBe(175);
    expect(a.activityType).toBe('biking');
    expect(a.hrSamples).toEqual([
      [0, 110],
      [600, 140],
      [1800, 170],
    ]);
  });

  it('gives clear errors for broken files', () => {
    expect(() => parseTcx('<oops')).toThrow(/not valid XML/);
    expect(() => parseTcx('<TrainingCenterDatabase/>')).toThrow(/no activities/);
  });

  it('picks the importer by file extension', () => {
    expect(importerFor('Morning_Run.FIT').id).toBe('fit');
    expect(importerFor('ride.tcx').id).toBe('tcx');
    expect(() => importerFor('notes.gpx')).toThrow(/unsupported file type/);
  });
});

describe('creating and merging sessions', () => {
  const act = (patch: Partial<ImportedActivity> = {}): ImportedActivity => ({
    source: 'fit',
    externalId: 'fit:1',
    startTime: new Date('2026-09-14T08:00:00').getTime(),
    durationSec: 3500,
    elapsedSec: 3600,
    calories: 480,
    avgHr: 128,
    maxHr: 165,
    activityType: 'strength_training',
    ...patch,
  });

  it('creates a session with duration, calories and heart rate', async () => {
    const db = new WorkoutDB('import-1');
    const r = await applyActivity(db, act());
    expect(r.status).toBe('created');
    const s = await db.sessions.get(r.sessionId);
    expect(s).toMatchObject({ title: 'Strength training', importedCalories: 480, hr: { avg: 128, max: 165 }, source: 'fit', status: 'completed' });
    expect((s!.endedAt! - s!.startedAt) / 1000).toBe(3600);
  });

  it('does not import the same file twice', async () => {
    const db = new WorkoutDB('import-2');
    await applyActivity(db, act());
    expect((await applyActivity(db, act())).status).toBe('duplicate');
    expect(await db.sessions.count()).toBe(1);
  });

  it('adds watch data to the workout I logged in the app (same start time and duration)', async () => {
    const db = new WorkoutDB('import-3');
    const logged = session('2026-09-14', [], { startedAt: new Date('2026-09-14T08:04:00').getTime(), endedAt: new Date('2026-09-14T09:02:00').getTime(), title: 'Upper body', notes: 'felt good' });
    await db.sessions.add(logged);
    const r = await applyActivity(db, act());
    expect(r).toMatchObject({ status: 'updated', sessionId: logged.id });
    const s = await db.sessions.get(logged.id);
    expect(s).toMatchObject({ title: 'Upper body', notes: 'felt good', importedCalories: 480, externalIds: ['fit:1'] });
    expect(await db.sessions.count()).toBe(1);
  });

  it('does not match sessions that are far apart in time or duration', () => {
    const logged = session('2026-09-14', [], { startedAt: new Date('2026-09-14T08:00:00').getTime(), endedAt: new Date('2026-09-14T08:20:00').getTime() });
    expect(findMatch([logged], act())).toBeUndefined(); // 20 min vs 60 min
    expect(findMatch([logged], act({ startTime: logged.startedAt + 3 * 3600_000, durationSec: 1200, elapsedSec: 1200 }))).toBeUndefined();
    expect(findMatch([logged], act({ durationSec: 1200, elapsedSec: 1250 }))).toBe(logged);
  });

  it('treats the same activity from Strava and the FIT file as one session', async () => {
    const db = new WorkoutDB('import-4');
    await applyActivity(db, act());
    const r = await applyActivity(db, act({ source: 'strava', externalId: 'strava:999', startTime: act().startTime + 2000 }));
    expect(r.status).toBe('updated'); // only the Strava id is added
    expect(await db.sessions.count()).toBe(1);
    expect((await db.sessions.toArray())[0].externalIds).toEqual(['fit:1', 'strava:999']);
  });
});
