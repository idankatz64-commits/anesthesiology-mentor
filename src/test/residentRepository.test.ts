import { beforeEach, describe, expect, it, vi } from 'vitest';
import { attemptErrorMessage } from '@/lib/attemptsRepository';
import {
  completeMyOnboarding, fetchMyResident, parseRosterCsv, residentErrorMessage, setMemberNationalAccess, upsertResidentRoster,
} from '@/lib/residentRepository';

const db = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: db.rpc } }));

const memberRow = {
  id: 'm1', email: 'resident@example.com', full_name: 'Resident', access_level: 'academy', status: 'active', residency_year: 3,
  exam_this_year: true, exam_date: '2027-06-15', national_access: false, onboarding_completed_at: null, linked_at: '2026-09-07T10:00:00Z',
};

describe('resident repository', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads the caller’s resident state and maps the member row', async () => {
    db.rpc.mockResolvedValue({ data: { linked: true, reason: null, member: memberRow }, error: null });
    await expect(fetchMyResident()).resolves.toEqual({
      linked: true, reason: null,
      member: { id: 'm1', email: 'resident@example.com', fullName: 'Resident', accessLevel: 'academy', status: 'active', residencyYear: 3,
        examThisYear: true, examDate: '2027-06-15', nationalAccess: false, onboardingCompletedAt: null, linkedAt: '2026-09-07T10:00:00Z' },
    });
    expect(db.rpc).toHaveBeenCalledWith('resident_me', {});
  });

  it('surfaces why an unlinked user is unlinked', async () => {
    db.rpc.mockResolvedValue({ data: { linked: false, reason: 'EMAIL_NOT_VERIFIED', member: null }, error: null });
    await expect(fetchMyResident()).resolves.toEqual({ linked: false, reason: 'EMAIL_NOT_VERIFIED', member: null });
    expect(residentErrorMessage(new Error('EMAIL_NOT_VERIFIED'))).toMatch(/אימות/);
    expect(residentErrorMessage(new Error('NOT_ON_ROSTER'))).toMatch(/רשימ/);
  });

  it('sends only the three self-onboarding fields, never anything that looks like an entitlement', async () => {
    db.rpc.mockResolvedValue({ data: { linked: true, reason: null, member: { ...memberRow, residency_year: 4 } }, error: null });
    const result = await completeMyOnboarding({ residencyYear: 4, examDate: null, examThisYear: false });
    expect(result.member?.residencyYear).toBe(4);
    expect(db.rpc).toHaveBeenCalledWith('complete_my_onboarding', { _residency_year: 4, _exam_date: null, _exam_this_year: false });
    const sent = db.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(sent)).toEqual(['_residency_year', '_exam_date', '_exam_this_year']);
  });

  it('rejects an out-of-range residency year before touching the server', async () => {
    await expect(completeMyOnboarding({ residencyYear: 9, examDate: null, examThisYear: false })).rejects.toThrow('INVALID_INPUT');
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it('maps server error codes to typed errors and unknown failures to RESIDENT_UNAVAILABLE', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_MEMBER' } });
    await expect(completeMyOnboarding({ residencyYear: 1, examDate: null, examThisYear: true })).rejects.toThrow('NOT_MEMBER');
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ADMIN' } });
    await expect(setMemberNationalAccess('m1', true)).rejects.toThrow('NOT_ADMIN');
    db.rpc.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(fetchMyResident()).rejects.toThrow('RESIDENT_UNAVAILABLE');
    expect(residentErrorMessage(new Error('NOT_ADMIN'))).toMatch(/מנהל/);
  });

  it('toggles national access through the admin RPC and returns actor + time', async () => {
    db.rpc.mockResolvedValue({ data: { member_id: 'm1', national_access: true, national_access_set_at: '2026-09-07T10:00:00Z', national_access_set_by: 'admin-1' }, error: null });
    await expect(setMemberNationalAccess('m1', true)).resolves.toEqual({ memberId: 'm1', nationalAccess: true, setAt: '2026-09-07T10:00:00Z', setBy: 'admin-1' });
    expect(db.rpc).toHaveBeenCalledWith('set_member_national_access', { _member_id: 'm1', _enabled: true });
  });

  it('parses a roster CSV: header optional, e-mail normalized, flag parsed, duplicates and bad rows reported', () => {
    const parsed = parseRosterCsv('name,email,exam_this_year\nDana, Dana@Example.com ,yes\nNoam,noam@example.com,\nDup,DANA@example.com,no\nBad,not-an-email,no\n\n');
    expect(parsed.rows).toEqual([
      { name: 'Dana', email: 'dana@example.com', residencyYear: null, examThisYear: true },
      { name: 'Noam', email: 'noam@example.com', residencyYear: null, examThisYear: null },
    ]);
    expect(parsed.rejected).toEqual([{ line: 4, reason: 'DUPLICATE_IN_FILE' }, { line: 5, reason: 'INVALID_EMAIL' }]);
    expect(parseRosterCsv('a@example.com\nb@example.com').rows).toEqual([
      { name: '', email: 'a@example.com', residencyYear: null, examThisYear: null },
      { name: '', email: 'b@example.com', residencyYear: null, examThisYear: null },
    ]);
  });

  it('keeps an unstated exam intent out of the payload, so a partial re-import cannot erase it', async () => {
    // The real legacy path: a file of bare e-mails, or the old three-column
    // format with the flag left blank. Neither states an intention, and the
    // server preserves what it has only when the key is absent altogether —
    // `exam_this_year: false` is a real answer and overwrites a stored `true`.
    const legacy = parseRosterCsv('dana@example.com\nNoam,noam@example.com,\nRoni,roni@example.com,no');
    expect(legacy.rows).toEqual([
      { name: '', email: 'dana@example.com', residencyYear: null, examThisYear: null },
      { name: 'Noam', email: 'noam@example.com', residencyYear: null, examThisYear: null },
      { name: 'Roni', email: 'roni@example.com', residencyYear: null, examThisYear: false },
    ]);
    db.rpc.mockResolvedValueOnce({ data: { applied: true, inserted: 0, updated: 3 }, error: null });
    await upsertResidentRoster(legacy.rows);
    const sent = db.rpc.mock.calls.at(-1)![1]._rows;
    expect(sent).toEqual([
      { name: '', email: 'dana@example.com' },
      { name: 'Noam', email: 'noam@example.com' },
      { name: 'Roni', email: 'roni@example.com', exam_this_year: false },
    ]);
    // toEqual ignores undefined-valued keys; the point of the fix is that the
    // keys are absent, and that no residency_year rides along to make the
    // omitted flag an INVALID_EXAM_FLAG rejection on the server.
    expect(Object.keys(sent[1])).toEqual(['name', 'email']);
    expect(Object.keys(sent[2])).toEqual(['name', 'email', 'exam_this_year']);
  });

  it('maps the exact four Hebrew sheet headers by name and rejects malformed year/flag rows', () => {
    const header = 'שם מלא,אימייל,שלב בהתמחות ( מספיק שנה),מתכננים לגשת לשלב א׳ השנה?';
    expect(parseRosterCsv(`${header}\nדנה כהן,Dana+ysnp@gmail.com,ראשונה,כן\nנועם לוי,noam@example.com,שניה,לא\nרוני לוי,roni@example.com,שלישית,כן`).rows).toEqual([
      { name: 'דנה כהן', email: 'dana+ysnp@gmail.com', residencyYear: 1, examThisYear: true },
      { name: 'נועם לוי', email: 'noam@example.com', residencyYear: 2, examThisYear: false },
      { name: 'רוני לוי', email: 'roni@example.com', residencyYear: 3, examThisYear: true },
    ]);
    expect(parseRosterCsv(`${header}\nדנה כהן,Dana+ysnp@gmail.com,שנייה,כן\nנועם לוי,noam@example.com,7,לא`).rows).toEqual([
      { name: 'דנה כהן', email: 'dana+ysnp@gmail.com', residencyYear: 2, examThisYear: true },
      { name: 'נועם לוי', email: 'noam@example.com', residencyYear: 7, examThisYear: false },
    ]);
    expect(parseRosterCsv(`${header}\nתקין,good@example.com,2,כן\nשנה,bad-year@example.com,8,לא\nדגל,bad-flag@example.com,3,אולי\nחסר,missing-flag@example.com,שלישית,`)).toEqual({
      rows: [{ name: 'תקין', email: 'good@example.com', residencyYear: 2, examThisYear: true }],
      rejected: [
        { line: 3, reason: 'INVALID_RESIDENCY_YEAR' },
        { line: 4, reason: 'INVALID_EXAM_FLAG' },
        { line: 5, reason: 'INVALID_EXAM_FLAG' },
      ],
    });
    expect(parseRosterCsv('שם מלא,אימייל,מתכננים לגשת לשלב א׳ השנה?\nדנה,dana@example.com,כן')).toEqual({
      rows: [], rejected: [{ line: 1, reason: 'INVALID_HEADER' }],
    });
  });

  it('sends roster rows in the server shape and maps an all-or-nothing rejection', async () => {
    db.rpc.mockResolvedValueOnce({ data: { applied: true, inserted: 1, updated: 1 }, error: null });
    await expect(upsertResidentRoster([{ name: 'Dana', email: 'dana@example.com', residencyYear: 3, examThisYear: true }])).resolves.toEqual({ applied: true, inserted: 1, updated: 1, rejected: [] });
    expect(db.rpc).toHaveBeenCalledWith('upsert_resident_roster', { _rows: [{ name: 'Dana', email: 'dana@example.com', residency_year: 3, exam_this_year: true }] });
    db.rpc.mockResolvedValueOnce({ data: { applied: false, rejected: [{ row: 2, reason: 'INVALID_EMAIL' }] }, error: null });
    await expect(upsertResidentRoster([{ name: 'x', email: 'x@example.com', residencyYear: null, examThisYear: false }, { name: 'y', email: 'bad', residencyYear: null, examThisYear: false }]))
      .resolves.toEqual({ applied: false, inserted: 0, updated: 0, rejected: [{ row: 2, reason: 'INVALID_EMAIL' }] });
    await expect(upsertResidentRoster([])).rejects.toThrow('INVALID_INPUT');
  });

  it('gives the durable-attempt layer a Hebrew message for NOT_ENTITLED', () => {
    expect(attemptErrorMessage(new Error('NOT_ENTITLED'))).toMatch(/ארצי/);
  });
});
