import type { WeightUnit } from '../db/types';

export const KG_PER_LB = 0.45359237;

export function toDisplayWeight(kg: number | undefined, unit: WeightUnit): number | undefined {
  if (kg === undefined || kg === null || Number.isNaN(kg)) return undefined;
  const v = unit === 'kg' ? kg : kg / KG_PER_LB;
  return Math.round(v * 10) / 10;
}

export function fromDisplayWeight(value: number | undefined, unit: WeightUnit): number | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  return unit === 'kg' ? value : value * KG_PER_LB;
}

export function formatWeight(kg: number | undefined, unit: WeightUnit): string {
  const v = toDisplayWeight(kg, unit);
  return v === undefined ? '–' : `${v} ${unit}`;
}

/** Compact number for chart labels: 12500 -> "12.5k". */
export function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n * 10) / 10);
}
