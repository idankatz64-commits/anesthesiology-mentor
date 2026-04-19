# Phase 0a — Baseline (2026-04-19)

> Numbers only. No interpretation. Phase 0b will turn numbers into findings.

## Build

- `npm ci`: **pass** — 1m 06s — 662 packages installed
- `npm run build`: **pass** — 33.56s — bundle sizes:
  - JS: 2,866.30 KB (gzip 846.98 KB) — 1 chunk-size warning (> 500 KB)
  - CSS: 126.07 KB (gzip 20.77 KB)
  - HTML: 1.49 KB (gzip 0.60 KB)
  - PNG (jigsaw): 37.67 KB
  - 5,157 modules transformed

## Type checking

- `tsc --noEmit`: **0 errors** (exit 0; `strict: false` in tsconfig)

## Lint

- `eslint src/`: **111 errors, 13 warnings** (124 total problems across 38 files, 3 auto-fixable)

## Security audit

- `npm audit --production`: **0 critical / 8 high / 3 moderate / 0 low** (11 total)
- `npm audit` (full, incl. devDeps): 0 critical / 10 high / 7 moderate / 3 low (20 total)

## Dependencies

- `depcheck`: **3 unused deps, 3 unused devDeps, 0 missing deps**
  - Unused deps: `@hookform/resolvers`, `@lovable.dev/cloud-auth-js`, `zod`
  - Unused devDeps: `@tailwindcss/typography`, `autoprefixer`, `postcss`

## Raw logs

All output in `.planning/phase-0/*.log`:
- `npm-ci.log`, `build.log`, `tsc.log`, `eslint.log`, `audit.log`, `audit.json`, `depcheck.log`
