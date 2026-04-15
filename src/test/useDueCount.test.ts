import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useDueCount } from '@/components/srs/useDueCount';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          lte: () => Promise.resolve({ count: 42, error: null, data: null }),
        }),
      }),
    }),
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'u1' } } }) },
  },
}));

describe('useDueCount', () => {
  it('returns the count from Supabase', async () => {
    const { result } = renderHook(() => useDueCount());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.count).toBe(42);
  });
});
