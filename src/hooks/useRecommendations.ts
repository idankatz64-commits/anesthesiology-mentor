import { useMemo } from 'react';

import { useStatsData } from '@/components/stats/useStatsData';
import {
  scoreRecommendation,
  type Recommendation,
} from '@/lib/recommendations';

/**
 * Stats V2 recommendation selector.
 * Pattern: RESEARCH.md §Pattern 2 (selector hook over `useStatsData`).
 *
 * Returns:
 *   - hero:      top-scored Recommendation, or null when no topic data
 *   - weakZones: top 3 Recommendations (sorted desc by score)
 */
export interface UseRecommendationsResult {
  hero: Recommendation | null;
  weakZones: Recommendation[];
}

const DEFAULT_DAYS_SINCE = 30;

export function useRecommendations(): UseRecommendationsResult {
  const data = useStatsData();

  return useMemo<UseRecommendationsResult>(() => {
    const topicData = data.stats?.topicData;
    if (!topicData || topicData.length === 0) {
      return { hero: null, weakZones: [] };
    }

    const riskByTopic = new Map(
      data.forgettingRisk.map(r => [r.topic, r])
    );

    const scored = topicData
      .map(t => {
        const risk = riskByTopic.get(t.topic);
        const daysSince = risk?.daysSince ?? DEFAULT_DAYS_SINCE;
        return scoreRecommendation({
          topic: t.topic,
          accuracy: t.accuracy / 100, // TopicStat.accuracy is 0–100; contract wants 0–1
          daysSinceLastReview: daysSince,
          daysOverdue: daysSince, // proxy until spaced_repetition.next_review_at is wired in a later phase
          questionsSeen: t.totalAnswered,
        });
      })
      .sort((a, b) => b.score - a.score);

    return {
      hero: scored[0] ?? null,
      weakZones: scored.slice(0, 3),
    };
  }, [data.stats, data.forgettingRisk]);
}
