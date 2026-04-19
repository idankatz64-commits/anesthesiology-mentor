# Phase 0b — Supabase Security Snapshot (2026-04-19)

> Raw data from `mcp__supabase__get_advisors` + `pg_policies` + `pg_tables`.
> Used as input for security-reviewer agent. No interpretation here.

## Advisor lints (10 total)

| Level | Lint | Object | Detail |
|---|---|---|---|
| **ERROR** | `rls_disabled_in_public` | table `public.ideas` | RLS not enabled on PostgREST-exposed table |
| WARN | `rls_policy_always_true` | `chapter_content` | policy `allow all writes chapter_content` — `USING (true) WITH CHECK (true)` for ALL cmd |
| WARN | `rls_policy_always_true` | `chapter_gaps` | policy `allow all writes chapter_gaps` — same pattern |
| WARN | `public_bucket_allows_listing` | bucket `question-images` | broad SELECT policy on storage.objects allows listing all files |
| WARN | `auth_leaked_password_protection` | Auth | HaveIBeenPwned check disabled |
| WARN | `function_search_path_mutable` | `handle_new_user` | search_path not set |
| WARN | `function_search_path_mutable` | `get_question_ids_by_confidence` | search_path not set |
| WARN | `function_search_path_mutable` | `sync_chapter_topic_num` | search_path not set |
| WARN | `function_search_path_mutable` | `log_question_changes` | search_path not set |
| WARN | `function_search_path_mutable` | `is_admin` | search_path not set |

## RLS status per public table (22 tables)

All enabled except **`ideas`** (RLS disabled — ERROR-level lint).

| Table | RLS | Table | RLS |
|---|---|---|---|
| admin_users | true | profiles | true |
| answer_history | true | question_audit_log | true |
| categories | true | question_edit_log | true |
| chapter_content | true | questions | true |
| chapter_gaps | true | resource_links | true |
| community_notes | true | saved_sessions | true |
| formulas | true | spaced_repetition | true |
| **ideas** | **false** | topic_summaries | true |
| user_answers | true | user_favorites | true |
| user_notes | true | user_ratings | true |
| user_tags | true | user_weekly_plans | true |

## Inconsistent admin-check patterns (architectural concern)

Three different mechanisms used across policies for the same concept ("is this user an admin?"):

### Pattern A — `is_admin(auth.uid())` function
- `admin_users` (ALL): `is_admin(auth.uid())`
- `formulas` (ALL): `is_admin(auth.uid())`
- `resource_links` (INSERT/UPDATE/DELETE): `is_admin(auth.uid())`
- `topic_summaries` (INSERT/UPDATE/DELETE): `is_admin(auth.uid())`

### Pattern B — inline EXISTS on `admin_users.id`
- `categories` (ALL): `EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid() AND role IN ('admin','editor'))`
- `questions` (ALL): same pattern
- `questions` (UPDATE): `is_editor(auth.uid())`

### Pattern C — `profiles.is_admin` boolean (different table)
- `user_answers` (SELECT "Admins can read all answers"): `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)`
- `question_edit_log` (SELECT "Admins can read all logs"): same profiles.is_admin pattern

### Pattern D — email lookup via auth.users
- `question_audit_log` (SELECT): `EXISTS (SELECT 1 FROM admin_users WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()))`

**Risk:** if admin status diverges between `admin_users` table and `profiles.is_admin` flag, admins/editors could have inconsistent privileges across tables.

## Key RLS policies — summary by category

### Per-user ownership (healthy pattern)
`answer_history`, `saved_sessions`, `spaced_repetition`, `user_answers`, `user_favorites`, `user_notes`, `user_ratings`, `user_tags`, `user_weekly_plans` — all use `auth.uid() = user_id` on both USING and WITH CHECK. Standard ownership isolation.

### Public read + admin-gated writes
- `categories`, `formulas`, `topic_summaries` — public SELECT, admin-only writes (via various admin-check patterns).
- `questions` — public SELECT, admin-or-editor writes.
- `resource_links` — public SELECT where `is_active = true`, admin writes.
- `community_notes` — public SELECT, authenticated INSERT (own user_id), user DELETE own.

### Wildcard writes (flagged by linter)
- `chapter_content` — `ALL` with `USING (true) WITH CHECK (true)` → **anyone can write**
- `chapter_gaps` — same

### Role targeting
- Most policies use `{public}` role (covers both anon and authenticated).
- `answer_history` and `questions` UPDATE explicitly target `{authenticated}`.

## Notable absences from policy query

Tables present in `CLAUDE.md` but missing from pg_policies result (means no RLS policies defined OR table doesn't exist in schema as expected):
- `calculator_formulas`
- `anki_decks`, `anki_cards`
- `study_rooms`, `room_participants`, `room_answers`
- `user_feedback`

Need to verify via `\d` or `list_tables` whether these tables exist and what their policy state is.

## Edge Function inventory (from earlier filesystem check)

| Function | Lines | Purpose |
|---|---|---|
| `admin-manage-users/index.ts` | 101 | Admin/editor role management |
| `ai-summary/index.ts` | 160 | Claude-powered daily/weekly summary |
| `daily-csv-export/index.ts` | 59 | CSV export → email |
| `matot-report/index.ts` | 93 | Claude explanation per question |
| `sync-questions/index.ts` | 211 | Google Sheets → Supabase sync |
| `weekly-report/index.ts` | 412 | Weekly 7-day digest email |
| **Total** | **1,036** | |
