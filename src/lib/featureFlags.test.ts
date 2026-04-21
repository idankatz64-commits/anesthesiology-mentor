import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFeatureFlag } from '@/lib/featureFlags';

// ──────────────────────────────────────────────────────────────────────────
// W0.4 — RED tests for `useFeatureFlag`
// These tests MUST fail until W0.5 implements the hook.
//
// Contract (from .planning/phase-1/RESEARCH.md §Feature Flag Infrastructure
//           Option 1):
//   - Storage key: `feature:<flagName>`
//   - Default enabled=false when key absent or localStorage unavailable
//   - setEnabled(v) persists String(v) to localStorage AND updates state
//   - cross-tab sync via window 'storage' event
// ──────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'feature:statsV2Enabled';

describe('useFeatureFlag', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('(a) defaults enabled=false when localStorage is empty', () => {
    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(false);
  });

  it('(a2) reads enabled=true when localStorage already has "true"', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(true);
  });

  it('(b) setEnabled(true) writes to localStorage and updates state', () => {
    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(false);

    act(() => {
      result.current.setEnabled(true);
    });

    expect(result.current.enabled).toBe(true);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('(b2) setEnabled(false) persists "false" and flips state back', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(true);

    act(() => {
      result.current.setEnabled(false);
    });

    expect(result.current.enabled).toBe(false);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('(c) storage event from another tab updates state', () => {
    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(false);

    act(() => {
      // Real browsers fire StorageEvent only in OTHER tabs, never in the tab
      // that wrote. jsdom follows the same rule, so we dispatch manually.
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: STORAGE_KEY,
          newValue: 'true',
          oldValue: null,
          storageArea: window.localStorage,
        })
      );
    });

    expect(result.current.enabled).toBe(true);
  });

  it('(d) gracefully falls back to false when localStorage access throws', () => {
    const getItemSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('SecurityError: localStorage is disabled');
      });

    const { result } = renderHook(() => useFeatureFlag('statsV2Enabled'));
    expect(result.current.enabled).toBe(false);
    expect(getItemSpy).toHaveBeenCalled();
  });
});
