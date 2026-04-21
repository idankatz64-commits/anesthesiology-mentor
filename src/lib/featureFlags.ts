import { useCallback, useEffect, useState } from 'react';

/**
 * Feature flag infrastructure for Phase 1 (Stats V2).
 *
 * Backend: localStorage (per RESEARCH.md §Feature Flag Infrastructure Option 1).
 * Default OFF for every flag when localStorage is empty or inaccessible
 * (e.g. Safari private mode, SSR, or a browser that throws on read).
 *
 * Design note (forward compatibility):
 *   The exported hook signature `(name: FlagName) => { enabled, setEnabled }`
 *   is identical regardless of backend. When Phase 3+ migrates to a
 *   `user_feature_flags` table, every caller stays identical — only this
 *   file's implementation changes.
 */

/** String-literal union of valid feature flag names. Extend as needed. */
export type FlagName = 'statsV2Enabled';

export interface UseFeatureFlagResult {
  /** Current flag state; `false` by default. */
  enabled: boolean;
  /** Persist and broadcast a new flag state. */
  setEnabled: (value: boolean) => void;
}

function storageKeyFor(name: FlagName): string {
  return `feature:${name}`;
}

function readFlagFromStorage(key: string): boolean {
  // Guard against SSR, Safari private mode, and browsers that throw on
  // `localStorage` access (e.g. strict cookie policies).
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}

function writeFlagToStorage(key: string, value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Swallow: unwritable storage should not crash the UI. The in-memory
    // state still updates, so the toggle appears responsive to the user.
  }
}

/**
 * Hook that returns the current value of a feature flag plus a setter.
 *
 * - `enabled` defaults to `false` when the key is absent or storage is unavailable.
 * - `setEnabled(v)` writes `String(v)` to `localStorage` and updates state synchronously.
 * - Cross-tab sync: other tabs' writes fire a `StorageEvent` which this hook listens
 *   for, keeping every open tab's state in sync without a reload.
 */
export function useFeatureFlag(name: FlagName): UseFeatureFlagResult {
  const storageKey = storageKeyFor(name);

  const [enabled, setEnabledState] = useState<boolean>(() =>
    readFlagFromStorage(storageKey)
  );

  useEffect(() => {
    const handler = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setEnabledState(event.newValue === 'true');
      }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, [storageKey]);

  const setEnabled = useCallback(
    (value: boolean) => {
      writeFlagToStorage(storageKey, value);
      setEnabledState(value);
    },
    [storageKey]
  );

  return { enabled, setEnabled };
}
