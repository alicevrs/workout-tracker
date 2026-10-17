import { useLiveQuery } from 'dexie-react-hooks';
import seedExercises from '../data/exercises.json';
import { db } from './db';
import type { Exercise, Profile, Settings, Tracking } from './types';

/** Bump when the bundled exercise catalog changes so existing installs get the update. */
export const SEED_VERSION = 4;

export const DEFAULT_PROFILE: Profile = {
  sex: 'unspecified',
  unit: 'kg',
  defaultRestSec: 90,
  defaultPrepSec: 10,
};

export const DEFAULT_SETTINGS: Settings = {
  soundVolume: 0.8,
  backgroundAudio: true,
  mixWithMusic: true,
  halfwayCue: true,
  voice: 'female',
  soundLevels: { countdown: 1, start: 1, signal: 1, voice: 1 },
  stravaEnabled: false,
};

export const SEED_EXERCISES = seedExercises as Exercise[];

/** Insert or refresh the built-in catalog. Custom exercises and built-ins the user changed or deleted are never touched. */
export async function ensureSeeded(database = db): Promise<void> {
  const row = await database.kv.get('seedVersion');
  if ((row?.value as number | undefined) === SEED_VERSION) return;
  await database.transaction('rw', database.exercises, database.kv, async () => {
    const own = new Set((await database.exercises.filter((e) => !!e.edited).primaryKeys()) as string[]);
    await database.exercises.bulkPut(SEED_EXERCISES.filter((e) => !own.has(e.id)));
    await database.kv.put({ key: 'seedVersion', value: SEED_VERSION });
  });
}

export async function getProfile(database = db): Promise<Profile> {
  const row = await database.kv.get('profile');
  return { ...DEFAULT_PROFILE, ...((row?.value as Partial<Profile>) ?? {}) };
}

export async function saveProfile(patch: Partial<Profile>, database = db): Promise<void> {
  const current = await getProfile(database);
  await database.kv.put({ key: 'profile', value: { ...current, ...patch } });
}

export async function getSettings(database = db): Promise<Settings> {
  const row = await database.kv.get('settings');
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export async function saveSettings(patch: Partial<Settings>, database = db): Promise<void> {
  const current = await getSettings(database);
  await database.kv.put({ key: 'settings', value: { ...current, ...patch } });
}

export function useProfile(): Profile {
  const row = useLiveQuery(() => db.kv.get('profile'), []);
  return { ...DEFAULT_PROFILE, ...((row?.value as Partial<Profile>) ?? {}) };
}

export function useSettings(): Settings {
  const row = useLiveQuery(() => db.kv.get('settings'), []);
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}

export function useExercises(): Exercise[] | undefined {
  return useLiveQuery(() => db.exercises.orderBy('name').toArray(), []);
}

/** How an exercise is logged, with the older values mapped to the current ones. */
export function trackingOf(e: Pick<Exercise, 'tracking'> | undefined): Tracking {
  const t = e?.tracking;
  return t === 'time' || t === 'weight_time' ? 'weight_time' : t === 'time_distance' ? 'time_distance' : 'weight_reps';
}

/** Rewrite the user's own exercises that still use the older tracking values. Returns how many changed. */
export async function migrateTracking(database = db): Promise<number> {
  const old = await database.exercises.filter((e) => e.tracking === 'reps' || e.tracking === 'time').toArray();
  if (old.length) await database.exercises.bulkPut(old.map((e) => ({ ...e, tracking: trackingOf(e) })));
  return old.length;
}

/** Exercises to choose from (built-ins the user deleted are left out). */
export function useVisibleExercises(): Exercise[] | undefined {
  return useLiveQuery(() => db.exercises.orderBy('name').filter((e) => !e.hidden).toArray(), []);
}

/** The user's own data in the exercises table: custom exercises and changed or deleted built-ins. */
export const isOwnExercise = (e: Exercise) => e.isCustom || !!e.edited;

export function useExerciseMap(): Map<string, Exercise> {
  const list = useExercises();
  return new Map((list ?? []).map((e) => [e.id, e]));
}

/** Ask the browser not to evict our storage. Safe to call repeatedly. */
export async function requestPersistentStorage(): Promise<boolean | undefined> {
  if (!navigator.storage?.persist) return undefined;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
