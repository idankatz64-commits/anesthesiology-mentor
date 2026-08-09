import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getIsraelToday,
  addDaysIsrael,
  daysBetween,
  getIsraelStartOfDay,
  getIsraelDateStr,
} from '@/lib/dateHelpers';

describe('dateHelpers', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('getIsraelToday returns YYYY-MM-DD in Asia/Jerusalem', () => {
    vi.setSystemTime(new Date('2026-04-15T23:30:00Z'));
    expect(getIsraelToday()).toBe('2026-04-16');
  });

  it('getIsraelToday handles pre-midnight UTC correctly', () => {
    vi.setSystemTime(new Date('2026-04-15T10:00:00Z'));
    expect(getIsraelToday()).toBe('2026-04-15');
  });

  // The bug this replaced hardcoded +03:00 all year. In winter that starts the
  // day an hour early and counts the tail of yesterday as today.
  it('getIsraelStartOfDay uses +03:00 in summer and +02:00 in winter', () => {
    expect(getIsraelStartOfDay('2026-07-01')).toBe('2026-07-01T00:00:00+03:00');
    expect(getIsraelStartOfDay('2026-01-15')).toBe('2026-01-15T00:00:00+02:00');
  });

  it('getIsraelStartOfDay is right on both sides of a DST changeover', () => {
    expect(getIsraelStartOfDay('2026-03-26')).toBe('2026-03-26T00:00:00+02:00');
    expect(getIsraelStartOfDay('2026-03-28')).toBe('2026-03-28T00:00:00+03:00');
  });

  it('getIsraelDateStr reads the Israel date, not the machine timezone', () => {
    expect(getIsraelDateStr(new Date('2026-04-15T23:30:00Z'))).toBe('2026-04-16');
    expect(getIsraelDateStr(new Date('2026-04-15T10:00:00Z'))).toBe('2026-04-15');
  });

  it('addDaysIsrael adds days and preserves YYYY-MM-DD', () => {
    expect(addDaysIsrael('2026-04-15', 30)).toBe('2026-05-15');
    expect(addDaysIsrael('2026-04-15', 0)).toBe('2026-04-15');
    expect(addDaysIsrael('2026-04-15', -1)).toBe('2026-04-14');
  });

  it('addDaysIsrael handles month boundaries', () => {
    expect(addDaysIsrael('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDaysIsrael('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('daysBetween returns signed diff in days', () => {
    expect(daysBetween('2026-04-15', '2026-04-20')).toBe(5);
    expect(daysBetween('2026-04-20', '2026-04-15')).toBe(-5);
    expect(daysBetween('2026-04-15', '2026-04-15')).toBe(0);
  });

  it('addDaysIsrael crosses Israel DST start (March 2026) without drift', () => {
    // Israel DST 2026 starts Friday 2026-03-27. Adding days across should still land on the calendar date.
    expect(addDaysIsrael('2026-03-26', 2)).toBe('2026-03-28');
    expect(addDaysIsrael('2026-03-27', 1)).toBe('2026-03-28');
  });

  it('addDaysIsrael handles year boundary and leap year', () => {
    expect(addDaysIsrael('2025-12-31', 1)).toBe('2026-01-01');
    expect(addDaysIsrael('2024-02-28', 1)).toBe('2024-02-29');  // leap
    expect(addDaysIsrael('2024-02-29', 1)).toBe('2024-03-01');
  });

  it('daysBetween crosses Israel DST without losing or adding a day', () => {
    expect(daysBetween('2026-03-26', '2026-03-29')).toBe(3);
    expect(daysBetween('2025-10-25', '2025-10-27')).toBe(2);  // DST end fall 2025
  });
});
