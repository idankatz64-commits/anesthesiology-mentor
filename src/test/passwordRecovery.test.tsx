import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import ResetPassword from '@/pages/ResetPassword';
import { updatePasswordForSession } from '@/lib/passwordRecovery';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn(), toast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: mocks } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
const session = (id: string) => ({ access_token: `test-token-${id}`, user: { id, email: `${id}@example.test` } }) as Session;
let notify: (event: string, value: Session | null) => void;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/reset-password');
  mocks.getSession.mockResolvedValue({ data: { session: session('a') }, error: null });
  mocks.onAuthStateChange.mockImplementation(callback => {
    notify = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const setup = () => render(<MemoryRouter><ResetPassword /></MemoryRouter>);

it('uses an already initialized recovery session and shows its account', async () => {
  setup();
  expect(await screen.findByText('a@example.test')).toBeInTheDocument();
  expect(screen.getByLabelText('סיסמה חדשה')).toBeInTheDocument();
});

it('shows an invalid-link message instead of waiting forever without a session', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('הקישור אינו תקין');
});

it('rejects an expired link even if another account is already signed in', async () => {
  window.history.replaceState({}, '', '/reset-password#error=access_denied');
  setup();
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.queryByLabelText('סיסמה חדשה')).not.toBeInTheDocument();
});

it('clears password drafts when the signed-in identity changes', async () => {
  setup();
  const input = await screen.findByLabelText('סיסמה חדשה');
  fireEvent.change(input, { target: { value: 'local-test-password' } });
  act(() => notify('SIGNED_IN', session('b')));
  expect(input).toHaveValue('');
  expect(screen.getByText('b@example.test')).toBeInTheDocument();
});

it('ignores a stale initial session after a newer auth event', async () => {
  let resolve!: (value: unknown) => void;
  mocks.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  setup();
  act(() => notify('PASSWORD_RECOVERY', session('b')));
  await act(async () => resolve({ data: { session: session('a') }, error: null }));
  expect(screen.getByText('b@example.test')).toBeInTheDocument();
});

it('binds the password request to the selected account token', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'a' }) });
  vi.stubGlobal('fetch', fetchMock);
  await updatePasswordForSession(session('a'), 'local-test-password');
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/auth/v1/user'), expect.objectContaining({
    method: 'PUT', headers: expect.objectContaining({ Authorization: 'Bearer test-token-a' }),
  }));
});

it('does not report success when the server rejects a password update', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(updatePasswordForSession(session('a'), 'local-test-password')).rejects.toThrow('לא ניתן לשמור');
});
