import { describe, it, expect } from 'vitest';
import {
  tryAcquireConfidenceLock,
  releaseConfidenceLock,
  type ConfidenceLockMap,
} from '@/lib/confidenceLock';

// Bug A: two rapid confidence clicks (or keyboard presses) can fire two
// `updateSpacedRepetition` calls before React re-renders and hides the
// buttons. The result is a duplicate user_answers row and a corrupted
// SM-2 state (the second call overwrites the first with stale data).
//
// This module provides a *synchronous* keyed lock — useRef-backed — that
// blocks the second submission within the same event-loop tick. It MUST
// mutate in place (not return a new map): immutable semantics would only
// become visible on the next render, which is exactly the window the bug
// exploits.
describe('confidenceLock', () => {
  describe('tryAcquireConfidenceLock', () => {
    it('returns true on the first call for a given serialNumber', () => {
      const lockMap: ConfidenceLockMap = {};
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(true);
    });

    it('returns false on the second call (double-submit blocked)', () => {
      const lockMap: ConfidenceLockMap = {};
      tryAcquireConfidenceLock('Q-001', lockMap);
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(false);
    });

    it('locks per-serialNumber independently', () => {
      const lockMap: ConfidenceLockMap = {};
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(true);
      expect(tryAcquireConfidenceLock('Q-002', lockMap)).toBe(true);
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(false);
      expect(tryAcquireConfidenceLock('Q-002', lockMap)).toBe(false);
    });
  });

  describe('releaseConfidenceLock', () => {
    it('allows re-acquisition after release (e.g. on SRS write failure → retry)', () => {
      const lockMap: ConfidenceLockMap = {};
      tryAcquireConfidenceLock('Q-001', lockMap);
      releaseConfidenceLock('Q-001', lockMap);
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(true);
    });

    it('only releases the targeted serialNumber, not siblings', () => {
      const lockMap: ConfidenceLockMap = {};
      tryAcquireConfidenceLock('Q-001', lockMap);
      tryAcquireConfidenceLock('Q-002', lockMap);
      releaseConfidenceLock('Q-001', lockMap);
      expect(tryAcquireConfidenceLock('Q-001', lockMap)).toBe(true);
      expect(tryAcquireConfidenceLock('Q-002', lockMap)).toBe(false);
    });
  });
});
