import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchQuestions, invalidateQuestionsCache, setQuestionsCacheScope } from '@/lib/csvService';

// The sessionStorage bank cache must belong to one identity (user + entitlement).
// A bank cached for user A, or for the same user while national access was on,
// must never be served after a switch/revoke. Server RLS is the real filter; this
// keeps the client from replaying what it was told earlier.
const db = vi.hoisted(() => ({ rows: [{ id: 'q1' }] as { id: string }[], calls: 0, gate: null as Promise<void> | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({ select: () => ({ range: async () => { db.calls += 1; if (db.gate) await db.gate; return { data: db.rows, error: null }; } }) }) } }));

describe('question cache scope', () => {
  beforeEach(() => { sessionStorage.clear(); db.calls = 0; db.rows = [{ id: 'q1' }]; db.gate = null; setQuestionsCacheScope(''); });

  it('serves the cache again for the same scope', async () => {
    setQuestionsCacheScope('user-a:open');
    await fetchQuestions(); await fetchQuestions();
    expect(db.calls).toBe(1);
  });

  it('keeps a bank fetched live before identity was known, then drops it on a real switch', async () => {
    await fetchQuestions();                       // scope '' — fetched with the current session token
    expect(setQuestionsCacheScope('user-a:open')).toBe(false);
    await fetchQuestions();
    expect(db.calls).toBe(1);                     // still cached
    db.rows = [{ id: 'q-b' }];
    expect(setQuestionsCacheScope('user-b:open')).toBe(true);
    expect((await fetchQuestions())[0].id).toBe('q-b');
    expect(db.calls).toBe(2);
  });

  it('drops the bank when the same user loses or gains national access', async () => {
    setQuestionsCacheScope('user-a:national');
    await fetchQuestions();
    expect(setQuestionsCacheScope('user-a:open')).toBe(true);
    expect(sessionStorage.getItem('questions_cache')).toBeNull();
  });

  it('survives a reload: the scope is persisted next to the bank', async () => {
    setQuestionsCacheScope('user-a:open');
    await fetchQuestions();
    expect(sessionStorage.getItem('questions_cache_scope')).toBe('user-a:open');
  });

  it('does not stamp a bank fetched under the previous scope onto the new one', async () => {
    let openGate: () => void = () => {};
    db.gate = new Promise<void>((resolve) => { openGate = resolve; });
    setQuestionsCacheScope('user-a:open');
    const inFlight = fetchQuestions();          // starts under user-a
    setQuestionsCacheScope('user-b:open');      // identity switches while the fetch is still running
    openGate();
    await inFlight;
    expect(sessionStorage.getItem('questions_cache')).toBeNull();   // user-a's bank must not be cached for user-b
    expect(sessionStorage.getItem('questions_cache_scope')).toBe('user-b:open');
  });

  it('sign-out invalidation still works independently of the scope', async () => {
    setQuestionsCacheScope('user-a:open');
    await fetchQuestions();
    invalidateQuestionsCache();
    expect(sessionStorage.getItem('questions_cache')).toBeNull();
  });
});
