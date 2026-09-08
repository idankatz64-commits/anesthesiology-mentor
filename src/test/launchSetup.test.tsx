import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import SetupView from '@/components/views/SetupView';
import { launchQuestion } from './fixtures/launchQuestion';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
// SetupView → attemptsRepository → supabase client; without VITE_SUPABASE_URL in the shell the
// client constructor throws at import. Same stub as the sibling launch tests, never reached here.
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({}) } }));

const startSession = vi.fn();
const fetchSrsData = vi.fn();
const pool = Array.from({ length: 620 }, (_, i) => launchQuestion(String(i)));

describe('launch setup', () => {
  // Legacy start path: pinned flag-off (the durable path has its own error wording).
  beforeEach(() => {
    cleanup(); vi.clearAllMocks(); vi.stubEnv('VITE_DURABLE_ATTEMPTS', '');
    fetchSrsData.mockResolvedValue({});
    vi.mocked(useApp).mockReturnValue({
      data: pool, progress: { history: {}, tags: {} }, session: { sourceFilter: 'all', unseenOnly: false },
      multiSelect: Object.fromEntries(['topic', 'year', 'kind', 'institution', 'confidence', 'usertags'].map(key => [key, new Set(['all'])])),
      getFilteredQuestions: () => pool, fetchSrsData, startSession,
    } as unknown as ReturnType<typeof useApp>);
  });

  it('caps a custom count at 500 and carries the feedback setting', async () => {
    render(<SetupView mode="exam" />);
    fireEvent.click(screen.getByRole('button', { name: 'מותאם אישית' }));
    fireEvent.change(screen.getByLabelText('מספר שאלות:'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'אחרי כל שאלה' }));
    fireEvent.click(screen.getByRole('button', { name: 'התחל בחינה' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
    expect(fetchSrsData).toHaveBeenCalledOnce();
    expect(startSession.mock.calls[0][0]).toHaveLength(500);
    expect(startSession.mock.calls[0].slice(1)).toEqual([500, 'exam', { feedbackTiming: 'immediate' }]);
  });

  it('retains the selected count and allows retry instead of silently starting a random session', async () => {
    // Phase 3B: SRS is fetched once on mount (preview) and again on the click.
    fetchSrsData.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    render(<SetupView mode="practice" />);
    fireEvent.click(screen.getByRole('button', { name: 'מותאם אישית' }));
    fireEvent.change(screen.getByLabelText('מספר שאלות:'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('אפשר לנסות שוב');
    expect(startSession).not.toHaveBeenCalled();
    expect(screen.getByLabelText('מספר שאלות:')).toHaveValue(12);
    fireEvent.click(screen.getByRole('button', { name: 'התחל תרגול' }));
    await waitFor(() => expect(startSession).toHaveBeenCalledOnce());
  });
});
