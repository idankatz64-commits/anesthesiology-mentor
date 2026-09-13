import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Auth from '@/pages/Auth';

const auth = vi.hoisted(() => ({ signInWithOtp: vi.fn(), verifyOtp: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
beforeEach(() => {
  vi.clearAllMocks();
  auth.signInWithOtp.mockResolvedValue({ error: null });
  auth.verifyOtp.mockResolvedValue({ error: null, data: { session: { user: { id: 'existing' } } } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const setup = () => render(<MemoryRouter><Auth /></MemoryRouter>);
async function requestCode() {
  fireEvent.change(screen.getByLabelText('כתובת המייל'), { target: { value: 'Resident@Example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד' }));
  return screen.findByLabelText('קוד האימות');
}
it('uses one passwordless entry for existing and new accounts with normalized email', async () => {
  setup(); await requestCode();
  expect(auth.signInWithOtp).toHaveBeenCalledWith({ email: 'resident@example.com', options: { shouldCreateUser: true } });
  expect(screen.queryByLabelText('סיסמה')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /שליחה חוזרת/ })).toBeDisabled();
});
it('verifies the pasted code against the address it was sent to', async () => {
  setup(); const code = await requestCode();
  fireEvent.change(code, { target: { value: '123 456' } });
  fireEvent.click(screen.getByRole('button', { name: 'אימות וכניסה' }));
  await act(async () => {});
  expect(auth.verifyOtp).toHaveBeenCalledWith({ email: 'resident@example.com', token: '123456', type: 'email' });
});
it('keeps the code step after an expired code and explains the error in Hebrew', async () => {
  auth.verifyOtp.mockResolvedValue({ error: { code: 'otp_expired' } });
  setup(); const code = await requestCode();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'אימות וכניסה' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('פג תוקפו');
  expect(screen.getByLabelText('קוד האימות')).toBeInTheDocument();
});
it('explains mail failures and does not pretend that a code was sent', async () => {
  auth.signInWithOtp.mockRejectedValue(new Error('network'));
  setup();
  fireEvent.change(screen.getByLabelText('כתובת המייל'), { target: { value: 'a@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'שלחו לי קוד' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו');
  expect(screen.queryByLabelText('קוד האימות')).not.toBeInTheDocument();
});
it('clears a code when correcting the destination email', async () => {
  setup(); const code = await requestCode();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'שינוי כתובת המייל' }));
  expect(screen.getByLabelText('כתובת המייל')).toBeInTheDocument();
  expect(screen.queryByLabelText('קוד האימות')).not.toBeInTheDocument();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it('does not leave the code screen when an existing session is restored on tab focus', async () => {
  const listeners: ((event: string, session: unknown) => void)[] = [];
  auth.onAuthStateChange.mockImplementation(callback => {
    listeners.push(callback);
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  render(<MemoryRouter initialEntries={['/auth']}><Routes><Route path="/auth" element={<Auth />} /><Route path="/" element={<p>Home route</p>} /></Routes></MemoryRouter>);
  await requestCode();
  act(() => listeners.forEach(notify => notify('SIGNED_IN', { user: { id: 'blocked-existing-user' } })));
  expect(screen.getByLabelText('קוד האימות')).toBeInTheDocument();
  expect(auth.verifyOtp).not.toHaveBeenCalled();
});
it('does not accept a success response that contains no authenticated session', async () => {
  auth.verifyOtp.mockResolvedValue({ error: null, data: { session: null } });
  setup(); const code = await requestCode();
  fireEvent.change(code, { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'אימות וכניסה' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('לא הצלחנו לאמת');
});
it('blocks duplicate sends while the mail request is still pending', async () => {
  let resolve!: (value: unknown) => void;
  auth.signInWithOtp.mockReturnValue(new Promise(done => { resolve = done; }));
  setup();
  fireEvent.change(screen.getByLabelText('כתובת המייל'), { target: { value: 'a@example.com' } });
  const button = screen.getByRole('button', { name: 'שלחו לי קוד' });
  fireEvent.click(button); fireEvent.click(button);
  expect(auth.signInWithOtp).toHaveBeenCalledTimes(1);
  await act(async () => resolve({ error: null }));
});
