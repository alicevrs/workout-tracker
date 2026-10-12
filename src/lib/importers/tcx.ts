import { downsample, ImportError, normaliseType, type FileImporter, type ImportedActivity } from './types';

const byTag = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS('*', tag));
const first = (el: Element | Document, tag: string) => byTag(el, tag)[0];
const num = (el: Element | undefined) => (el?.textContent ? Number(el.textContent.trim()) : undefined);

/** Parse a Training Center XML (.tcx) file using the browser's DOMParser. */
export function parseTcx(xml: string): ImportedActivity[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new ImportError('the file is not valid XML, so it cannot be a TCX file');
  const activities = byTag(doc, 'Activity');
  if (!activities.length) throw new ImportError('the TCX file contains no activities');

  return activities.map((act) => {
    const id = first(act, 'Id')?.textContent?.trim();
    const laps = byTag(act, 'Lap');
    const startTime = new Date(id ?? laps[0]?.getAttribute('StartTime') ?? '').getTime();
    if (Number.isNaN(startTime)) throw new ImportError('the TCX activity has no valid start time');

    let duration = 0;
    let distance = 0;
    let calories = 0;
    let hrWeighted = 0;
    let hrTime = 0;
    let maxHr = 0;
    for (const lap of laps) {
      // Use direct children so trackpoint values are not picked up.
      const child = (tag: string) => Array.from(lap.children).find((c) => c.localName === tag);
      const t = num(child('TotalTimeSeconds')) ?? 0;
      duration += t;
      distance += num(child('DistanceMeters')) ?? 0;
      calories += num(child('Calories')) ?? 0;
      const avg = num(child('AverageHeartRateBpm') ? first(child('AverageHeartRateBpm')!, 'Value') : undefined);
      if (avg) {
        hrWeighted += avg * t;
        hrTime += t;
      }
      maxHr = Math.max(maxHr, num(child('MaximumHeartRateBpm') ? first(child('MaximumHeartRateBpm')!, 'Value') : undefined) ?? 0);
    }

    const samples: [number, number][] = [];
    let lastTime = startTime;
    for (const tp of byTag(act, 'Trackpoint')) {
      const time = new Date(first(tp, 'Time')?.textContent ?? '').getTime();
      if (Number.isNaN(time)) continue;
      lastTime = Math.max(lastTime, time);
      const hrEl = first(tp, 'HeartRateBpm');
      const bpm = hrEl ? num(first(hrEl, 'Value')) : undefined;
      if (bpm) samples.push([Math.round((time - startTime) / 1000), bpm]);
    }
    if (!duration) duration = (lastTime - startTime) / 1000;

    const avgFromSamples = samples.length ? Math.round(samples.reduce((s, x) => s + x[1], 0) / samples.length) : undefined;
    return {
      source: 'tcx' as const,
      externalId: `tcx:${id ?? startTime}`,
      activityType: normaliseType(act.getAttribute('Sport') ?? undefined),
      startTime,
      durationSec: Math.round(duration),
      elapsedSec: Math.round(Math.max(duration, (lastTime - startTime) / 1000)),
      distanceM: distance || undefined,
      calories: calories || undefined,
      avgHr: hrTime ? Math.round(hrWeighted / hrTime) : avgFromSamples,
      maxHr: maxHr || (samples.length ? Math.max(...samples.map((s) => s[1])) : undefined),
      hrSamples: samples.length ? downsample(samples) : undefined,
    };
  });
}

export const tcxImporter: FileImporter = {
  id: 'tcx',
  label: 'TCX',
  extensions: ['.tcx'],
  parse: async ({ data }) => parseTcx(new TextDecoder().decode(data)),
};
