import type { PerformedBlock, Session, SetRecord } from '../src/db/types';
import { defaultTimer } from '../src/lib/program';

let n = 0;

export function set(exerciseId: string, weight: number | undefined, reps: number | undefined, extra: Partial<SetRecord> = {}): SetRecord {
  return { exerciseId, setNumber: 1, weight, reps, completed: true, ...extra };
}

export function block(sets: SetRecord[], patch: Partial<PerformedBlock> = {}): PerformedBlock {
  const byEx = new Map<string, SetRecord[]>();
  for (const s of sets) byEx.set(s.exerciseId, [...(byEx.get(s.exerciseId) ?? []), s]);
  return {
    id: `b${++n}`,
    format: 'sets_reps',
    params: {},
    timer: defaultTimer(0),
    entries: [...byEx.entries()].map(([exerciseId, list], i) => ({ id: `e${n}-${i}`, exerciseId, sets: list.map((s, k) => ({ ...s, setNumber: k + 1 })) })),
    ...patch,
  };
}

export function session(day: string, blocks: PerformedBlock[], patch: Partial<Session> = {}): Session {
  const startedAt = new Date(`${day}T10:00:00`).getTime();
  return {
    id: `s-${day}-${++n}`,
    date: day,
    title: 'Test',
    status: 'completed',
    startedAt,
    endedAt: startedAt + 3600_000,
    blocks,
    intensity: 'moderate',
    source: 'manual',
    updatedAt: startedAt,
    ...patch,
  };
}
