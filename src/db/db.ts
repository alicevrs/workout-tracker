import Dexie, { type Table } from 'dexie';
import type { BodyWeight, Exercise, KV, Program, Session } from './types';

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  sessions!: Table<Session, string>;
  bodyWeights!: Table<BodyWeight, string>;
  kv!: Table<KV, string>;

  constructor(name = 'workout-tracker') {
    super(name);
    this.version(1).stores({
      exercises: 'id, name, category, isCustom',
      programs: 'id, name, updatedAt',
      sessions: 'id, startedAt, date, status, programDayId, *externalIds',
      bodyWeights: 'id, date',
      kv: 'key',
    });
  }
}

export const db = new WorkoutDB();
