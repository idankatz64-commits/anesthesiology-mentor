import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AppProvider, useApp } from '@/contexts/AppContext';
import SessionView from '@/components/views/SessionView';
import { launchQuestion } from './fixtures/launchQuestion';

// Full path: resumed read is stripped (no key, no explanation) -> the user
// answers and rates -> the server confirms and reveals -> SessionView renders
// the verdict and the frozen explanation. End feedback must not leak.
const db = vi.hoisted(() => ({ saved: null as unknown, rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: {
    getSession: async () => ({ data: { session: { user: { id: 'synthetic-user' } } } }),
    onAuthStateChange: (callback: (event: string, session: unknown) => void) => {
      queueMicrotask(() => callback('INITIAL_SESSION', { user: { id: 'synthetic-user' } }));
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  },
  rpc: db.rpc,
  from: (table: string) => {
    const query = {
      select: () => query, eq: () => query, in: () => query, order: () => query, range: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: async () => ({ data: table === 'saved_sessions' ? { session_data: db.saved } : null, error: null }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
      upsert: async () => ({ error: null }), delete: () => ({ eq: async () => ({ error: null }) }),
    };
    return query;
  },
} }));
const q = launchQuestion('q1');
vi.mock('@/lib/csvService', () => ({ fetchQuestions: async () => [q], invalidateQuestionsCache: vi.fn(), setQuestionsCacheScope: () => false }));
vi.mock('@/lib/academyRepository', () => ({ claimAcademyMembership: async () => null, fetchMyAttempts: async () => [] }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/FormulaCalculatorPanel', () => ({ default: () => null }));
vi.mock('@/components/RichTextEditor', () => ({ default: () => null }));
vi.mock('@/components/ShareQuestionButton', () => ({ default: () => null }));
vi.mock('@/components/ImageGallery', () => ({ default: () => null }));
vi.mock('@/components/views/SessionCommunity', () => ({ GlobalQuestionStats: () => null, CommunityNotes: () => null }));
vi.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

const strippedRead = (mode: string, timing: string) => ({
  attempt_id: 'att-1', root_id: 'root-1', status: 'in_progress', mode, feedback_timing: timing, total_count: 1, started_at: 's', question_order: ['q1'],
  questions: [{ question_id: 'q1', position: 1, snapshot: { id: 'q1', question: 'frozen wording', a: q.A, b: q.B, c: q.C, d: q.D, topic: q.topic, chapter: 1 }, selected: null, confidence: null, answer_ms: null, confirmed_at: null, is_correct: null, scored: true }],
});

function Shell() {
  const { currentView, loadingSavedSession, resumeSessionFromDb } = useApp();
  useEffect(() => { if (!loadingSavedSession) void resumeSessionFromDb(); }, [loadingSavedSession]); // eslint-disable-line react-hooks/exhaustive-deps
  return currentView === 'session' ? <SessionView /> : null;
}

describe('durable reveal after a stripped resume', () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', 'true'); HTMLElement.prototype.scrollTo = vi.fn();
    db.saved = { questionIds: ['q1'], index: 0, mode: 'practice', answers: [null], confidence: [null], flagged: [], skipped: [], attemptId: 'att-1', rootId: 'root-1', createdAt: 'c' };
  });
  afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

  it('immediate: shows the verdict and the frozen explanation only after the server confirms', async () => {
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_read') return { data: strippedRead('practice', 'immediate'), error: null };
      if (name === 'attempt_confirm') return { data: { is_correct: true, correct_key: 'A', explanation: 'frozen explanation', locked: true }, error: null };
      return { data: true, error: null };
    });
    render(<AppProvider><Shell /></AppProvider>);
    expect(await screen.findByText(/frozen wording/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    expect(screen.queryByText(/frozen explanation/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    expect(await screen.findByText(/frozen explanation/)).toBeTruthy();
    expect(screen.getByText(/יפה מאוד/)).toBeTruthy();
  });

  it('end: confirming reveals nothing', async () => {
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_read') return { data: strippedRead('exam', 'end'), error: null };
      if (name === 'attempt_confirm') return { data: { is_correct: null, correct_key: null, explanation: null, locked: false }, error: null };
      return { data: true, error: null };
    });
    render(<AppProvider><Shell /></AppProvider>);
    expect(await screen.findByText(/frozen wording/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledWith('attempt_confirm', expect.objectContaining({ _selected: 'A' })));
    expect(screen.queryByText(/frozen explanation/)).toBeNull();
    expect(screen.queryByText(/יפה מאוד/)).toBeNull();
  });

  // R2: an unscored question (frozen key is null) still gets its frozen
  // explanation back on confirm; the client must not invent a key.
  it('immediate, unscored: the frozen explanation is shown even when the key is null', async () => {
    const read = strippedRead('practice', 'immediate');
    read.questions[0].scored = false;
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'attempt_read') return { data: read, error: null };
      if (name === 'attempt_confirm') return { data: { is_correct: null, correct_key: null, explanation: 'unkeyed frozen explanation', locked: true }, error: null };
      return { data: true, error: null };
    });
    render(<AppProvider><Shell /></AppProvider>);
    expect(await screen.findByText(/frozen wording/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /אפשרות אלף/ }));
    fireEvent.click(screen.getByRole('button', { name: 'בטוח' }));
    expect(await screen.findByText(/unkeyed frozen explanation/)).toBeTruthy();
    expect(screen.queryByText(/אין הסבר/)).toBeNull();
    expect(screen.queryByText(/יפה מאוד/)).toBeNull();
  });
});
