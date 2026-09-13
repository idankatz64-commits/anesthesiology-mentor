import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import ApprovalConnectionError from '@/components/ApprovalConnectionError';
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: { signOut: vi.fn() } } }));
afterEach(cleanup);
it('explains the failed check and lets the user restart verification without suggesting a second account', () => {
  const retry = vi.fn();
  render(<ApprovalConnectionError onRetry={retry} />);
  expect(screen.getByRole('alert')).toHaveTextContent('החיבור לאינטרנט');
  expect(screen.queryByText('החשבון ממתין לאישור')).not.toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ניסיון חוזר' }));
  expect(retry).toHaveBeenCalledOnce();
});
