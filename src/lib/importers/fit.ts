import FitParser from 'fit-file-parser';
import { downsample, ImportError, normaliseType, type FileImporter, type ImportedActivity } from './types';

type FitRecord = { timestamp?: Date | string | number; heart_rate?: number };
type FitSession = {
  start_time?: Date | string | number;
  timestamp?: Date | string | number;
  total_timer_time?: number;
  total_elapsed_time?: number;
  total_distance?: number;
  total_calories?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  sport?: string | number;
  sub_sport?: string | number;
};

const ms = (v: Date | string | number | undefined): number | undefined => (v === undefined ? undefined : new Date(v).getTime());

/** Parse a Garmin .fit activity file. One FIT file can contain several sessions (multisport). */
export async function parseFit(data: ArrayBuffer): Promise<ImportedActivity[]> {
  const parser = new FitParser({ force: true, lengthUnit: 'm', speedUnit: 'm/s', mode: 'list' });
  let fit: { sessions?: FitSession[]; records?: FitRecord[]; activity?: { timestamp?: Date } };
  try {
    fit = (await parser.parseAsync(data)) as typeof fit;
  } catch (e) {
    throw new ImportError(`the file is not a valid FIT activity file (${e instanceof Error ? e.message : String(e)})`);
  }
  const records = (fit.records ?? []).filter((r) => r.timestamp !== undefined);
  const sessions = fit.sessions ?? [];

  const fromRecords = (): ImportedActivity | null => {
    if (records.length < 2) return null;
    const start = ms(records[0].timestamp)!;
    const end = ms(records[records.length - 1].timestamp)!;
    return { source: 'fit', startTime: start, durationSec: (end - start) / 1000 };
  };

  const list: ImportedActivity[] = sessions.length
    ? sessions.map((s) => {
        const start = ms(s.start_time) ?? ms(records[0]?.timestamp) ?? 0;
        const elapsed = s.total_elapsed_time ?? s.total_timer_time ?? 0;
        return {
          source: 'fit' as const,
          startTime: start,
          durationSec: Math.round(s.total_timer_time ?? elapsed),
          elapsedSec: Math.round(elapsed),
          distanceM: s.total_distance || undefined,
          calories: s.total_calories || undefined,
          avgHr: s.avg_heart_rate || undefined,
          maxHr: s.max_heart_rate || undefined,
          activityType: normaliseType(typeof s.sport === 'string' ? (s.sub_sport && typeof s.sub_sport === 'string' && s.sub_sport !== 'generic' ? s.sub_sport : s.sport) : undefined),
        };
      })
    : [fromRecords()].filter((x): x is ImportedActivity => !!x);

  if (!list.length || !list[0].startTime) throw new ImportError('the FIT file has no activity data (it may be a course, workout or settings file)');

  for (const a of list) {
    const end = a.startTime + (a.elapsedSec ?? a.durationSec) * 1000;
    const hr = records
      .filter((r) => r.heart_rate && ms(r.timestamp)! >= a.startTime && ms(r.timestamp)! <= end)
      .map((r): [number, number] => [Math.round((ms(r.timestamp)! - a.startTime) / 1000), r.heart_rate!]);
    if (hr.length) {
      a.hrSamples = downsample(hr);
      a.avgHr ??= Math.round(hr.reduce((s, x) => s + x[1], 0) / hr.length);
      a.maxHr ??= Math.max(...hr.map((x) => x[1]));
    }
    a.externalId = `fit:${a.startTime}:${Math.round(a.durationSec)}`;
  }
  return list;
}

export const fitImporter: FileImporter = {
  id: 'fit',
  label: 'Garmin FIT',
  extensions: ['.fit'],
  parse: ({ data }) => parseFit(data),
};
