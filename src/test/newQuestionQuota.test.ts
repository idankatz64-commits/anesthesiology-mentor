import { describe, it, expect } from 'vitest';
import {
  pickWithNewQuota,
  NEW_QUESTION_QUOTA_RATIO,
  type ScoredCandidate,
} from '@/lib/newQuestionQuota';

function cand(id: string, isNew: boolean, score: number): ScoredCandidate<{ id: string }> {
  return { item: { id }, isNew, score };
}

describe('newQuestionQuota', () => {
  it('exports default quota ratio of 0.30', () => {
    expect(NEW_QUESTION_QUOTA_RATIO).toBe(0.30);
  });

  it('returns empty array when n is 0', () => {
    expect(pickWithNewQuota([cand('a', false, 1)], 0)).toEqual([]);
  });

  it('returns empty array when scored is empty', () => {
    expect(pickWithNewQuota([], 5)).toEqual([]);
  });

  it('picks all items when n >= scored.length', () => {
    const scored = [cand('a', false, 1), cand('b', true, 2)];
    const result = pickWithNewQuota(scored, 5);
    expect(result).toHaveLength(2);
  });

  it('reserves 30% of slots for new questions when both pools have enough', () => {
    // 10 slots → 3 reserved for new, 7 for seen
    const scored = [
      ...Array.from({ length: 8 }, (_, i) => cand(`seen${i}`, false, 100 - i)),
      ...Array.from({ length: 5 }, (_, i) => cand(`new${i}`, true, 50 - i)),
    ];
    const result = pickWithNewQuota(scored, 10);
    const newCount = result.filter(r => r.id.startsWith('new')).length;
    expect(newCount).toBe(3);
    expect(result).toHaveLength(10);
  });

  it('rounds 30% UP to nearest integer (4 slots → 2 new)', () => {
    // ceil(4 * 0.30) = ceil(1.2) = 2
    const scored = [
      cand('seen1', false, 10), cand('seen2', false, 9),
      cand('new1', true, 5), cand('new2', true, 4),
    ];
    const result = pickWithNewQuota(scored, 4);
    const newCount = result.filter(r => r.id.startsWith('new')).length;
    expect(newCount).toBe(2);
  });

  it('falls back to seen questions when new pool is empty', () => {
    const scored = [
      cand('seen1', false, 10), cand('seen2', false, 9), cand('seen3', false, 8),
    ];
    const result = pickWithNewQuota(scored, 3);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.id.startsWith('seen'))).toBe(true);
  });

  it('falls back to new questions when seen pool is empty', () => {
    const scored = [
      cand('new1', true, 10), cand('new2', true, 9), cand('new3', true, 8),
    ];
    const result = pickWithNewQuota(scored, 3);
    expect(result).toHaveLength(3);
    expect(result.every(r => r.id.startsWith('new'))).toBe(true);
  });

  it('takes top-scored items within each pool', () => {
    const scored = [
      cand('seen-low', false, 1), cand('seen-high', false, 100),
      cand('new-low', true, 1), cand('new-high', true, 100),
    ];
    const result = pickWithNewQuota(scored, 2); // 1 new + 1 seen
    expect(result.map(r => r.id).sort()).toEqual(['new-high', 'seen-high']);
  });

  it('honours custom quotaRatio of 0.50', () => {
    const scored = [
      cand('seen1', false, 10), cand('seen2', false, 9),
      cand('new1', true, 5), cand('new2', true, 4),
    ];
    const result = pickWithNewQuota(scored, 4, 0.50);
    const newCount = result.filter(r => r.id.startsWith('new')).length;
    expect(newCount).toBe(2);
  });

  it('handles quotaRatio of 0 (no new quota)', () => {
    const scored = [
      cand('seen1', false, 10),
      cand('new1', true, 100),
    ];
    const result = pickWithNewQuota(scored, 1, 0);
    expect(result[0].id).toBe('seen1');
  });
});
