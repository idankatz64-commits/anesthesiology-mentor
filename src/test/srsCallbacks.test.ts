import { describe, it, expect, vi } from 'vitest';
import { fireAndCatchSrs } from '@/lib/srsCallbacks';

// Bug D: fire-and-forget calls to updateSpacedRepetition silently swallowed
// rejections (UnhandledPromiseRejection in browser). This helper guarantees
// any rejection is funneled to the provided handler so the user sees a toast.
describe('fireAndCatchSrs', () => {
  it('does not invoke onError when the promise resolves', async () => {
    const onError = vi.fn();
    fireAndCatchSrs(Promise.resolve('ok'), onError);
    // Flush microtasks so the underlying .catch() can settle either way.
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });

  it('invokes onError with the rejection reason when the promise rejects', async () => {
    const onError = vi.fn();
    const reason = new Error('SRS upsert failed');
    fireAndCatchSrs(Promise.reject(reason), onError);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(reason);
  });

  it('treats a synchronous void return (callback returning undefined) as resolved', async () => {
    const onError = vi.fn();
    fireAndCatchSrs(undefined, onError);
    await Promise.resolve();
    await Promise.resolve();
    expect(onError).not.toHaveBeenCalled();
  });

  it('returns void synchronously (caller must not await it)', () => {
    const onError = vi.fn();
    const ret = fireAndCatchSrs(Promise.resolve(), onError);
    expect(ret).toBeUndefined();
  });
});
