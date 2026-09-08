#!/usr/bin/env bash
# Regression harness for migration 20260908000004 — the integrity fixes for
# SECURITY-REVIEW.md F-2 (attempt_confirm replay leak) and F-3 (partial roster
# re-import clobber). Runs against a throwaway database on the isolated
# PostgreSQL test cluster (TCP 127.0.0.1:55439). Never points at a live
# Supabase project: the host/port are fixed to the sandbox cluster, and the
# database name is unique to this suite so a parallel worker's database is
# never dropped.
#
# Three passes, in order:
#   RED    build WITHOUT 20260908000004 and prove both defects reproduce.
#   GREEN  fresh build WITH it and prove both are closed, the controls that
#          were never broken still behave, and validation/authorization/blast
#          radius are byte-identical.
#   REGRESSION  the predecessor attempts-db and entitlement-db suites, on top
#          of the new migration, on a fresh build each.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=ysnp_integrity_overnight_20260908
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
FIX=supabase/migrations/20260908000004_integrity_replay_and_partial_roster.sql
ACADEMY=(supabase/migrations/20260812000001_academy_module.sql supabase/migrations/20260812000002_academy_hardening.sql
         supabase/migrations/20260812000003_academy_submit_completeness.sql supabase/migrations/20260812000004_academy_restrict_quiz_delete.sql
         supabase/migrations/20260813000001_academy_visibility_hardening.sql supabase/migrations/20260814000001_academy_residency_year.sql)

# $1 = "with-fix" | "without-fix"
build() {
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
  "${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/fixtures.sql
  for m in "${ACADEMY[@]}"; do "${PSQL[@]}" -d "$DB" -f "$m"; done
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/post-academy.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000002_resident_entitlement.sql
  [ "$1" = "with-fix" ] && "${PSQL[@]}" -d "$DB" -f "$FIX"
  return 0
}

build without-fix
"${PSQL[@]}" -d "$DB" -f scripts/integrity-db/pre-fix.sql
echo "RED PASSED (F-2 and F-3 both reproduce on the pre-fix build — the tests below are not vacuous)"

build with-fix
"${PSQL[@]}" -d "$DB" -f scripts/integrity-db/tests.sql
echo "GREEN PASSED (F-2 and F-3 closed; controls, validation, authorization and blast radius unchanged)"

# The pre-fix assertions must now FAIL, which is the other half of the proof:
# the fix actually changed the behaviour those assertions describe.
build with-fix
if "${PSQL[@]}" -d "$DB" -f scripts/integrity-db/pre-fix.sql >/dev/null 2>&1; then
  echo "INVERSION FAILED: the pre-fix defect assertions still pass WITH the fix applied"; exit 1
fi
echo "INVERSION PASSED (the defect assertions no longer hold once the fix is applied)"

# Predecessor suites, on top of the new migration, fresh build each (both
# mutate state). These are the regression gate: 20260908000004 replaces two
# functions the launch migrations own, so their own tests must still pass.
build with-fix
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/tests.sql
echo "PREDECESSOR ATTEMPTS TESTS PASSED ON TOP OF 20260908000004"

build with-fix
"${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/tests.sql
echo "PREDECESSOR ENTITLEMENT TESTS PASSED ON TOP OF 20260908000004"

# The roster race from entitlement-db/run.sh, re-run here: two admin sessions
# import the same NEW normalized e-mail at once, both supplying the flag. The
# later call must still win, which is the case a bare coalesce would have
# broken. Uses its own address so it does not collide with that suite.
build with-fix
ADMIN=44444444-4444-4444-4444-444444444444
ASESSION="set role authenticated; select set_config('request.jwt.claim.sub', '$ADMIN', false);"
"${PSQL[@]}" -d "$DB" -c "$ASESSION begin; select upsert_resident_roster('[{\"name\":\"Race A\",\"email\":\"irace@example.org\",\"exam_this_year\":true}]'); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
B_OUT=$("${PSQL[@]}" -d "$DB" -Atc "$ASESSION select upsert_resident_roster('[{\"name\":\"Race B\",\"email\":\"IRACE@Example.ORG\",\"exam_this_year\":false}]')::text;" 2>&1)
wait $A
echo "$B_OUT" | grep -q '"applied": true, "updated": 1, "inserted": 0' || { echo "roster race: second session did not apply as an update, got: $B_OUT"; exit 1; }
ROW=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) || '/' || string_agg(full_name || ':' || exam_this_year || ':' || coalesce(user_id::text, '-') || ':' || national_access, ',') from academy_members where lower(btrim(email)) = 'irace@example.org'")
[ "$ROW" = "1/Race B:false:-:false" ] || { echo "roster race: expected one row updated by B with an explicit false; got: $ROW"; exit 1; }
echo "ROSTER RACE PASSED (explicit false still wins under concurrency — the coalesce-only fix would have failed here)"

echo "ALL INTEGRITY CHECKS PASSED"
