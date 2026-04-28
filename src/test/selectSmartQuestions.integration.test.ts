import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { selectSmartQuestions } from '@/lib/smartSelection';
import type { Question, HistoryEntry } from '@/lib/types';
import { KEYS } from '@/lib/types';
import type { SrsRecord } from '@/lib/srsRepository';
import { NEW_QUESTION_QUOTA_RATIO } from '@/lib/newQuestionQuota';

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

    // Length-and-membership pair: length guards against vacuous truth
    // (a 0-length result would also satisfy `not.toContain`).
    expect(result).toHaveLength(40);
    expect(result.map(x => x.id)).not.toContain('Q6C275F');
    // No in-session duplicates — the literal failure mode of the bug.
    expect(new Set(result.map(r => r.id)).size).toBe(result.length);
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
    // 50 seen + 50 new in single topic ('Cardiac Physiology').
    // Hamilton 25% cap forces a two-stage selection inside selectSmartQuestions:
    //   - Stage 3 gives the topic ceil(40 * 0.25) = 10 slots → ≥3 new
    //   - Gap-fill takes the remaining 30 slots → ≥9 new
    //   - Total minimum new: 12
    // Without the quota, top-N-by-score with this fixture would land 0 new
    // (seen are wrong+old → high topicWeakness, so they outscore unscored new),
    // so any value ≥ 1 here proves the quota fired. Asserting the actual
    // minimum (12) tightens the contract.
    const seen = Array.from({ length: 50 }, (_, i) => q(`seen-${i}`));
    const fresh = Array.from({ length: 50 }, (_, i) => q(`new-${i}`));
    const pool = [...seen, ...fresh];
    const history = Object.fromEntries(seen.map(x => hist(x.id, 30 * 24))); // 30 days ago — out of cool-down

    const result = selectSmartQuestions(pool, 40, 'regular', {}, history, pool);

    const newCount = result.filter(r => r.id.startsWith('new-')).length;
    const expectedMin = Math.ceil(10 * NEW_QUESTION_QUOTA_RATIO) + Math.ceil(30 * NEW_QUESTION_QUOTA_RATIO);
    expect(newCount).toBeGreaterThanOrEqual(expectedMin);
    expect(result).toHaveLength(40);
  });

  it('Hamilton 25% cap × new-question quota interact: each topic still satisfies ≥30% new', () => {
    // The two existing topic-aware tests cover Hamilton and quota in isolation:
    //   - "Hamilton 25% topic cap is preserved" uses 4 topics, 0 history (all new)
    //   - "30% new-question quota" uses 1 topic, 50 seen + 50 new
    // Neither exercises both simultaneously. This test forces them to interact:
    // 4 topics × (10 seen-but-cooled-down + 10 never-seen). Hamilton allocates
    // ≤10 slots per topic (25% of 40). Within each topic's bucket, the quota
    // must still reserve ≥30% for new — so per topic: ≥3 new of ≤10 picked.
    // Failure mode this catches: a regression where the quota only fires at
    // the global level and leaves individual Hamilton buckets all-seen.
    const topics = ['Topic A', 'Topic B', 'Topic C', 'Topic D'];
    const pool: Question[] = [];
    for (const topic of topics) {
      for (let i = 0; i < 10; i++) {
        pool.push(q(`${topic}-seen-${i}`, topic));
      }
      for (let i = 0; i < 10; i++) {
        pool.push(q(`${topic}-new-${i}`, topic));
      }
    }
    // Seen questions answered 30 days ago — well outside 24h cool-down.
    const history = Object.fromEntries(
      pool.filter(p => p.id.includes('-seen-')).map(p => hist(p.id, 30 * 24)),
    );

    const result = selectSmartQuestions(pool, 40, 'regular', {}, history, pool);

    expect(result).toHaveLength(40);
    expect(new Set(result.map(r => r.id)).size).toBe(result.length);

    // Per-topic invariant: ≥30% new in every topic that received any slots.
    // Skip topics that got 0 slots (vacuously satisfied; not the regression
    // we're guarding against).
    const byTopicStats: Record<string, { picked: number; newCount: number }> = {};
    for (const r of result) {
      const topic = r[KEYS.TOPIC] || '__other__';
      const stats = byTopicStats[topic] ?? { picked: 0, newCount: 0 };
      stats.picked += 1;
      if (r.id.includes('-new-')) stats.newCount += 1;
      byTopicStats[topic] = stats;
    }
    for (const [topic, { picked, newCount }] of Object.entries(byTopicStats)) {
      if (picked === 0) continue;
      const expectedMinNew = Math.ceil(picked * NEW_QUESTION_QUOTA_RATIO);
      expect(
        newCount,
        `topic ${topic} got ${picked} slots but only ${newCount} new (expected ≥${expectedMinNew})`,
      ).toBeGreaterThanOrEqual(expectedMinNew);
      // Hamilton 25% cap still holds at the same time (10 slots = 25% of 40).
      expect(picked, `topic ${topic} exceeded 25% cap`).toBeLessThanOrEqual(10);
    }
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
    // No in-session duplicates across the multi-topic, multi-stage selection.
    expect(new Set(result.map(r => r.id)).size).toBe(result.length);
  });

  it('defensive fallback: returns full session when pre-filter empties the pool', () => {
    // All 5 questions are recently answered AND scheduled far out.
    const pool = Array.from({ length: 5 }, (_, i) => q(`burned-${i}`));
    const history = Object.fromEntries(pool.map(p => hist(p.id, 1)));
    const srsData = Object.fromEntries(pool.map(p => srs(p.id, 30)));

    // Spy on the production observability hook — if it ever stops firing
    // (e.g., the alarm `console.warn` is removed), silent prod degradation
    // becomes invisible. Pinning the spy ensures the fallback stays observable.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = selectSmartQuestions(pool, 5, 'regular', srsData, history, pool);

      // Filter empties → fallback to unfiltered → return all 5.
      expect(result).toHaveLength(5);
      // The alarm fired with the [SRS] prefix.
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SRS] pre-filter emptied'),
        expect.objectContaining({ poolSize: 5 }),
      );
    } finally {
      warnSpy.mockRestore();
    }
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
