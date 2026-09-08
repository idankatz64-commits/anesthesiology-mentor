# FSRS-CORS-RESULT — fsrs-shadow QA origin mismatch

**Date:** 2026-09-08 · **Scope owner:** bounded author (fsrs-shadow CORS only)
**Files owned:** `supabase/functions/fsrs-shadow/*` · **Report dir assumption:** `docs/`
(no `AUTHOR-RESULT.md` existed at write time; `docs/` is where the LAUNCH-MILESTONE reviews live)

## Issue (as reported by QA, independently reproduced in source)

Unauthenticated `OPTIONS https://idoaqzzvmesjlxnojlpl.supabase.co/functions/v1/fsrs-shadow`
with `Origin: http://127.0.0.1:5178` returns **HTTP 200** but
`Access-Control-Allow-Origin: https://anesthesiology-mentor.vercel.app`, so the browser
blocks the response and QA cannot exercise the function from the approved local origin.

## Root cause

`allowedOrigins()` listed `http://localhost:5178` but not `http://127.0.0.1:5178`.
CORS origins are compared as **exact strings** — no DNS resolution, no aliasing — so
`localhost` and `127.0.0.1` are two different origins. An origin that misses the
allowlist is not rejected; the handler falls back to echoing the production origin,
which is exactly the observed 200 + wrong header. Nothing about the 200 status is
itself a bug: `OPTIONS` is answered before the auth/owner gates, by design.

## Delta

| File | Change |
|---|---|
| `supabase/functions/fsrs-shadow/index.ts` | `-13 / +1`: CORS block moved out, replaced by `import { cors } from "./cors.ts";` |
| `supabase/functions/fsrs-shadow/cors.ts` | **new** — the moved allowlist + `cors()`, with `"http://127.0.0.1:5178"` added |
| `supabase/functions/fsrs-shadow/cors.test.ts` | **new** — regression check (Deno test, matches `_shared/fsrsProcessor.test.ts` style) |
| `docs/fsrs-cors/index.ts.pre-cors-fix.snapshot` | pre-edit snapshot of `index.ts` (sha256 `173e5271…4aa9c683`, verified identical at copy time) |

The only behavioural change is the one allowlist entry. `cors()` logic, header set,
env-var extension (`YSNP_ALLOWED_ORIGINS`), and the production fallback are byte-identical
to the snapshot.

**Why a second file:** `index.ts` calls `Deno.serve()` at import time, so a test cannot
import it without starting a server. Moving the allowlist into a sibling module is the
smallest change that makes the regression check possible, and mirrors how this codebase
already keeps testable logic in `_shared/fsrsAdapter.ts` / `fsrsProcessor.ts`.

## Verification (local, code-only)

```
$ deno test --allow-env supabase/functions/fsrs-shadow/cors.test.ts
ok | 2 passed | 0 failed
$ deno check supabase/functions/fsrs-shadow/index.ts
Check supabase/functions/fsrs-shadow/index.ts   (exit 0)
```

RED/GREEN proof — with the new allowlist line temporarily removed (pre-fix state):

```
cors echoes the approved QA loopback origins ... FAILED
error: Error: QA origin 127.0.0.1:5178 not echoed back
FAILED | 1 passed | 1 failed
```

`cors.ts` was restored from the pre-experiment copy and re-verified by sha256.

The test asserts both directions: the three allowed origins are echoed back, and
`https://attacker.example`, `http://127.0.0.1:5179`, `http://127.0.0.1` (no port) and a
missing `Origin` all still receive the production origin — never `*`, never the caller's.

## Not done (deliberate)

- **Not deployed.** Production `fsrs-shadow` still runs the old allowlist; QA will keep
  seeing the mismatch until the main task deploys. Deployment is not mine to run.
- No wildcard, no regex/prefix match for loopback, no relaxation of the `NOT_AUTHENTICATED`
  (401) or `NOT_OWNER` (403) gates, no change to any other function, no commit/push.
- Broad suite not rerun; `index.ts` is outside the vitest `include` glob (`src/**`) anyway.

## Worth a follow-up (not mine to decide)

1. `Vary: Origin` is absent. Responses differ per origin, so a shared cache in front of the
   function could serve one origin's `Access-Control-Allow-Origin` to another — the same
   confusing symptom, from a different cause. One header line, if wanted.
2. Every other edge function hardcodes a single origin; only `fsrs-shadow` has an allowlist.
   If more functions need QA origins, promote this module to `_shared/` rather than copy it.
