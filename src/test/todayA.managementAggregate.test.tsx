import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

// Finding 5: owner-only management aggregate wired to the real protected RPC.
const rpc = vi.hoisted(() => vi.fn());
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/lib/attemptsRepository', () => ({ rpc: vi.fn() }));
const useApp = vi.hoisted(() => vi.fn());
vi.mock('@/contexts/AppContext', () => ({ useApp }));
const useEditorialOwner = vi.hoisted(() => vi.fn());
vi.mock('@/components/admin/editorialOwner', () => ({ useEditorialOwner }));

import { fetchManagementAggregate, managementAggregateCsv, managementErrorMessage } from '@/lib/learningRepository';
import ManagementAggregateTab from '@/components/admin/ManagementAggregateTab';

const serverPayload = {
  curriculum_version: 'v1', generated_at: '2026-09-07T12:00:00Z',
  residents: [{
    member_id: 'm1', full_name: 'רופא א', residency_year: 2, email: 'leak@example.com',
    overall: { coverage_percent: 60, success_percent: 75, quiz_quota_met: false, seen_count: 12 },
    chapters: [
      { chapter: 12, coverage_percent: 60, success_percent: 75, question_ids: ['q1'], mistakes: 3 },
      { chapter: 13, coverage_percent: null, success_percent: null },
    ],
    raw_evidence: [{ question_id: 'q1', is_correct: true }],
  }],
};

beforeEach(() => { rpc.mockReset(); useApp.mockReturnValue({ userId: 'owner-1' }); });
afterEach(cleanup);

describe('management aggregate — client allowlist', () => {
  it('calls the protected RPC and keeps only identification plus approved coverage/success', async () => {
    rpc.mockResolvedValue({ data: serverPayload, error: null });
    const a = await fetchManagementAggregate();
    expect(rpc).toHaveBeenCalledWith('management_aggregate_read', {});
    expect(a).toEqual({
      curriculumVersion: 'v1', generatedAt: '2026-09-07T12:00:00Z',
      residents: [{ memberId: 'm1', fullName: 'רופא א', residencyYear: 2,
        overall: { coveragePercent: 60, successPercent: 75 },
        chapters: [{ chapter: 12, coveragePercent: 60, successPercent: 75 }, { chapter: 13, coveragePercent: null, successPercent: null }] }],
    });
    const csv = managementAggregateCsv(a);
    expect(csv.split('\n')[0]).toBe('"full_name","residency_year","chapter","coverage_percent","success_percent"');
    expect(csv).toContain('"רופא א","2","overall","60","75"');
    expect(csv).toContain('"רופא א","2","13","",""');
    expect(JSON.stringify(a) + csv).not.toMatch(/quota|question_id|q1|leak@|raw_evidence|mistakes|seen_count/);
  });

  it('maps server authorization errors to the owner-only message', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'NOT_OWNER' } });
    await expect(fetchManagementAggregate()).rejects.toThrow('NOT_OWNER');
    expect(managementErrorMessage(new Error('NOT_OWNER'))).toContain('בעלים');
    expect(managementErrorMessage(new Error('MANAGEMENT_UNAVAILABLE'))).toContain('לא נטען');
  });
});

describe('ManagementAggregateTab', () => {
  it('does not even ask the server for a non-owner admin', async () => {
    useEditorialOwner.mockReturnValue(false);
    render(<ManagementAggregateTab />);
    expect(screen.getByRole('note').textContent).toContain('בעלים');
    await new Promise(r => setTimeout(r, 0));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('renders the owner table from the RPC and surfaces the server refusal without inventing rows', async () => {
    useEditorialOwner.mockReturnValue(true);
    rpc.mockResolvedValueOnce({ data: serverPayload, error: null });
    render(<ManagementAggregateTab />);
    await waitFor(() => expect(screen.getByText('רופא א')).toBeTruthy());
    expect(screen.getByText('60%')).toBeTruthy();
    expect(screen.getByText('1 מתוך 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ייצוא CSV' })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/leak@|q1/);
    cleanup();
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_OWNER' } });
    render(<ManagementAggregateTab />);
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('בעלים'));
    expect(screen.queryByRole('table')).toBeNull();
  });
});
