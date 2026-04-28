import type { HistoryEntry } from '@/lib/types';

export const COOLDOWN_FLOOR_HOURS = 6;
export const DEFAULT_COOLDOWN_HOURS = 24;

const HOUR_MS = 60 * 60 * 1000;

/**
 * Returns true if the question was answered within the effective cool-down
 * window. Effective window = max(cooldownHours, COOLDOWN_FLOOR_HOURS).
 *
 * A question with no history entry, or with a falsy `timestamp` (legacy rows
 * predating the timestamp field), is treated as NOT in cool-down.
 */
export function isInCooldown(
  questionId: string,
  history: Record<string, HistoryEntry>,
  nowMs: number,
  cooldownHours: number = DEFAULT_COOLDOWN_HOURS,
): boolean {
  const entry = history[questionId];
  if (!entry || !entry.timestamp) return false;

  const effectiveHours = Math.max(cooldownHours, COOLDOWN_FLOOR_HOURS);
  const cutoffMs = nowMs - effectiveHours * HOUR_MS;
  return entry.timestamp >= cutoffMs;
}
