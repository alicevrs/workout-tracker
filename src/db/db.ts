import Dexie, { type Table } from 'dexie';
import type { BlockTemplate, BodyWeight, DietPlan, Exercise, Food, FoodEntry, KV, Program, Session, TimerTemplate, Visit } from './types';

export class WorkoutDB extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  blockTemplates!: Table<BlockTemplate, string>;
  timerTemplates!: Table<TimerTemplate, string>;
  sessions!: Table<Session, string>;
  bodyWeights!: Table<BodyWeight, string>;
  kv!: Table<KV, string>;
  foods!: Table<Food, string>;
  dietPlans!: Table<DietPlan, string>;
  visits!: Table<Visit, string>;
  foodEntries!: Table<FoodEntry, string>;

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
    // v4: nutrition (own foods, diet plans, visits, food diary).
    this.version(4).stores({ foods: 'id, name, barcode', dietPlans: 'id, startDate, updatedAt', visits: 'id, date', foodEntries: 'id, date' });
  }
}

export const db = new WorkoutDB();
