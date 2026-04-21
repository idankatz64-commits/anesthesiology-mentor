import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import DebugFlagsTab from './DebugFlagsTab';

// ──────────────────────────────────────────────────────────────────────────
// W0.10 — Smoke test for DebugFlagsTab
// Verifies the Stats V2 Switch is wired through `useFeatureFlag` into
// localStorage at key `feature:statsV2Enabled`.
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'feature:statsV2Enabled';

describe('DebugFlagsTab', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the Stats V2 toggle in the off state by default', () => {
    render(<DebugFlagsTab />);

    const toggle = screen.getByRole('switch', { name: /toggle stats v2/i });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });

  it('clicking the toggle writes "true" to localStorage and flips to on', async () => {
    const user = userEvent.setup();
    render(<DebugFlagsTab />);

    const toggle = screen.getByRole('switch', { name: /toggle stats v2/i });
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();

    await user.click(toggle);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
    expect(toggle).toHaveAttribute('data-state', 'checked');
  });

  it('clicking again writes "false" and flips back to off', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(STORAGE_KEY, 'true');
    render(<DebugFlagsTab />);

    const toggle = screen.getByRole('switch', { name: /toggle stats v2/i });
    expect(toggle).toHaveAttribute('data-state', 'checked');

    await user.click(toggle);

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
    expect(toggle).toHaveAttribute('data-state', 'unchecked');
  });
});
