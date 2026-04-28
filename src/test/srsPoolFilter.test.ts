import { describe, it, expect } from 'vitest';
import { filterCandidatePool } from '@/lib/srsPoolFilter';
import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';

const NOW = new Date('2026-04-27T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;

// Question has 17 required fields — match the existing pattern in
// src/test/smartSelection.test.ts::makeQuestion. No `as Question` cast.
function q(id: string, topic = 'Cardiac Physiology'): Question {
  return {
    [KEYS.ID]: id,
    [KEYS.REF_ID]: id,
    [KEYS.QUESTION]: '?',
    [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
    [KEYS.CORRECT]: 'A',
    [KEYS.EXPLANATION]: '',
    [KEYS.TOPIC]: topic,
    [KEYS.YEAR]: '2024',
    [KEYS.SOURCE]: '',
    [KEYS.MILLER]: '',
    [KEYS.CHAPTER]: 1,
    [KEYS.MEDIA_TYPE]: '',
    [KEYS.MEDIA_LINK]: '',
    [KEYS.KIND]: '',
  };
}

function recent(id: string, hoursAgo: number): Record<string, HistoryEntry> {
  return {
    [id]: {
      answered: 1,
      correct: 0,
      lastResult: 'wrong',
      everWrong: true,
      timestamp: NOW - hoursAgo * HOUR,
    },
  };
}

// SrsRecord has 6 fields only. confidence: ConfidenceLevel | null.
function srs(id: string, nextReview: string): Record<string, SrsRecord> {
  return {
    [id]: {
      next_review_date: nextReview,
      interval_days: 10,
      ease_factor: 2.5,
      repetitions: 3,
      confidence: null,
      last_correct: true,
    },
  };
}

describe('srsPoolFilter', () => {
  it('returns empty array when pool is empty', () => {
    expect(filterCandidatePool([], {}, {}, NOW)).toEqual([]);
  });

  it('keeps all questions when no history and no SRS data', () => {
    const pool = [q('a'), q('b'), q('c')];
    expect(filterCandidatePool(pool, {}, {}, NOW)).toHaveLength(3);
  });

  it('removes question answered 1 hour ago (cool-down)', () => {
    const pool = [q('a'), q('b')];
    const result = filterCandidatePool(pool, recent('a', 1), {}, NOW);
    expect(result.map(x => x.id)).toEqual(['b']);
  });

  it('keeps question answered 25 hours ago (out of cool-down)', () => {
    const pool = [q('a'), q('b')];
    const result = filterCandidatePool(pool, recent('a', 25), {}, NOW);
    expect(result).toHaveLength(2);
  });

  it('removes question with next_review_date 8 days out', () => {
    const pool = [q('a'), q('b')];
    const result = filterCandidatePool(pool, {}, srs('a', '2026-05-05'), NOW);
    expect(result.map(x => x.id)).toEqual(['b']);
  });

  it('keeps question with next_review_date 5 days out', () => {
    const pool = [q('a'), q('b')];
    const result = filterCandidatePool(pool, {}, srs('a', '2026-05-02'), NOW);
    expect(result).toHaveLength(2);
  });

  it('removes question failing BOTH filters', () => {
    const pool = [q('a'), q('b')];
    const result = filterCandidatePool(
      pool,
      recent('a', 1),
      srs('a', '2026-08-10'),
      NOW,
    );
    expect(result.map(x => x.id)).toEqual(['b']);
  });

  it('removes Q6C275F production scenario (recent + far-future schedule)', () => {
    const pool = [q('Q6C275F'), q('other')];
    const history = recent('Q6C275F', 2);
    const srsData = srs('Q6C275F', '2026-08-10'); // 105 days out
    const result = filterCandidatePool(pool, history, srsData, NOW);
    expect(result.map(x => x.id)).toEqual(['other']);
  });

  it('preserves original pool order for kept items', () => {
    const pool = [q('a'), q('b'), q('c'), q('d')];
    const result = filterCandidatePool(pool, recent('b', 1), {}, NOW);
    expect(result.map(x => x.id)).toEqual(['a', 'c', 'd']);
  });
});
