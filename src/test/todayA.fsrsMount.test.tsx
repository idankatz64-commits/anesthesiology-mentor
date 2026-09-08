import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

// Focused mount validation: the FSRS comparison tab is reachable from the admin page and
// receives the current AppContext identity (string | null) — C's component itself is not under test.
vi.mock('@/hooks/useAdminGuard', () => ({ useAdminGuard: () => ({ loading: false, isAdmin: true }) }));
const identity = vi.hoisted(() => ({ userId: 'owner-1' as string | null }));
vi.mock('@/contexts/AppContext', () => ({ AppProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>, useApp: () => ({ userId: identity.userId }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn(), Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signOut: vi.fn() }, rpc: vi.fn(), from: vi.fn() } }));
const fsrsProps = vi.hoisted(() => vi.fn());
vi.mock('@/components/admin/FsrsShadowTab', () => ({ default: (props: { userId: string | null }) => { fsrsProps(props); return <div data-testid="fsrs">fsrs:{String(props.userId)}</div>; } }));
vi.mock('@/components/admin/UserManagementTab', () => ({ default: () => <div>users</div> }));
for (const name of ['ImportQuestionsTab', 'FormulaManagementTab', 'QuestionEditorTab', 'ResourceLinksTab', 'SummariesManagementTab', 'EditorActivityTab', 'AcademyMembersTab', 'AcademyQuizzesTab', 'AcademyDashboardTab', 'ManagerDashboardTab', 'CurriculumConfigTab', 'ManagementAggregateTab', 'FeedbackQueueTab']) {
  vi.doMock(`@/components/admin/${name}`, () => ({ default: () => <div>{name}</div> }));
}

import AdminDashboard from '@/pages/AdminDashboard';

beforeEach(() => { fsrsProps.mockReset(); identity.userId = 'owner-1'; });
afterEach(cleanup);

describe('AdminDashboard — FSRS comparison mount', () => {
  it('exposes the fsrs-comparison tab and passes the current identity as userId', () => {
    render(<AdminDashboard />);
    expect(screen.queryByTestId('fsrs')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /השוואת FSRS/ }));
    expect(screen.getByTestId('fsrs').textContent).toBe('fsrs:owner-1');
    expect(fsrsProps).toHaveBeenLastCalledWith({ userId: 'owner-1' });
  });

  it('passes null when there is no identity, so the component shows its own sign-in state', () => {
    identity.userId = null;
    render(<AdminDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /השוואת FSRS/ }));
    expect(fsrsProps).toHaveBeenLastCalledWith({ userId: null });
  });
});
