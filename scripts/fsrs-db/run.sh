#!/usr/bin/env bash
# Local-only FSRS shadow harness. It creates exactly one dedicated database and
# refuses to replace an existing one. Set FSRS_USE_PREBUILT=1 only for the
# already-built synthetic ysnp_fsrs_test database; no other database is accepted.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=${FSRS_DB:-ysnp_fsrs_test}
case "$DB" in ysnp_fsrs_test|ysnp_fsrs_test_v2|ysnp_fsrs_test_v3|ysnp_fsrs_test_v4|ysnp_fsrs_fix_20260908|ysnp_fsrs_fix_20260908_v2|ysnp_fsrs_fix_20260908_v3) ;; *) echo "REFUSING: unsupported database name"; exit 1;; esac
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
ACADEMY=(supabase/migrations/20260812000001_academy_module.sql supabase/migrations/20260812000002_academy_hardening.sql
         supabase/migrations/20260812000003_academy_submit_completeness.sql supabase/migrations/20260812000004_academy_restrict_quiz_delete.sql
         supabase/migrations/20260813000001_academy_visibility_hardening.sql supabase/migrations/20260814000001_academy_residency_year.sql)

if [ "${FSRS_USE_PREBUILT:-0}" != 1 ]; then
  EXISTS=$("${PSQL[@]}" -d postgres -Atc "select count(*) from pg_database where datname='$DB'")
  [ "$EXISTS" = 0 ] || { echo "REFUSING: $DB already exists; no database was dropped or reset"; exit 1; }
  createdb -h "$HOST" -p "$PORT" "$DB"
  "${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/fixtures.sql
  for m in "${ACADEMY[@]}"; do "${PSQL[@]}" -d "$DB" -f "$m"; done
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/post-academy.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000002_resident_entitlement.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000001_feedback_editorial.sql
  "${PSQL[@]}" -d "$DB" -f scripts/feedback-db/owner.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000002_learning_curriculum.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000003_fsrs_shadow.sql
else
  MARKERS=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from pg_class where oid in ('public.fsrs_review_events'::regclass,'public.fsrs_processing_queue'::regclass)")
  [ "$MARKERS" = 2 ] || { echo "REFUSING: prebuilt database lacks the exact FSRS markers"; exit 1; }
fi

"${PSQL[@]}" -d "$DB" -f scripts/fsrs-db/tests.sql
FSRS_DB="$DB" scripts/fsrs-db/concurrency.sh
echo "FSRS SHADOW TESTS PASSED"
