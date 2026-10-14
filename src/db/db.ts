import Dexie, { type Table } from 'dexie';
import type { BlockTemplate, BodyWeight, Exercise, KV, Program, Session, TimerTemplate } from './types';

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  blockTemplates!: Table<BlockTemplate, string>;
  timerTemplates!: Table<TimerTemplate, string>;
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
    // v2: exercise templates (ready-made blocks).
    this.version(2).stores({ blockTemplates: 'id, name, updatedAt' });
    // v3: saved timers (Workouts → Timers).
    this.version(3).stores({ timerTemplates: 'id, name, updatedAt' });
  }
}

export const db = new WorkoutDB();
