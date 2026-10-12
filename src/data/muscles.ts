import type { MuscleId } from '../db/types';

export interface MuscleInfo {
  id: MuscleId;
  label: string;
  group: 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Core' | 'Legs' | 'Neck';
}

export const MUSCLES: MuscleInfo[] = [
  { id: 'chest', label: 'Chest', group: 'Chest' },
  { id: 'upper_back', label: 'Upper back', group: 'Back' },
  { id: 'lats', label: 'Lats', group: 'Back' },
  { id: 'lower_back', label: 'Lower back', group: 'Back' },
  { id: 'front_delts', label: 'Front delts', group: 'Shoulders' },
  { id: 'side_delts', label: 'Side delts', group: 'Shoulders' },
  { id: 'rear_delts', label: 'Rear delts', group: 'Shoulders' },
  { id: 'biceps', label: 'Biceps', group: 'Arms' },
  { id: 'triceps', label: 'Triceps', group: 'Arms' },
  { id: 'forearms', label: 'Forearms', group: 'Arms' },
  { id: 'abs', label: 'Abs / core', group: 'Core' },
  { id: 'obliques', label: 'Obliques', group: 'Core' },
  { id: 'glutes', label: 'Glutes', group: 'Legs' },
  { id: 'quads', label: 'Quads', group: 'Legs' },
  { id: 'hamstrings', label: 'Hamstrings', group: 'Legs' },
  { id: 'calves', label: 'Calves', group: 'Legs' },
  { id: 'adductors', label: 'Adductors', group: 'Legs' },
  { id: 'abductors', label: 'Abductors', group: 'Legs' },
  { id: 'neck', label: 'Neck', group: 'Neck' },
];

export const MUSCLE_IDS = MUSCLES.map((m) => m.id);
export const MUSCLE_LABEL: Record<MuscleId, string> = Object.fromEntries(
  MUSCLES.map((m) => [m.id, m.label]),
) as Record<MuscleId, string>;

/** Weight of a primary vs secondary muscle when distributing work. */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;
