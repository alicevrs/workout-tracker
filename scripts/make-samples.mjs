// Writes small example activity files to samples/ so the import can be tried without a watch.
// Run: node scripts/make-samples.mjs
import { FitBaseType, FitEncoder } from 'fit-file-parser';
import { writeFileSync } from 'node:fs';

const start = new Date();
start.setDate(start.getDate() - 1);
start.setHours(7, 0, 0, 0);
const ts = FitEncoder.toFitTimestamp(start);
const enc = new FitEncoder();
enc.writeMessage(0, [
  { number: 0, size: 1, baseType: FitBaseType.Enum, value: 4 },
  { number: 1, size: 2, baseType: FitBaseType.Uint16, value: 1 },
  { number: 4, size: 4, baseType: FitBaseType.Uint32, value: ts },
]);
for (let i = 0; i <= 2400; i += 10) {
  const hr = Math.round(125 + 25 * Math.sin(i / 400) + (i / 2400) * 15);
  enc.writeMessage(20, [
    { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + i },
    { number: 3, size: 1, baseType: FitBaseType.Uint8, value: hr },
  ], 1);
}
enc.writeMessage(18, [
  { number: 253, size: 4, baseType: FitBaseType.Uint32, value: ts + 2400 },
  { number: 2, size: 4, baseType: FitBaseType.Uint32, value: ts },
  { number: 5, size: 1, baseType: FitBaseType.Enum, value: 1 },
  { number: 7, size: 4, baseType: FitBaseType.Uint32, value: 2_400_000 },
  { number: 8, size: 4, baseType: FitBaseType.Uint32, value: 2_340_000 },
  { number: 9, size: 4, baseType: FitBaseType.Uint32, value: 702_000 },
  { number: 11, size: 2, baseType: FitBaseType.Uint16, value: 498 },
  { number: 16, size: 1, baseType: FitBaseType.Uint8, value: 146 },
  { number: 17, size: 1, baseType: FitBaseType.Uint8, value: 172 },
], 2);
writeFileSync('samples/example-run.fit', enc.close());

const t0 = new Date(start.getTime() + 86_400_000 / 2);
const iso = (s) => new Date(t0.getTime() + s * 1000).toISOString();
const points = Array.from({ length: 31 }, (_, k) => `<Trackpoint><Time>${iso(k * 60)}</Time><HeartRateBpm><Value>${118 + k}</Value></HeartRateBpm></Trackpoint>`).join('');
writeFileSync(
  'samples/example-ride.tcx',
  `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
<Activities><Activity Sport="Biking"><Id>${iso(0)}</Id>
<Lap StartTime="${iso(0)}"><TotalTimeSeconds>1800</TotalTimeSeconds><DistanceMeters>14200</DistanceMeters><Calories>365</Calories>
<AverageHeartRateBpm><Value>133</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>149</Value></MaximumHeartRateBpm>
<Track>${points}</Track></Lap></Activity></Activities></TrainingCenterDatabase>
`,
);
console.log('samples written');
