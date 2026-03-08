

## Fix: Filter auth events in AppContext.tsx

**File:** `src/contexts/AppContext.tsx`, lines 270-272

**Change:** Replace the `onAuthStateChange` callback to only hydrate on `INITIAL_SESSION`, `SIGNED_IN`, or `SIGNED_OUT` — ignoring `TOKEN_REFRESHED` which causes stale DB data to overwrite optimistic local state.

```
// Before (line 270-272):
const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
  hydrateUser(session?.user?.id ?? null);
});

// After:
const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
    hydrateUser(session?.user?.id ?? null);
  }
});
```

Single file, minimal change.

