// EXTENSION POINT — Apple Health (not implemented).
//
// A web app cannot read Apple Health directly. The planned route is a manual import of the
// export file: on iPhone, Health app → profile picture → “Export All Health Data” produces
// export.zip containing apple_health_export/export.xml.
//
// To implement:
//   1. Unzip in the browser (e.g. with a small zip library) or ask the user to pick export.xml.
//   2. Stream-parse export.xml (it can be hundreds of MB, so avoid DOMParser on the whole file)
//      and read the <Workout> elements:
//        workoutActivityType="HKWorkoutActivityTypeRunning"  → activityType "running"
//        startDate / endDate                                → startTime, elapsedSec
//        duration + durationUnit                            → durationSec
//        <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="…" unit="kcal">
//        <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="…" maximum="…">
//        <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceWalkingRunning" sum="…" unit="km">
//   3. Return ImportedActivity objects with source 'apple_health' and externalId
//      `apple_health:${startTime}:${duration}`.
//   4. Add the importer to FILE_IMPORTERS in ./index.ts (extension '.xml' or '.zip').
// Matching with existing sessions, duplicate detection and saving are already shared.

import type { FileImporter } from './types';

export const appleHealthImporter: FileImporter | null = null;
