import { beforeEach, describe, expect, it, vi } from 'vitest';
import { KEYS, type Question } from '@/lib/types';
import { buildLearningReport } from '@/lib/learningInsights';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/attemptsRepository', () => ({ rpc }));
import { fetchLearningEvidence, linkRecommendation, managementExport } from '@/lib/learningRepository';

const base = {
  attempt_id: 'a1', root_id: 'r1', mode: 'practice', kind: null, feedback_timing: 'immediate', confirmed_at: '2026-09-01T10:00:00Z',
  confidence: 'guessed', recommendation_id: null, chapter: '12', scope: 'open', answer_ms: 1200, scored: false, prior_exposures: 0,
  // never returned by the RPC; here to prove the mapper drops unknown keys
  question: 'LEAKED BODY', explanation: 'LEAKED EXPLANATION', A: 'x',
};

describe('learning evidence repository (owner-scoped RPC mapping)', () => {
  beforeEach(() => rpc.mockReset());
  it('keeps unscored answers as null (never wrong), maps scope, and never carries question content', async () => {
    rpc.mockResolvedValueOnce([
      { ...base, question_id: 'q1', is_correct: null },
      { ...base, question_id: 'q2', attempt_id: 'a2', mode: 'exam', kind: 'simulation', is_correct: false, confidence: 'weird', scope: 'national', scored: true, prior_exposures: 2 },
      { ...base, question_id: 'q3', confirmed_at: 'not-a-date', is_correct: true },
    ]);
    const rows = await fetchLearningEvidence();
    expect(rpc).toHaveBeenCalledWith('learning_evidence_read', {});
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ questionId: 'q1', isCorrect: null, scored: false, scope: 'core', chapter: 12, confidence: 'guessed', kind: null });
    expect(rows[1]).toMatchObject({ questionId: 'q2', isCorrect: false, mode: 'exam', kind: 'simulation', confidence: null, scope: 'national', priorExposures: 2 });
    for (const row of rows) expect(Object.keys(row)).not.toEqual(expect.arrayContaining(['question', 'explanation', 'A']));
  });

  it('returns nothing for a non-array payload and never caches between calls', async () => {
    rpc.mockResolvedValueOnce(null).mockResolvedValueOnce([{ ...base, question_id: 'q9', is_correct: true }]);
    expect(await fetchLearningEvidence()).toEqual([]);
    expect(await fetchLearningEvidence()).toHaveLength(1);
  });

  it('links a recommendation with provenance only (no title/rationale/evidence text)', async () => {
    rpc.mockResolvedValueOnce(undefined);
    await linkRecommendation('att-1', {
      id: 'rec-1', kind: 'unseen-coverage', setup: { mode: 'practice', chapters: [14], source: 'all', count: 20, unseenOnly: true },
      provenance: { version: 1, denominatorVersion: 'core-v1', asOf: 1 },
      title: 'x', rationale: 'y',
    } as never);
    const [name, args] = rpc.mock.calls[0];
    expect(name).toBe('learning_recommendation_link');
    expect(Object.keys(args._recommendation).sort()).toEqual(['id', 'kind', 'provenance', 'setup']);
  });

  it('management export exposes only the approved coverage/success projection', () => {
    const q = (id: string): Question => ({
      [KEYS.ID]: id, [KEYS.REF_ID]: id, [KEYS.QUESTION]: '?', [KEYS.A]: 'a', [KEYS.B]: 'b', [KEYS.C]: 'c', [KEYS.D]: 'd',
      [KEYS.CORRECT]: 'A', [KEYS.EXPLANATION]: '', [KEYS.TOPIC]: 'ch12', [KEYS.YEAR]: '2024', [KEYS.SOURCE]: 'מבחן', [KEYS.MILLER]: '',
      [KEYS.CHAPTER]: 12, [KEYS.MEDIA_TYPE]: '', [KEYS.MEDIA_LINK]: '', [KEYS.KIND]: '',
    });
    const report = buildLearningReport({
      bank: Array.from({ length: 10 }, (_, i) => q(`q${i}`)),
      evidence: [{ questionId: 'q0', mode: 'exam', feedbackTiming: 'end', answeredAt: 1, isCorrect: false, confidence: 'guessed' }],
      nowMs: 2,
    });
    const projection = managementExport(report);
    expect(Object.keys(projection).sort()).toEqual(['chapters', 'denominatorVersion', 'overall']);
    expect(JSON.stringify(projection)).not.toMatch(/recommend|confidence|guessed|q0/);
  });
});
