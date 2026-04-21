import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Phase 1 (Stats V2) E2E tests.
 *
 * Scope:
 * - Chromium-only (matches primary dev target — Chrome DevTools profiling
 *   and Vercel preview verification on MacBook).
 * - Two projects: mobile (iPhone 13) and desktop (1440px).
 * - testDir is scoped to `e2e/` so Vitest unit tests under `src/` are never
 *   accidentally loaded by Playwright (prevents the
 *   `@vitest/expect` collision observed in W0.1 smoke run).
 */

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: '.',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL,
    trace: 'on-first-retry',
    locale: 'he-IL',
  },
  projects: [
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] },
    },
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
});
