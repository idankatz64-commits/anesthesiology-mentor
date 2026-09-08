import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorialOwner } from '@/components/admin/editorialOwner';
import { useAdminGuard } from '@/hooks/useAdminGuard';
import CurriculumConfigTab from '@/components/admin/CurriculumConfigTab';
import { useApp } from '@/contexts/AppContext';

const { fetchMyFeedbackRole, fetchCurriculumConfig, publishCurriculumVersion, toast } = vi.hoisted(() => ({
  fetchMyFeedbackRole: vi.fn(), fetchCurriculumConfig: vi.fn(), publishCurriculumVersion: vi.fn(), toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/feedbackRepository', () => ({ fetchMyFeedbackRole }));
vi.mock('@/lib/curriculumRepository', async (orig) => ({ ...(await orig<object>()), fetchCurriculumConfig, publishCurriculumVersion }));
vi.mock('sonner', () => ({ toast }));
vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
const navigate = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
const auth = vi.hoisted(() => ({ getSession: vi.fn(), listener: null as null | ((event: string, session: unknown) => void), unsubscribe: vi.fn() }));
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc,
    auth: { getSession: auth.getSession, onAuthStateChange: (cb: (event: string, session: unknown) => void) => { auth.listener = cb; return { data: { subscription: { unsubscribe: auth.unsubscribe } } }; } },
  },
}));

// A promise whose settlement is controlled by the test (a "late" server answer).
const deferred = <T,>() => { let resolve!: (v: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; };
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('identity-aware owner gate (useEditorialOwner)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('owner → non-owner admin: clears synchronously on the switch, then resolves for the new identity only', async () => {
    fetchMyFeedbackRole.mockResolvedValueOnce({ owner: true, author: true, approved: true }).mockResolvedValueOnce({ owner: false, author: false, approved: true });
    const { result, rerender } = renderHook(({ uid }) => useEditorialOwner(uid), { initialProps: { uid: 'owner-a' } });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ uid: 'admin-b' });
    expect(result.current).toBeNull(); // nothing from A is reused for B
    await waitFor(() => expect(result.current).toBe(false));
  });

  it('sign-out clears the owner UI immediately and asks nothing of the server', async () => {
    fetchMyFeedbackRole.mockResolvedValue({ owner: true, author: true, approved: true });
    const { result, rerender } = renderHook(({ uid }) => useEditorialOwner(uid), { initialProps: { uid: 'owner-a' as string | null } });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ uid: null });
    expect(result.current).toBe(false);
    expect(fetchMyFeedbackRole).toHaveBeenCalledTimes(1);
  });

  it('a delayed answer for the original owner never grants the owner UI to the next identity', async () => {
    const late = deferred<{ owner: boolean; author: boolean; approved: boolean }>();
    fetchMyFeedbackRole.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ owner: false, author: false, approved: true });
    const { result, rerender } = renderHook(({ uid }) => useEditorialOwner(uid), { initialProps: { uid: 'owner-a' } });
    rerender({ uid: 'admin-b' });
    await waitFor(() => expect(result.current).toBe(false));
    await act(async () => { late.resolve({ owner: true, author: true, approved: true }); await Promise.resolve(); });
    expect(result.current).toBe(false);
  });
});

describe('identity-aware admin guard (useAdminGuard)', () => {
  beforeEach(() => { vi.clearAllMocks(); auth.listener = null; });

  const session = (id: string | null) => (id ? { user: { id } } : null);

  it('re-checks the role when the identity changes and revokes access for a non-admin', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('admin-a') } });
    rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: false, error: null });
    const { result } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(result.current).toEqual({ loading: false, isAdmin: true }));
    act(() => auth.listener!('SIGNED_IN', session('user-b')));
    expect(result.current.isAdmin).toBe(false);
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(rpc).toHaveBeenLastCalledWith('is_admin', { _user_id: 'user-b' });
  });

  it('sign-out clears access at once and leaves the admin page', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('admin-a') } });
    rpc.mockResolvedValue({ data: true, error: null });
    const { result } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(result.current.isAdmin).toBe(true));
    act(() => auth.listener!('SIGNED_OUT', null));
    expect(result.current).toEqual({ loading: true, isAdmin: false });
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });

  it('a delayed admin answer for the previous identity is discarded', async () => {
    auth.getSession.mockResolvedValue({ data: { session: session('admin-a') } });
    const late = deferred<{ data: boolean; error: null }>();
    rpc.mockReturnValueOnce(late.promise).mockResolvedValueOnce({ data: false, error: null });
    const { result } = renderHook(() => useAdminGuard());
    await waitFor(() => expect(auth.listener).not.toBeNull());
    await flush();
    act(() => auth.listener!('SIGNED_IN', session('user-b')));
    await waitFor(() => expect(navigate).toHaveBeenCalled());
    await act(async () => { late.resolve({ data: true, error: null }); await Promise.resolve(); });
    expect(result.current.isAdmin).toBe(false);
  });
});

describe('identity-aware curriculum config tab', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  const ownerState = { approved: null, draft: { version: 'v2', status: 'draft', chapters: [{ id: 1, title: 'a' }], contentHash: 'h2' }, canEdit: true, canPublish: true, versions: [] };
  const adminState = { ...ownerState, canPublish: false };
  const mockApp = (userId: string | null) => vi.mocked(useApp).mockReturnValue({ userId } as unknown as ReturnType<typeof useApp>);

  it('a late config for the original owner never shows the publish section to the next identity', async () => {
    const late = deferred<typeof ownerState>();
    fetchCurriculumConfig.mockReturnValueOnce(late.promise).mockResolvedValueOnce(adminState);
    mockApp('owner-a');
    const { rerender } = render(<CurriculumConfigTab />);
    mockApp('admin-b');
    rerender(<CurriculumConfigTab />);
    await screen.findByRole('heading', { name: 'טיוטה' });
    await act(async () => { late.resolve(ownerState); await Promise.resolve(); });
    expect(screen.queryByRole('heading', { name: /אישור ופרסום/ })).not.toBeInTheDocument();
  });

  it('a publish that finishes after sign-out shows no success toast and passes the CAS identities', async () => {
    fetchCurriculumConfig.mockResolvedValue(ownerState);
    const late = deferred<unknown>();
    publishCurriculumVersion.mockReturnValue(late.promise);
    mockApp('owner-a');
    const { rerender } = render(<CurriculumConfigTab />);
    const input = await screen.findByLabelText('אישור גרסה');
    await act(async () => { input.focus(); });
    const { fireEvent } = await import('@testing-library/react');
    fireEvent.change(input, { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('button', { name: 'אשר ופרסם' }));
    expect(publishCurriculumVersion).toHaveBeenCalledWith('v2', null, 'h2');
    mockApp(null);
    rerender(<CurriculumConfigTab />);
    expect(screen.queryByRole('heading', { name: /אישור ופרסום/ })).not.toBeInTheDocument();
    await act(async () => { late.resolve({}); await Promise.resolve(); });
    expect(toast.success).not.toHaveBeenCalled();
  });
});
