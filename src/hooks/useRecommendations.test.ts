import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

import type { ForgettingRisk, TopicStat } from '@/components/stats/useStatsData';

// ──────────────────────────────────────────────────────────────────────────
// W0.7 — RED → GREEN tests for `useRecommendations` selector hook
// Contract: .planning/phase-1/RESEARCH.md §Pattern 2
//
//   Returns { hero: Recommendation | null, weakZones: Recommendation[] }
//     • null hero + [] weakZones when topicData empty or missing
//     • hero = scored[0] (highest score after sort desc)
//     • weakZones = scored.slice(0, 3)
// ──────────────────────────────────────────────────────────────────────────

type StatsShape = {
  stats: { topicData: TopicStat[] } | null;
  forgettingRisk: ForgettingRisk[];
};

const mockUseStatsData = vi.fn<() => StatsShape>();

vi.mock('@/components/stats/useStatsData', () => ({
  useStatsData: () => mockUseStatsData(),
}));

async function loadHook() {
  const mod = await import('./useRecommendations');
  return mod.useRecommendations;
}

function makeTopic(overrides: Partial<TopicStat> & Pick<TopicStat, 'topic'>): TopicStat {
  return {
    topic: overrides.topic,
    totalInDb: overrides.totalInDb ?? 20,
    totalAnswered: overrides.totalAnswered ?? 20,
    correct: overrides.correct ?? 10,
    wrong: overrides.wrong ?? 10,
    accuracy: overrides.accuracy ?? 50,
    smartScore: overrides.smartScore ?? 40,
    trend: overrides.trend ?? 'neutral',
  };
}

describe('useRecommendations', () => {
  it('(a) returns null hero and empty weakZones when topicData is empty', async () => {
    const useRecommendations = await loadHook();
    mockUseStatsData.mockReturnValue({
      stats: { topicData: [] },
      forgettingRisk: [],
    });

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.hero).toBeNull();
    expect(result.current.weakZones).toEqual([]);
  });

  it('(a.2) returns null hero when stats itself is null (race with data fetch)', async () => {
    const useRecommendations = await loadHook();
    mockUseStatsData.mockReturnValue({ stats: null, forgettingRisk: [] });

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.hero).toBeNull();
    expect(result.current.weakZones).toEqual([]);
  });

  it('(b) selects highest-score topic as hero', async () => {
    const useRecommendations = await loadHook();
    mockUseStatsData.mockReturnValue({
      stats: {
        topicData: [
          makeTopic({ topic: 'Thoracic Surgery', accuracy: 90, totalAnswered: 50 }),
          makeTopic({ topic: 'Cardiac Physiology', accuracy: 30, totalAnswered: 50 }),
          makeTopic({ topic: 'Local Anesthetics', accuracy: 60, totalAnswered: 40 }),
        ],
      },
      forgettingRisk: [
        { topic: 'Cardiac Physiology', risk: 80, daysSince: 14, accuracy: 30 },
        { topic: 'Thoracic Surgery',   risk: 20, daysSince: 2,  accuracy: 90 },
        { topic: 'Local Anesthetics',  risk: 50, daysSince: 7,  accuracy: 60 },
      ],
    });

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.hero).not.toBeNull();
    expect(result.current.hero?.topic).toBe('Cardiac Physiology');
  });

  it('(c) weakZones = top-3 by score, sorted desc', async () => {
    const useRecommendations = await loadHook();
    const topics = ['Cardiac Physiology', 'Local Anesthetics', 'Respiratory Physiology', 'Thoracic Surgery', 'Chronic Pain Management'];

    mockUseStatsData.mockReturnValue({
      stats: {
        topicData: topics.map((t, i) =>
          makeTopic({ topic: t, accuracy: 20 + i * 10, totalAnswered: 30 })
        ),
      },
      forgettingRisk: topics.map((t, i) => ({ topic: t, risk: 50, daysSince: 10 - i, accuracy: 20 + i * 10 })),
    });

    const { result } = renderHook(() => useRecommendations());

    expect(result.current.weakZones).toHaveLength(3);
    const scores = result.current.weakZones.map(r => r.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]);
  });
});
