import { describe, it, expect } from 'vitest';
import { aggregate } from '@/components/srs/useSrsDashboard';

const today = '2026-04-15';

describe('aggregate', () => {
  it('returns zeroed stats when no SRS rows', () => {
    const result = aggregate({ srsRows: [], questions: [], today });
    expect(result.stats.dueToday).toBe(0);
    expect(result.stats.overdue).toBe(0);
    expect(result.stats.totalPending).toBe(0);
    expect(result.stats.next7Days).toBe(0);
    expect(result.decayBins).toHaveLength(30);
    expect(result.decayBins.every(b => b.count === 0)).toBe(true);
    expect(result.topics).toEqual([]);
    expect(result.chapters).toEqual([]);
  });

  it('counts dueToday and overdue correctly', () => {
    const srsRows = [
      { question_id: 'q1', next_review_date: '2026-04-15', last_correct: null },
      { question_id: 'q2', next_review_date: '2026-04-14', last_correct: null },
      { question_id: 'q3', next_review_date: '2026-04-10', last_correct: null },
      { question_id: 'q4', next_review_date: '2026-04-20', last_correct: null },
    ];
    const questions = [
      { id: 'q1', topic: 'A', chapter: 1 },
      { id: 'q2', topic: 'A', chapter: 1 },
      { id: 'q3', topic: 'B', chapter: 2 },
      { id: 'q4', topic: 'A', chapter: 1 },
    ] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.stats.dueToday).toBe(1);
    expect(result.stats.overdue).toBe(2);
    expect(result.stats.totalPending).toBe(3);
    expect(result.stats.next7Days).toBe(4);
  });

  it('filters out SRS rows whose question was deleted', () => {
    const srsRows = [{ question_id: 'orphan', next_review_date: today, last_correct: null }];
    const result = aggregate({ srsRows, questions: [], today });
    expect(result.stats.totalPending).toBe(0);
  });

  it('computes criticalScore = (1 - accuracy) * overdue and isCritical at P75', () => {
    const srsRows = [
      { question_id: 'a1', next_review_date: '2026-04-10', last_correct: false },
      { question_id: 'a2', next_review_date: '2026-04-10', last_correct: false },
      { question_id: 'b1', next_review_date: '2026-04-14', last_correct: true },
      { question_id: 'c1', next_review_date: '2026-04-20', last_correct: true },
    ];
    const questions = [
      { id: 'a1', topic: 'A', chapter: 1 },
      { id: 'a2', topic: 'A', chapter: 1 },
      { id: 'b1', topic: 'B', chapter: 2 },
      { id: 'c1', topic: 'C', chapter: 3 },
    ] as any[];
    const result = aggregate({ srsRows, questions, today });
    const topicA = result.topics.find(t => t.topic === 'A')!;
    expect(topicA.overdue).toBe(2);
    expect(topicA.accuracy).toBe(0);
    expect(topicA.criticalScore).toBe(2);
    expect(topicA.isCritical).toBe(true);
  });

  it('handles topic with no history: accuracy=0, criticalScore=overdue', () => {
    const srsRows = [{ question_id: 'x1', next_review_date: '2026-04-10', last_correct: null }];
    const questions = [{ id: 'x1', topic: 'X', chapter: 1 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    const t = result.topics.find(tt => tt.topic === 'X')!;
    expect(t.accuracy).toBe(0);
    expect(t.criticalScore).toBe(1);
    expect(Number.isNaN(t.criticalScore)).toBe(false);
  });

  it('decayBins[0].isOverdue=true iff any row is overdue or due today', () => {
    const srsRows = [{ question_id: 'q', next_review_date: '2026-04-10', last_correct: null }];
    const questions = [{ id: 'q', topic: 'T', chapter: 1 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.decayBins[0].isOverdue).toBe(true);
    expect(result.decayBins[0].count).toBe(1);
  });

  it('chapters list only includes chapters the user has SRS rows in', () => {
    const srsRows = [{ question_id: 'q', next_review_date: today, last_correct: null }];
    const questions = [{ id: 'q', topic: 'T', chapter: 7 }] as any[];
    const result = aggregate({ srsRows, questions, today });
    expect(result.chapters).toHaveLength(1);
    expect(result.chapters[0].chapter).toBe(7);
  });
});
