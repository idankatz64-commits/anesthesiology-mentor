import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResidentOnboardingView from '@/components/views/ResidentOnboardingView';
import { useApp } from '@/contexts/AppContext';
import { completeMyOnboarding, type ResidentState } from '@/lib/residentRepository';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/residentRepository', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/residentRepository')>()), completeMyOnboarding: vi.fn() }));
const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth } }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const refreshResident = vi.fn();
const linked: ResidentState = { linked: true, reason: null, member: {
  id: 'm1', email: 'r@example.com', fullName: 'דנה', accessLevel: 'academy', status: 'active', residencyYear: null, examThisYear: false, examDate: null,
  nationalAccess: false, onboardingCompletedAt: null, linkedAt: '2026-09-07T00:00:00Z' } };
const setup = (resident: ResidentState) => {
  vi.mocked(useApp).mockReturnValue({ resident, refreshResident } as unknown as ReturnType<typeof useApp>);
  return render(<ResidentOnboardingView />);
};

describe('resident onboarding screen', () => {
  beforeEach(() => { vi.clearAllMocks(); refreshResident.mockResolvedValue(undefined); auth.signOut.mockResolvedValue({ error: null }); });
  afterEach(cleanup);

  it('renders a Hebrew RTL form with residency year, exam intent and an optional date, and no entitlement control', () => {
    const { container } = setup(linked);
    expect(container.firstElementChild).toHaveAttribute('dir', 'rtl');
    const year = screen.getByRole('combobox', { name: /שנת התמחות/ });
    expect(year.querySelectorAll('option:not([value=""])')).toHaveLength(7);
    expect(screen.getByRole('checkbox', { name: /ניגש.*השנה/ })).not.toBeChecked();
    expect(screen.getByLabelText(/תאריך הבחינה/)).toHaveAttribute('type', 'date');
    expect(screen.queryByRole('checkbox', { name: /ארצי/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/מבחן בסיס/)).not.toBeInTheDocument();
  });

  it('blocks submit until a residency year is chosen, without calling the server', async () => {
    setup(linked);
    fireEvent.click(screen.getByRole('button', { name: /שמירה/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/שנת התמחות/);
    expect(completeMyOnboarding).not.toHaveBeenCalled();
  });

  it('sends exactly the three self-reported fields and refreshes the resident state', async () => {
    vi.mocked(completeMyOnboarding).mockResolvedValue({ ...linked, member: { ...linked.member!, residencyYear: 3, examThisYear: true, examDate: '2027-06-01', onboardingCompletedAt: 'x' } });
    setup(linked);
    fireEvent.change(screen.getByRole('combobox', { name: /שנת התמחות/ }), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /ניגש.*השנה/ }));
    fireEvent.change(screen.getByLabelText(/תאריך הבחינה/), { target: { value: '2027-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: /שמירה/ }));
    await waitFor(() => expect(completeMyOnboarding).toHaveBeenCalledWith({ residencyYear: 3, examDate: '2027-06-01', examThisYear: true }));
    expect(Object.keys(vi.mocked(completeMyOnboarding).mock.calls[0][0])).toHaveLength(3);
    await waitFor(() => expect(refreshResident).toHaveBeenCalled());
  });

  it('sends a null date when the field is left empty', async () => {
    vi.mocked(completeMyOnboarding).mockResolvedValue(linked);
    setup(linked);
    fireEvent.change(screen.getByRole('combobox', { name: /שנת התמחות/ }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /שמירה/ }));
    await waitFor(() => expect(completeMyOnboarding).toHaveBeenCalledWith({ residencyYear: 1, examDate: null, examThisYear: false }));
  });

  it('shows the server refusal in Hebrew and keeps the form', async () => {
    vi.mocked(completeMyOnboarding).mockRejectedValueOnce(new Error('NOT_MEMBER'));
    setup(linked);
    fireEvent.change(screen.getByRole('combobox', { name: /שנת התמחות/ }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /שמירה/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('החשבון עדיין לא מקושר');
    expect(screen.getByRole('button', { name: /שמירה/ })).toBeEnabled();
    expect(refreshResident).not.toHaveBeenCalled();
  });

  it.each([
    ['NOT_ON_ROSTER', /לא נמצאת ברשימת המתמחים/],
    ['EMAIL_NOT_VERIFIED', /Google|אישור המייל/],
    ['EMAIL_ALREADY_LINKED', /כבר מקושרת/],
    ['NOT_LINKED', /להתחבר מחדש/],
  ] as const)('explains %s without offering any self-service verification, with recheck and sign-out', async (reason, text) => {
    setup({ linked: false, reason, member: null });
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /אמת|אימות עכשיו/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /בדיקה מחדש/ }));
    await waitFor(() => expect(refreshResident).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /התנתקות/ }));
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  });
});
