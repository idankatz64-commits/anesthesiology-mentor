import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useApp } from '@/contexts/AppContext';
import MobileBottomNav from '@/components/MobileBottomNav';

vi.mock('@/contexts/AppContext', () => ({ useApp: vi.fn() }));
vi.mock('@/lib/featureFlags', () => ({ durableAttemptsEnabled: () => true }));

describe('MobileBottomNav durable archive entry', () => {
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it('keeps the five main actions and opens the archive from the mobile nav', () => {
    const navigate = vi.fn();
    vi.mocked(useApp).mockReturnValue({
      currentView: 'home', navigate, academyMember: true, academyOnly: false,
    } as unknown as ReturnType<typeof useApp>);

    render(<MobileBottomNav />);

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'ראשי', 'תרגול', 'בחינה', 'ארכיון', 'סטטיסטיקה', 'אקדמיה',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'ארכיון' }));
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('archive');
  });
});
