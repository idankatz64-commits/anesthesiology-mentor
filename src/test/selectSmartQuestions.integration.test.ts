import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectSmartQuestions } from '@/lib/smartSelection';
import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';

// Frozen NOW for deterministic Date.now() and date math.
const NOW = new Date('2026-04-27T12:00:00Z').getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// Question has 17 required fields — match src/test/smartSelection.test.ts pattern.
// No `as Question` cast: that bypasses field checking and hides schema-drift bugs.
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

function hist(id: string, hoursAgo: number): [string, HistoryEntry] {
  return [
    id,
    {
      answered: 1,
      correct: 0,
      lastResult: 'wrong',
      everWrong: true,
      timestamp: NOW - hoursAgo * HOUR,
    },
  ];
}

// SrsRecord has 6 fields only — NO user_id / question_id.
function srs(id: string, daysOut: number): [string, SrsRecord] {
  const date = new Date(NOW + daysOut * DAY).toISOString().slice(0, 10);
  return [
    id,
    {
      next_review_date: date,
      interval_days: 10,
      ease_factor: 2.5,
      repetitions: 3,
      confidence: null,
      last_correct: true,
    },
  ];
}

describe('selectSmartQuestions integration (PR #3 v2 fixes)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Q6C275F scenario: never re-selects a question answered 2h ago and scheduled 105 days out', () => {
    const pool = [
      q('Q6C275F'),
      ...Array.from({ length: 50 }, (_, i) => q(`other-${i}`)),
    ];
    const history = Object.fromEntries([hist('Q6C275F', 2)]);
    const srsData = Object.fromEntries([srs('Q6C275F', 105)]);

    const result = selectSmartQuestions(pool, 40, 'regular', srsData, history, pool);

    expect(result.find(x => x.id === 'Q6C275F')).toBeUndefined();
    expect(result).toHaveLength(40);
  });

  it('honours 24h cool-down: question answered 23h ago is excluded', () => {
    const pool = [q('hot'), ...Array.from({ length: 50 }, (_, i) => q(`other-${i}`))];
    const history = Object.fromEntries([hist('hot', 23)]);
    const result = selectSmartQuestions(pool, 40, 'regular', {}, history, pool);
    expect(result.find(x => x.id === 'hot')).toBeUndefined();
  });

  it('cool-down boundary: question answered 25h ago IS eligible', () => {
    // Tiny pool so the question is forced in.
    const pool = [q('cooled'), q('other-1'), q('other-2')];
    const history = Object.fromEntries([hist('cooled', 25)]);
    const result = selectSmartQuestions(pool, 3, 'regular', {}, history, pool);
    expect(result.find(x => x.id === 'cooled')).toBeDefined();
  });

  it('schedule filter: question due in 5 days IS eligible (within window)', () => {
    const pool = [q('soon'), q('other-1'), q('other-2')];
    const srsData = Object.fromEntries([srs('soon', 5)]);
    const result = selectSmartQuestions(pool, 3, 'regular', srsData, {}, pool);
    expect(result.find(x => x.id === 'soon')).toBeDefined();
  });

  it('schedule filter: question due in 8 days is excluded', () => {
    const pool = [q('far'), ...Array.from({ length: 50 }, (_, i) => q(`other-${i}`))];
    const srsData = Object.fromEntries([srs('far', 8)]);
    const result = selectSmartQuestions(pool, 40, 'regular', srsData, {}, pool);
    expect(result.find(x => x.id === 'far')).toBeUndefined();
  });

  it('overdue questions (negative daysOut) are still eligible', () => {
    // Tiny pool so any question passing the pre-filter is forced into result.
    // Crowded pools also depend on score ranking, which would conflate
    // "filter accepts overdue" with "overdue scores in top-N".
    const pool = [q('overdue'), q('other-1'), q('other-2')];
    const srsData = Object.fromEntries([srs('overdue', -3)]);
    const result = selectSmartQuestions(pool, 3, 'regular', srsData, {}, pool);
    expect(result.find(x => x.id === 'overdue')).toBeDefined();
  });

  it('30% new-question quota: result contains at least 30% never-answered questions when both pools have enough', () => {
    // 50 seen + 50 new in same topic. Slots reserve 30% for new.
    const seen = Array.from({ length: 50 }, (_, i) => q(`seen-${i}`));
    const fresh = Array.from({ length: 50 }, (_, i) => q(`new-${i}`));
    const pool = [...seen, ...fresh];
    const history = Object.fromEntries(seen.map(x => hist(x.id, 30 * 24))); // 30 days ago — out of cool-down

    const result = selectSmartQuestions(pool, 40, 'regular', {}, history, pool);

    const newCount = result.filter(r => r.id.startsWith('new-')).length;
    // ceil(40 * 0.30) = 12 — single topic gets all 40 slots and applies the quota.
    expect(newCount).toBeGreaterThanOrEqual(12);
  });

  it('Hamilton 25% topic cap is preserved (no single topic gets more than 10/40 slots)', () => {
    const topics = ['Topic A', 'Topic B', 'Topic C', 'Topic D'];
    const pool: Question[] = [];
    for (const topic of topics) {
      for (let i = 0; i < 20; i++) {
        pool.push(q(`${topic}-${i}`, topic));
      }
    }

    const result = selectSmartQuestions(pool, 40, 'regular', {}, {}, pool);

    const byTopic: Record<string, number> = {};
    for (const r of result) {
      const topic = r[KEYS.TOPIC] || '__other__';
      byTopic[topic] = (byTopic[topic] ?? 0) + 1;
    }
    for (const [topic, n] of Object.entries(byTopic)) {
      // 25% of 40 = 10
      expect(n, `topic ${topic} exceeded 25% cap`).toBeLessThanOrEqual(10);
    }
  });

  it('defensive fallback: returns full session when pre-filter empties the pool', () => {
    // All 5 questions are recently answered AND scheduled far out.
    const pool = Array.from({ length: 5 }, (_, i) => q(`burned-${i}`));
    const history = Object.fromEntries(pool.map(p => hist(p.id, 1)));
    const srsData = Object.fromEntries(pool.map(p => srs(p.id, 30)));

    const result = selectSmartQuestions(pool, 5, 'regular', srsData, history, pool);

    // Filter empties → fallback to unfiltered → return all 5.
    expect(result).toHaveLength(5);
  });

  it('returns empty array for empty pool', () => {
    expect(selectSmartQuestions([], 40, 'regular', {}, {}, [])).toEqual([]);
  });

  it('simulation mode also benefits from pre-filter', () => {
    const pool = [
      q('hot', 'Cardiac Physiology'),
      ...Array.from({ length: 200 }, (_, i) => q(`other-${i}`, 'Cardiac Physiology')),
    ];
    const history = Object.fromEntries([hist('hot', 1)]);

    const result = selectSmartQuestions(pool, 120, 'simulation', {}, history, pool);

    expect(result.find(x => x.id === 'hot')).toBeUndefined();
  });
});
