// Shared shape for every activity importer (FIT, TCX, Strava, and later Apple Health).

export type ImportSource = 'fit' | 'tcx' | 'strava' | 'apple_health';

export interface ImportedActivity {
  source: ImportSource;
  /** Stable id from the source when it has one (e.g. "strava:123"), used to detect re-imports. */
  externalId?: string;
  name?: string;
  /** Normalised lower-case activity type, e.g. "running", "cycling", "strength_training". */
  activityType?: string;
  /** ms since epoch */
  startTime: number;
  /** Moving / timer time in seconds. */
  durationSec: number;
  /** Total elapsed time in seconds (incl. pauses), if known. */
  elapsedSec?: number;
  distanceM?: number;
  calories?: number;
  avgHr?: number;
  maxHr?: number;
  /** [seconds from start, bpm] */
  hrSamples?: [number, number][];
}

export class ImportError extends Error {}

/**
 * A file importer. To add a new source (e.g. the Apple Health export), implement this and add it to
 * FILE_IMPORTERS in ./index.ts. Everything after parsing (matching, duplicates, saving) is shared.
 */
export interface FileImporter {
  id: ImportSource;
  label: string;
  /** Lower-case file extensions this importer handles, with the dot. */
  extensions: string[];
  parse(file: { name: string; data: ArrayBuffer }): Promise<ImportedActivity[]>;
}

/** Keep at most `max` heart-rate samples, evenly spaced. */
export function downsample(samples: [number, number][], max = 600): [number, number][] {
  if (samples.length <= max) return samples;
  const step = samples.length / max;
  const out: [number, number][] = [];
  for (let i = 0; i < max; i++) out.push(samples[Math.floor(i * step)]);
  return out;
}

export function normaliseType(t: string | undefined): string | undefined {
  if (!t) return undefined;
  return t
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}
