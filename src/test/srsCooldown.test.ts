import { describe, it, expect } from 'vitest';
import {
  isInCooldown,
  COOLDOWN_FLOOR_HOURS,
  DEFAULT_COOLDOWN_HOURS,
} from '@/lib/srsCooldown';
import type { HistoryEntry } from '@/lib/types';

const NOW = 1_700_000_000_000; // fixed epoch ms
const HOUR = 60 * 60 * 1000;

function entry(timestamp: number): HistoryEntry {
  return {
    answered: 1,
    correct: 0,
    lastResult: 'wrong',
    everWrong: true,
    timestamp,
  };
}

describe('srsCooldown', () => {
  it('exports floor of 6 hours', () => {
    expect(COOLDOWN_FLOOR_HOURS).toBe(6);
  });

  it('exports default cool-down of 24 hours', () => {
    expect(DEFAULT_COOLDOWN_HOURS).toBe(24);
  });

  it('returns false when question has no history entry', () => {
    expect(isInCooldown('q1', {}, NOW)).toBe(false);
  });

  it('returns false when history entry has no timestamp (legacy)', () => {
    const history = { q1: { ...entry(0), timestamp: 0 } };
    expect(isInCooldown('q1', history, NOW)).toBe(false);
  });

  it('returns true when answered 1 hour ago (< 24h default)', () => {
    const history = { q1: entry(NOW - 1 * HOUR) };
    expect(isInCooldown('q1', history, NOW)).toBe(true);
  });

  it('returns true at exactly 24h boundary (still in cool-down)', () => {
    const history = { q1: entry(NOW - 24 * HOUR) };
    expect(isInCooldown('q1', history, NOW)).toBe(true);
  });

  it('returns false at 25h (out of cool-down)', () => {
    const history = { q1: entry(NOW - 25 * HOUR) };
    expect(isInCooldown('q1', history, NOW)).toBe(false);
  });

  it('honours floor: returns true when caller passes 1h cool-down but answered 5h ago', () => {
    const history = { q1: entry(NOW - 5 * HOUR) };
    expect(isInCooldown('q1', history, NOW, 1)).toBe(true);
  });

  it('honours floor: returns false at 7h with 1h cool-down (above 6h floor)', () => {
    const history = { q1: entry(NOW - 7 * HOUR) };
    expect(isInCooldown('q1', history, NOW, 1)).toBe(false);
  });
});
