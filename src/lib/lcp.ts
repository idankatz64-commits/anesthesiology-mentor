import { onLCP, type LCPMetric } from 'web-vitals';

/**
 * Thin LCP reporter for Phase 1 Stats V2 perf work.
 * - Dev: logs every LCP reading to console for quick iteration.
 * - Test (Playwright): pushes `{ value, rating }` onto `window.__LCP__` so
 *   E2E specs can assert on the number without flake-prone timings.
 * - Production: never invoked (gated by caller in src/main.tsx).
 */

declare global {
  interface Window {
    __LCP__?: { value: number; rating: LCPMetric['rating'] };
  }
}

export function reportLCP(): void {
  onLCP(metric => {
    const payload = { value: metric.value, rating: metric.rating };
    if (typeof window !== 'undefined') {
      window.__LCP__ = payload;
    }
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[LCP]', metric.value.toFixed(0), 'ms', `(${metric.rating})`);
    }
  });
}
