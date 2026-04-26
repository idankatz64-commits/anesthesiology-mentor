import { describe, it, expect } from 'vitest';
import { srsUrgencyFromDaysOverdue } from '@/lib/smartSelection';

// Q3 fix: future-scheduled questions used to all collapse to urgency=0.
// New contract: future returns negative (suppression), past returns 0..1.
// Order must hold: far-future < near-future < new(0.5) < overdue
describe('srsUrgencyFromDaysOverdue', () => {
  it('returns 0 exactly at the review date (daysOverdue = 0)', () => {
    expect(srsUrgencyFromDaysOverdue(0)).toBe(0);
  });

  it('returns positive linear urgency for overdue (30 days = 0.5, 60 days = 1.0)', () => {
    expect(srsUrgencyFromDaysOverdue(30)).toBeCloseTo(0.5, 5);
    expect(srsUrgencyFromDaysOverdue(60)).toBe(1);
  });

  it('clamps overdue urgency to 1.0 even for very late questions', () => {
    expect(srsUrgencyFromDaysOverdue(120)).toBe(1);
    expect(srsUrgencyFromDaysOverdue(10_000)).toBe(1);
  });

  it('returns small negative urgency for near-future (10 days ahead ≈ -0.0274)', () => {
    expect(srsUrgencyFromDaysOverdue(-10)).toBeCloseTo(-10 / 365, 6);
  });

  it('returns -1 for one-year-future scheduling (daysOverdue = -365)', () => {
    expect(srsUrgencyFromDaysOverdue(-365)).toBe(-1);
  });

  it('clamps far-future to -1 (no question gets less than -1)', () => {
    expect(srsUrgencyFromDaysOverdue(-730)).toBe(-1);
    expect(srsUrgencyFromDaysOverdue(-10_000)).toBe(-1);
  });

  it('preserves the full ordering: far-future < near-future < 0 < small-overdue < new(0.5) < big-overdue', () => {
    const farFuture = srsUrgencyFromDaysOverdue(-365);
    const nearFuture = srsUrgencyFromDaysOverdue(-7);
    const dueToday = srsUrgencyFromDaysOverdue(0);
    const smallOverdue = srsUrgencyFromDaysOverdue(15);  // 0.25
    const newQuestion = 0.5; // contract: questions with no SRS row map to 0.5 in computeSrsUrgency
    const bigOverdue = srsUrgencyFromDaysOverdue(45);    // 0.75

    expect(farFuture).toBeLessThan(nearFuture);
    expect(nearFuture).toBeLessThan(dueToday);
    expect(dueToday).toBeLessThan(smallOverdue);
    expect(smallOverdue).toBeLessThan(newQuestion);
    expect(newQuestion).toBeLessThan(bigOverdue);
  });
});
