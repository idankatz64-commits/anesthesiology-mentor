import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AcademyMembersTab from '@/components/admin/AcademyMembersTab';
import { fetchMembers, fetchMyAdminRole, type AcademyMemberRow } from '@/lib/academyRepository';
import { setMemberNationalAccess, upsertResidentRoster } from '@/lib/residentRepository';

vi.mock('@/lib/academyRepository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/academyRepository')>()),
  fetchMembers: vi.fn(), fetchMyAdminRole: vi.fn(), addMembers: vi.fn(), updateMember: vi.fn(), deleteMember: vi.fn(),
}));
vi.mock('@/lib/residentRepository', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/residentRepository')>()), upsertResidentRoster: vi.fn(), setMemberNationalAccess: vi.fn(),
}));
vi.mock('@/lib/demoMode', () => ({ isDemo: () => false, maskEmail: (e: string) => e, maskName: (n: string) => n }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

const row = (over: Partial<AcademyMemberRow> = {}): AcademyMemberRow => ({
  id: 'm1', email: 'dana@example.com', full_name: 'Dana', user_id: 'u1', access_level: 'academy', status: 'active', residency_year: 3, created_at: '2026-09-01',
  exam_this_year: true, exam_date: '2027-06-01', national_access: false, onboarding_completed_at: '2026-09-07T00:00:00Z', ...over,
});
const rowOf = (email: string) => screen.getByText(email).closest('tr')!;

describe('admin roster import and national-access toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchMembers).mockResolvedValue([row(), row({ id: 'm2', email: 'noam@example.com', full_name: 'Noam', exam_this_year: false, exam_date: null, onboarding_completed_at: null, user_id: null })]);
    vi.mocked(fetchMyAdminRole).mockResolvedValue('admin');
    vi.mocked(setMemberNationalAccess).mockImplementation(async (memberId, enabled) => ({ memberId, nationalAccess: enabled, setAt: 'now', setBy: 'admin-1' }));
  });
  afterEach(cleanup);

  it('shows exam intent read-only and the national toggle separately, and the toggle is independent of intent', async () => {
    render(<AcademyMembersTab />);
    const dana = await waitFor(() => rowOf('dana@example.com'));
    expect(within(dana).getByText(/ניגש/)).toBeInTheDocument();
    expect(within(dana).queryByRole('checkbox', { name: /ניגש/ })).not.toBeInTheDocument();
    const noam = rowOf('noam@example.com');
    expect(within(noam).getByText(/לא ניגש/)).toBeInTheDocument();
    fireEvent.click(within(noam).getByRole('switch', { name: /ארצי/ }));
    await waitFor(() => expect(setMemberNationalAccess).toHaveBeenCalledWith('m2', true));
    expect(fetchMembers).toHaveBeenCalledTimes(2);
  });

  it('revokes through the same RPC and shows the server refusal for a non-admin caller', async () => {
    vi.mocked(fetchMembers).mockResolvedValue([row({ national_access: true })]);
    render(<AcademyMembersTab />);
    const dana = await waitFor(() => rowOf('dana@example.com'));
    const toggle = within(dana).getByRole('switch', { name: /ארצי/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    vi.mocked(setMemberNationalAccess).mockRejectedValueOnce(new Error('NOT_ADMIN'));
    fireEvent.click(toggle);
    await waitFor(() => expect(setMemberNationalAccess).toHaveBeenCalledWith('m1', false));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('מנהל')));
  });

  it('hides roster import and the toggle from an editor, who still sees the intent columns', async () => {
    vi.mocked(fetchMyAdminRole).mockResolvedValue('editor');
    render(<AcademyMembersTab />);
    const dana = await waitFor(() => rowOf('dana@example.com'));
    expect(within(dana).queryByRole('switch')).not.toBeInTheDocument();
    expect(within(dana).getByText(/ניגש/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/קובץ הרשימה/)).not.toBeInTheDocument();
    expect(screen.getByText(/מנהל בלבד/)).toBeInTheDocument();
  });

  it('previews a pasted three-column CSV with rejected lines before anything is sent', async () => {
    render(<AcademyMembersTab />);
    await waitFor(() => rowOf('dana@example.com'));
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'name,email,exam_this_year\nDana,dana@example.com,yes\nBad,not-an-email,no\nDup,DANA@example.com,no\nNoam,noam@example.com,' } });
    const preview = await screen.findByRole('table', { name: /תצוגה מקדימה/ });
    expect(within(preview).getAllByRole('row')).toHaveLength(3);
    expect(within(preview).getByText('dana@example.com')).toBeInTheDocument();
    const rejected = screen.getByRole('list', { name: /שורות שנדחו/ });
    expect(within(rejected).getAllByRole('listitem')).toHaveLength(2);
    expect(within(rejected).getByText(/שורה 3/)).toHaveTextContent(/מייל לא תקין/);
    expect(within(rejected).getByText(/שורה 4/)).toHaveTextContent(/כפול/);
    expect(screen.getByRole('button', { name: /ייבוא הרשימה/ })).toBeDisabled();
    expect(upsertResidentRoster).not.toHaveBeenCalled();
  });

  it('says an unstated exam intent will be left alone, instead of previewing it as "no"', async () => {
    render(<AcademyMembersTab />);
    await waitFor(() => rowOf('dana@example.com'));
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'Noam,noam@example.com,\nRoni,roni@example.com,no' } });
    const preview = await screen.findByRole('table', { name: /תצוגה מקדימה/ });
    const [, unstated, answered] = within(preview).getAllByRole('row');
    // The legacy file never asked the question, so the import will not touch the
    // stored answer — the preview has to say that rather than promise a "no".
    expect(within(unstated).getByText('לא צוין — לא ישתנה (מתמחה חדש: לא)')).toBeInTheDocument();
    expect(within(answered).getByText('לא')).toBeInTheDocument();
  });

  it('previews and submits the exact four-column Hebrew sheet with residency year', async () => {
    vi.mocked(upsertResidentRoster).mockResolvedValue({ applied: true, inserted: 1, updated: 0, rejected: [] });
    render(<AcademyMembersTab />);
    await waitFor(() => rowOf('dana@example.com'));
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'שם מלא,אימייל,שלב בהתמחות ( מספיק שנה),מתכננים לגשת לשלב א׳ השנה?\nדנה כהן,dana+ysnp-learner@gmail.com,שלישית,כן' } });
    const preview = await screen.findByRole('table', { name: /תצוגה מקדימה/ });
    expect(within(preview).getByText('dana+ysnp-learner@gmail.com')).toBeInTheDocument();
    expect(within(preview).getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /ייבוא הרשימה/ }));
    await waitFor(() => expect(upsertResidentRoster).toHaveBeenCalledWith([
      { name: 'דנה כהן', email: 'dana+ysnp-learner@gmail.com', residencyYear: 3, examThisYear: true },
    ]));
  });

  it('disables import with nothing valid, imports the valid rows, and reports the server counts', async () => {
    vi.mocked(upsertResidentRoster).mockResolvedValue({ applied: true, inserted: 1, updated: 1, rejected: [] });
    render(<AcademyMembersTab />);
    await waitFor(() => rowOf('dana@example.com'));
    const importButton = screen.getByRole('button', { name: /ייבוא הרשימה/ });
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'garbage' } });
    expect(importButton).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'Dana,dana@example.com,yes\nNew,new@example.com,no' } });
    fireEvent.click(importButton);
    await waitFor(() => expect(upsertResidentRoster).toHaveBeenCalledWith([
      { name: 'Dana', email: 'dana@example.com', residencyYear: null, examThisYear: true },
      { name: 'New', email: 'new@example.com', residencyYear: null, examThisYear: false },
    ]));
    expect(await screen.findByRole('status')).toHaveTextContent(/נוספו 1/);
    expect(screen.getByRole('status')).toHaveTextContent(/עודכנו 1/);
    expect(fetchMembers).toHaveBeenCalledTimes(2);
    expect(setMemberNationalAccess).not.toHaveBeenCalled();
  });

  it('shows an all-or-nothing server rejection row by row and keeps the pasted text', async () => {
    vi.mocked(upsertResidentRoster).mockResolvedValue({ applied: false, inserted: 0, updated: 0, rejected: [{ row: 2, reason: 'INVALID_EMAIL' }] });
    render(<AcademyMembersTab />);
    await waitFor(() => rowOf('dana@example.com'));
    fireEvent.change(screen.getByLabelText(/קובץ הרשימה/), { target: { value: 'Dana,dana@example.com,yes\nX,x@example.com,no' } });
    fireEvent.click(screen.getByRole('button', { name: /ייבוא הרשימה/ }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/לא יובא/);
    expect(alert).toHaveTextContent(/שורה 2/);
    expect(screen.getByLabelText(/קובץ הרשימה/)).toHaveValue('Dana,dana@example.com,yes\nX,x@example.com,no');
    expect(fetchMembers).toHaveBeenCalledTimes(1);
  });
});
