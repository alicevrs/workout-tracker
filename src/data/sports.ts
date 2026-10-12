// Sports and outdoor activities that are logged as a whole (time, distance, elevation…)
// rather than as sets. Used for manual entries, imported activities (Garmin, Strava),
// calorie estimates, the muscle map and the activity calendar.
//
// MET values are approximations based on the Compendium of Physical Activities
// (moderate effort). Effort scales them (light × 0.75, vigorous × 1.3) unless a speed table
// gives a better estimate from distance and time.

import type { MuscleId } from '../db/types';

export type SportGroup = 'gym' | 'foot' | 'cycling' | 'water' | 'snow' | 'climbing' | 'fitness' | 'team' | 'other';

export const GROUP_INFO: Record<SportGroup, { label: string; color: string }> = {
  gym: { label: 'Gym', color: '#fdd70d' },
  foot: { label: 'Walk, run & hike', color: '#3987e5' },
  cycling: { label: 'Cycling', color: '#199e70' },
  water: { label: 'Water sports', color: '#9085e9' },
  snow: { label: 'Snow sports', color: '#e8e8e8' },
  climbing: { label: 'Climbing', color: '#d95926' },
  fitness: { label: 'Fitness & mind-body', color: '#d55181' },
  team: { label: 'Team & racket', color: '#e66767' },
  other: { label: 'Other', color: '#8a8a8a' },
};

export type SpeedTable = 'walk' | 'run' | 'bike';

export interface Sport {
  id: string;
  label: string;
  group: SportGroup;
  /** Moderate-effort MET. */
  met: number;
  /** Ask for distance in the form. */
  distance: boolean;
  /** Ask for elevation gain in the form. */
  elevation: boolean;
  /** Use a speed-based MET when distance and time are known. */
  speedTable?: SpeedTable;
  primary: MuscleId[];
  secondary: MuscleId[];
  /** Activity type names used by Garmin (FIT/TCX) and Strava, normalised to snake_case. */
  aliases: string[];
}


export const SPORTS: Sport[] = [
  // Walk, run & hike
  { id: 'walking', label: 'Walking', group: 'foot', met: 3.5, distance: true, elevation: false, speedTable: 'walk', primary: ['calves', 'quads'], secondary: ['glutes', 'hamstrings'], aliases: ['walk', 'walking', 'virtual_walk'] },
  { id: 'running', label: 'Running', group: 'foot', met: 9.8, distance: true, elevation: true, speedTable: 'run', primary: ['quads', 'hamstrings', 'calves'], secondary: ['glutes', 'abs'], aliases: ['run', 'running', 'virtual_run', 'treadmill_running', 'street', 'track', 'indoor_running', 'treadmill'] },
  { id: 'trail_running', label: 'Trail running', group: 'foot', met: 9.0, distance: true, elevation: true, primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'abs'], aliases: ['trail_run', 'trail_running', 'trail', 'ultra_run'] },
  { id: 'hiking', label: 'Hiking', group: 'foot', met: 6.0, distance: true, elevation: true, primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'lower_back'], aliases: ['hike', 'hiking', 'mountaineering'] },
  { id: 'snowshoeing', label: 'Snowshoeing', group: 'foot', met: 6.5, distance: true, elevation: true, primary: ['quads', 'glutes'], secondary: ['calves', 'hamstrings'], aliases: ['snowshoe', 'snowshoeing'] },
  // Cycling
  { id: 'cycling', label: 'Road cycling', group: 'cycling', met: 7.5, distance: true, elevation: true, speedTable: 'bike', primary: ['quads'], secondary: ['glutes', 'hamstrings', 'calves'], aliases: ['ride', 'cycling', 'road', 'biking', 'gravel_ride', 'gravel_cycling', 'e_bike_ride', 'road_cycling'] },
  { id: 'mountain_biking', label: 'Mountain biking', group: 'cycling', met: 8.5, distance: true, elevation: true, primary: ['quads', 'glutes'], secondary: ['hamstrings', 'calves', 'forearms', 'abs'], aliases: ['mountain_bike_ride', 'mountain', 'mountain_biking', 'e_mountain_bike_ride', 'downhill'] },
  { id: 'indoor_cycling', label: 'Indoor cycling', group: 'cycling', met: 6.8, distance: true, elevation: false, primary: ['quads'], secondary: ['glutes', 'hamstrings', 'calves'], aliases: ['virtual_ride', 'virtualride', 'indoor_cycling', 'spin'] },
  // Water
  { id: 'swimming', label: 'Swimming', group: 'water', met: 7.0, distance: true, elevation: false, primary: ['lats', 'front_delts'], secondary: ['triceps', 'abs', 'upper_back', 'quads'], aliases: ['swim', 'swimming', 'lap_swimming', 'open_water'] },
  { id: 'kitesurfing', label: 'Kitesurfing', group: 'water', met: 7.0, distance: true, elevation: false, primary: ['abs', 'quads', 'forearms'], secondary: ['lower_back', 'obliques', 'glutes', 'upper_back'], aliases: ['kitesurf', 'kitesurfing', 'kiteboarding', 'kitesurfing_kiteboarding'] },
  { id: 'windsurfing', label: 'Windsurfing', group: 'water', met: 5.0, distance: true, elevation: false, primary: ['forearms', 'upper_back', 'abs'], secondary: ['lats', 'quads', 'lower_back'], aliases: ['windsurf', 'windsurfing'] },
  { id: 'wakeboarding', label: 'Wakeboarding', group: 'water', met: 6.0, distance: false, elevation: false, primary: ['quads', 'abs', 'forearms'], secondary: ['glutes', 'upper_back', 'lower_back'], aliases: ['wakeboarding', 'wakeboard', 'water_skiing', 'waterskiing', 'wakesurfing'] },
  { id: 'surfing', label: 'Surfing', group: 'water', met: 3.0, distance: false, elevation: false, primary: ['lats', 'front_delts'], secondary: ['abs', 'quads', 'triceps'], aliases: ['surf', 'surfing'] },
  { id: 'sup', label: 'Stand-up paddle', group: 'water', met: 6.0, distance: true, elevation: false, primary: ['abs', 'lats'], secondary: ['obliques', 'front_delts', 'quads'], aliases: ['stand_up_paddling', 'stand_up_paddleboarding', 'sup'] },
  { id: 'kayaking', label: 'Kayak / canoe', group: 'water', met: 5.0, distance: true, elevation: false, primary: ['lats', 'upper_back', 'obliques'], secondary: ['biceps', 'front_delts', 'abs'], aliases: ['kayaking', 'canoeing', 'paddling', 'whitewater'] },
  { id: 'rowing', label: 'Rowing (boat)', group: 'water', met: 7.0, distance: true, elevation: false, primary: ['upper_back', 'quads'], secondary: ['lats', 'hamstrings', 'biceps', 'glutes'], aliases: ['rowing'] },
  { id: 'sailing', label: 'Sailing', group: 'water', met: 3.0, distance: true, elevation: false, primary: ['forearms'], secondary: ['upper_back', 'abs'], aliases: ['sail', 'sailing'] },
  // Snow
  { id: 'downhill_skiing', label: 'Downhill skiing', group: 'snow', met: 5.3, distance: true, elevation: false, primary: ['quads', 'glutes'], secondary: ['hamstrings', 'abs', 'adductors', 'calves'], aliases: ['alpine_ski', 'alpine_skiing', 'downhill_skiing', 'resort_skiing'] },
  { id: 'ski_touring', label: 'Ski touring (uphill)', group: 'snow', met: 7.0, distance: true, elevation: true, primary: ['quads', 'glutes', 'calves'], secondary: ['hamstrings', 'triceps', 'abs'], aliases: ['backcountry_ski', 'backcountry_skiing', 'backcountry', 'ski_touring', 'skimo'] },
  { id: 'cross_country_skiing', label: 'Cross-country skiing', group: 'snow', met: 9.0, distance: true, elevation: true, primary: ['quads', 'lats', 'triceps'], secondary: ['glutes', 'abs', 'calves'], aliases: ['nordic_ski', 'cross_country_skiing', 'skate_skiing', 'classic_skiing'] },
  { id: 'snowboarding', label: 'Snowboarding', group: 'snow', met: 5.3, distance: true, elevation: false, primary: ['quads', 'glutes'], secondary: ['abs', 'calves', 'obliques'], aliases: ['snowboard', 'snowboarding'] },
  // Climbing
  { id: 'sport_climbing', label: 'Sport climbing', group: 'climbing', met: 7.5, distance: false, elevation: false, primary: ['forearms', 'lats', 'biceps'], secondary: ['upper_back', 'abs', 'calves', 'quads'], aliases: ['rock_climbing', 'rock_climb', 'climbing', 'sport_climbing', 'indoor_climbing', 'lead_climbing'] },
  { id: 'bouldering', label: 'Bouldering', group: 'climbing', met: 6.0, distance: false, elevation: false, primary: ['forearms', 'lats', 'biceps'], secondary: ['abs', 'upper_back', 'quads'], aliases: ['bouldering'] },
  { id: 'via_ferrata', label: 'Via ferrata / mountaineering', group: 'climbing', met: 6.5, distance: true, elevation: true, primary: ['quads', 'forearms'], secondary: ['glutes', 'lats', 'calves'], aliases: ['via_ferrata'] },
  // Fitness & mind-body
  { id: 'yoga', label: 'Yoga', group: 'fitness', met: 2.5, distance: false, elevation: false, primary: ['abs'], secondary: ['hamstrings', 'lower_back', 'front_delts'], aliases: ['yoga'] },
  { id: 'pilates', label: 'Pilates', group: 'fitness', met: 3.0, distance: false, elevation: false, primary: ['abs', 'obliques'], secondary: ['glutes', 'lower_back'], aliases: ['pilates'] },
  { id: 'hiit_class', label: 'HIIT / fitness class', group: 'fitness', met: 8.0, distance: false, elevation: false, primary: ['quads', 'abs'], secondary: ['glutes', 'front_delts', 'chest'], aliases: ['high_intensity_interval_training', 'hiit', 'crossfit', 'cardio', 'fitness_equipment'] },
  { id: 'dance', label: 'Dance', group: 'fitness', met: 5.0, distance: false, elevation: false, primary: ['calves', 'quads'], secondary: ['glutes', 'abs'], aliases: ['dance', 'dancing'] },
  { id: 'martial_arts', label: 'Martial arts / boxing', group: 'fitness', met: 7.0, distance: false, elevation: false, primary: ['front_delts', 'abs'], secondary: ['triceps', 'obliques', 'quads', 'calves'], aliases: ['boxing', 'martial_arts', 'kickboxing', 'mma'] },
  { id: 'inline_skating', label: 'Inline skating', group: 'fitness', met: 7.5, distance: true, elevation: false, primary: ['quads', 'glutes'], secondary: ['abductors', 'adductors', 'calves'], aliases: ['inline_skate', 'inline_skating', 'skate', 'skateboard', 'ice_skate'] },
  // Team & racket
  { id: 'tennis', label: 'Tennis', group: 'team', met: 7.3, distance: false, elevation: false, primary: ['front_delts', 'forearms', 'quads'], secondary: ['obliques', 'calves'], aliases: ['tennis', 'badminton', 'squash', 'table_tennis', 'pickleball', 'racquetball'] },
  { id: 'padel', label: 'Padel', group: 'team', met: 6.0, distance: false, elevation: false, primary: ['front_delts', 'forearms', 'quads'], secondary: ['obliques', 'calves'], aliases: ['padel'] },
  { id: 'football', label: 'Football (soccer)', group: 'team', met: 7.0, distance: true, elevation: false, primary: ['quads', 'hamstrings', 'calves'], secondary: ['glutes', 'adductors'], aliases: ['soccer', 'football'] },
  { id: 'volleyball', label: 'Volleyball / beach volley', group: 'team', met: 6.0, distance: false, elevation: false, primary: ['quads', 'front_delts'], secondary: ['calves', 'abs'], aliases: ['volleyball', 'beach_volleyball'] },
  { id: 'basketball', label: 'Basketball', group: 'team', met: 6.5, distance: false, elevation: false, primary: ['quads', 'calves'], secondary: ['front_delts', 'glutes'], aliases: ['basketball'] },
  { id: 'golf', label: 'Golf', group: 'other', met: 4.8, distance: true, elevation: false, primary: ['obliques'], secondary: ['forearms', 'lower_back'], aliases: ['golf'] },
  { id: 'horse_riding', label: 'Horse riding', group: 'other', met: 5.5, distance: true, elevation: false, primary: ['adductors', 'abs'], secondary: ['lower_back', 'quads'], aliases: ['horseback_riding', 'horse_riding', 'equestrian'] },
  { id: 'other', label: 'Other activity', group: 'other', met: 5.0, distance: true, elevation: true, primary: [], secondary: [], aliases: ['other', 'workout', 'generic', 'elliptical', 'stair_stepper', 'wheelchair', 'handcycle', 'velomobile'] },
];

/** Activity types that mean a gym session. */
const GYM_ALIASES = ['weight_training', 'weighttraining', 'strength_training', 'training', 'gym'];

export const SPORT_BY_ID = new Map(SPORTS.map((s) => [s.id, s]));
const BY_ALIAS = new Map<string, Sport>();
for (const s of SPORTS) for (const a of [s.id, ...s.aliases]) BY_ALIAS.set(a, s);

function norm(t: string): string {
  return t
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

/** The sport for an activity type (our id, a Garmin sport or a Strava sport type). */
export function resolveSport(activityType: string | undefined): Sport | undefined {
  if (!activityType) return undefined;
  const t = norm(activityType);
  if (GYM_ALIASES.includes(t)) return undefined;
  return BY_ALIAS.get(t) ?? BY_ALIAS.get(t.replace(/_\d+$/, ''));
}

export function isGymType(activityType: string | undefined): boolean {
  return !!activityType && GYM_ALIASES.includes(norm(activityType));
}

// Speed-based METs (km/h → MET), Compendium of Physical Activities.
const SPEED_TABLES: Record<SpeedTable, [number, number][]> = {
  walk: [[3.2, 2.8], [4.0, 3.0], [4.8, 3.5], [5.6, 4.3], [6.4, 5.0], [7.2, 7.0], [8.0, 8.3]],
  run: [[6.4, 6.0], [8.0, 8.3], [9.7, 9.8], [10.8, 11.0], [11.3, 11.5], [12.1, 11.8], [12.9, 12.3], [13.8, 12.8], [14.5, 14.5], [16.1, 16.0], [17.7, 19.0], [19.3, 19.8]],
  bike: [[12, 4.0], [16, 6.8], [19.3, 8.0], [22.5, 10.0], [25.7, 12.0], [30.6, 15.8]],
};

/** Step lookup: the MET of the highest speed band reached. */
export function metForSpeed(table: SpeedTable, kmh: number): number {
  const rows = SPEED_TABLES[table];
  let met = rows[0][1];
  for (const [speed, m] of rows) if (kmh >= speed) met = m;
  return met;
}

export const EFFORT_FACTOR = { light: 0.75, moderate: 1, vigorous: 1.3 } as const;

/**
 * MET for a logged activity. With distance and time, walking/running/cycling use the speed
 * tables. A steep climb (elevation gain per hour) raises the MET for foot and snow sports.
 */
export function sportMET(
  sport: Sport,
  opts: { intensity: keyof typeof EFFORT_FACTOR; hours: number; distanceM?: number; elevationGainM?: number },
): number {
  let met = sport.met * EFFORT_FACTOR[opts.intensity];
  if (sport.speedTable && opts.distanceM && opts.hours > 0) {
    met = metForSpeed(sport.speedTable, opts.distanceM / 1000 / opts.hours);
  }
  if (opts.elevationGainM && opts.hours > 0 && (sport.group === 'foot' || sport.group === 'snow')) {
    const climbPerHour = opts.elevationGainM / opts.hours;
    met += Math.min(4, climbPerHour / 200); // +1 MET per 200 m/h of climbing, capped
  }
  return Math.round(met * 10) / 10;
}
