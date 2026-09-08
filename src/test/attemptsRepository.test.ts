import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { durableAttemptsEnabled } from '@/lib/featureFlags';
import {
  abandonAttempt, attemptErrorMessage, confirmAttemptAnswer, listArchive, readAttempt, repeatAttempt,
  repeatAvailableAt, snapshotToQuestion, startAttempt, submitAttempt,
} from '@/lib/attemptsRepository';

const db = vi.hoisted(() => ({ rpc: vi.fn(), rows: vi.fn(), filters: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  rpc: db.rpc,
  from: () => { const q = { select: () => q, eq: () => q, in: (...args: unknown[]) => { db.filters(...args); return q; }, order: () => db.rows() }; return q; },
} }));

describe('feature flag', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('is off unless VITE_DURABLE_ATTEMPTS is exactly "true"', () => {
    vi.stubEnv('VITE_DURABLE_ATTEMPTS', ''); expect(durableAttemptsEnabled()).toBe(false);
    vi.stubEnv('VITE_DURABLE_ATTEMPTS', '1'); expect(durableAttemptsEnabled()).toBe(false);
    vi.stubEnv('VITE_DURABLE_ATTEMPTS', 'true'); expect(durableAttemptsEnabled()).toBe(true);
  });
});

describe('attempts repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('starts an attempt through the RPC and maps the result', async () => {
    db.rpc.mockResolvedValue({ data: { attempt_id: 'a1', root_id: 'r1', question_order: ['q2', 'q1'] }, error: null });
    await expect(startAttempt('exam', 'end', ['q2', 'q1'])).resolves.toEqual({ attemptId: 'a1', rootId: 'r1', questionOrder: ['q2', 'q1'] });
    expect(db.rpc).toHaveBeenCalledWith('attempt_start', { _mode: 'exam', _feedback_timing: 'end', _question_ids: ['q2', 'q1'] });
  });

  it('maps server error codes to typed errors and everything else to a generic failure', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'COOLDOWN_ACTIVE' } });
    await expect(repeatAttempt('r1', 'immediate')).rejects.toThrow('COOLDOWN_ACTIVE');
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'FetchError: network down' } });
    await expect(submitAttempt('a1', 5)).rejects.toThrow('ATTEMPT_UNAVAILABLE');
    db.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(abandonAttempt('a1')).rejects.toThrow('ATTEMPT_UNAVAILABLE');
    expect(attemptErrorMessage(new Error('COOLDOWN_ACTIVE'))).toMatch(/7 ימים/);
    expect(attemptErrorMessage(new Error('CONFIRMED_IMMUTABLE'))).toMatch(/כבר אושרה/);
    expect(attemptErrorMessage(new Error('whatever'))).toMatch(/לא נשמר/);
  });

  it('confirms with whole milliseconds and keeps null correctness for unscored questions', async () => {
    db.rpc.mockResolvedValue({ data: { is_correct: null, correct_key: null, locked: true }, error: null });
    await expect(confirmAttemptAnswer('a1', 'q1', 'B', 'hesitant', 1234.7)).resolves.toEqual({ isCorrect: null, correctKey: null, explanation: null, locked: true });
    db.rpc.mockResolvedValue({ data: { is_correct: true, correct_key: 'B', explanation: 'frozen why', locked: true }, error: null });
    await expect(confirmAttemptAnswer('a1', 'q1', 'B', 'hesitant', 1)).resolves.toMatchObject({ correctKey: 'B', explanation: 'frozen why' });
    expect(db.rpc).toHaveBeenCalledWith('attempt_confirm', { _attempt_id: 'a1', _question_id: 'q1', _selected: 'B', _confidence: 'hesitant', _answer_ms: 1235 });
  });

  it('submits and maps the server result including per-question correctness', async () => {
    db.rpc.mockResolvedValue({ data: { attempt_id: 'a1', root_id: 'r1', status: 'submitted', correct_count: 1, scored_count: 2, answered_count: 3, total_count: 4, quarter: '2026-Q3', submitted_at: '2026-09-07T10:00:00Z', total_active_ms: 5000, questions: [{ question_id: 'q1', is_correct: true }, { question_id: 'qna', is_correct: null }] }, error: null });
    const result = await submitAttempt('a1', 5000);
    expect(result).toMatchObject({ attemptId: 'a1', correctCount: 1, scoredCount: 2, answeredCount: 3, totalCount: 4, quarter: '2026-Q3' });
    expect(result.questions).toEqual([{ questionId: 'q1', isCorrect: true }, { questionId: 'qna', isCorrect: null }]);
  });

  it('reads a frozen attempt and rebuilds questions from snapshots (missing key stays empty)', async () => {
    db.rpc.mockResolvedValue({ data: {
      attempt_id: 'a1', root_id: 'r1', status: 'submitted', mode: 'practice', feedback_timing: 'immediate', quarter: '2026-Q3',
      correct_count: 0, scored_count: 0, answered_count: 1, total_count: 1, submitted_at: '2026-09-07T10:00:00Z', total_active_ms: 10, started_at: '2026-09-07T09:00:00Z',
      question_order: ['qna'],
      questions: [{ question_id: 'qna', position: 1, snapshot: { id: 'qna', question: 'frozen text', a: 'A', b: 'B', c: 'C', d: 'D', topic: 'Demo', chapter: 3 }, selected: 'B', confidence: 'guessed', answer_ms: 10, confirmed_at: '2026-09-07T09:01:00Z', is_correct: null, scored: false }],
    }, error: null });
    const read = await readAttempt('a1');
    expect(read.questions[0]).toMatchObject({ questionId: 'qna', selected: 'B', confidence: 'guessed', answerMs: 10, isCorrect: null, scored: false });
    expect(snapshotToQuestion(read.questions[0].snapshot)).toMatchObject({ id: 'qna', question: 'frozen text', A: 'A', B: 'B', C: 'C', D: 'D', correct: '', explanation: '', topic: 'Demo', chapter: 3 });
  });

  it('lists the archive with repeat availability derived from the root, 7 days after the latest submission', async () => {
    db.rows.mockResolvedValue({ data: [{ id: 'a1', root_id: 'r1', mode: 'exam', feedback_timing: 'end', status: 'submitted', submitted_at: '2026-09-01T10:00:00Z', quarter: '2026-Q3', total_count: 3, correct_count: 2, scored_count: 3, answered_count: 3, total_active_ms: 9000, attempt_roots: { latest_submitted_at: '2026-09-01T10:00:00Z' } }], error: null });
    const [entry] = await listArchive();
    expect(db.filters).toHaveBeenCalledWith('status', ['submitted', 'in_progress']);
    expect(entry).toMatchObject({ attemptId: 'a1', rootId: 'r1', quarter: '2026-Q3', correctCount: 2 });
    expect(repeatAvailableAt(entry).toISOString()).toBe('2026-09-08T10:00:00.000Z');
    db.rows.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listArchive()).rejects.toThrow('ATTEMPT_UNAVAILABLE');
  });
});
