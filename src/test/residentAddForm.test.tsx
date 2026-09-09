import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResidentAddForm from '@/components/admin/ResidentAddForm';
import { upsertResidentRoster } from '@/lib/residentRepository';
vi.mock('@/lib/residentRepository', () => ({ RESIDENCY_YEARS: [1,2,3,4,5,6,7], residentErrorMessage: () => 'שגיאה', upsertResidentRoster: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
describe('structured resident form', () => {
  it('requires all fields and does not infer exam intent', () => {
    render(<ResidentAddForm onSaved={vi.fn()} />);
    fireEvent.submit(screen.getByRole('form'));
    expect(upsertResidentRoster).not.toHaveBeenCalled();
    expect(screen.getByLabelText('ניגש לשלב א׳ השנה')).toHaveValue('');
  });
  it('saves explicit values to the roster and reloads only after success', async () => {
    vi.mocked(upsertResidentRoster).mockResolvedValue({ applied: true } as Awaited<ReturnType<typeof upsertResidentRoster>>);
    const reload = vi.fn().mockResolvedValue(undefined);
    render(<ResidentAddForm onSaved={reload} />);
    fireEvent.change(screen.getByLabelText('שם מלא'), { target: { value: ' מתמחה בדיקה ' } });
    fireEvent.change(screen.getByLabelText('אימייל'), { target: { value: 'QA@example.invalid' } });
    fireEvent.change(screen.getByLabelText('שנת התמחות'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('ניגש לשלב א׳ השנה'), { target: { value: 'no' } });
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(upsertResidentRoster).toHaveBeenCalledWith([{ name: 'מתמחה בדיקה', email: 'qa@example.invalid', residencyYear: 3, examThisYear: false }]);
    expect(screen.getByRole('status')).toHaveTextContent('לא נשלחה הזמנה');
  });
});
