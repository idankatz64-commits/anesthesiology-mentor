#!/usr/bin/env bash
# Resident identity + national entitlement: builds a throwaway database on the
# isolated PostgreSQL test cluster (TCP 127.0.0.1:55439), applies the academy,
# durable-attempts and entitlement migrations on top of the synthetic fixtures,
# runs the SQL behaviour tests, then a two-session linking race. A second
# build re-runs the predecessor durable-attempts tests on top of the new
# migration (regression). Never points at a live Supabase project.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=ysnp_entitlement_test
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
ACADEMY=(supabase/migrations/20260812000001_academy_module.sql supabase/migrations/20260812000002_academy_hardening.sql
         supabase/migrations/20260812000003_academy_submit_completeness.sql supabase/migrations/20260812000004_academy_restrict_quiz_delete.sql
         supabase/migrations/20260813000001_academy_visibility_hardening.sql supabase/migrations/20260814000001_academy_residency_year.sql)

build() {
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
  "${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/fixtures.sql
  for m in "${ACADEMY[@]}"; do "${PSQL[@]}" -d "$DB" -f "$m"; done
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/post-academy.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000002_resident_entitlement.sql
}

build
"${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/tests.sql

# Linking race: the same verified user claims from two sessions at once.
# Exactly one roster row may end up linked to it, and both calls must succeed.
UID8=88888888-8888-8888-8888-888888888888
"${PSQL[@]}" -d "$DB" -c "update academy_members set user_id = null, linked_at = null where user_id = '$UID8'"
SESSION="set role authenticated; select set_config('request.jwt.claim.sub', '$UID8', false); select set_config('request.jwt.claims', '{\"email\":\"pw.verified@example.com\",\"app_metadata\":{\"providers\":[\"email\"]}}', false);"
"${PSQL[@]}" -d "$DB" -c "$SESSION begin; select claim_academy_membership(); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
B_OUT=$("${PSQL[@]}" -d "$DB" -Atc "$SESSION select access_level || '/' || status from claim_academy_membership();" 2>&1)
wait $A
echo "$B_OUT" | grep -q "academy/active" || { echo "linking race: second session did not get the membership, got: $B_OUT"; exit 1; }
LINKED=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from academy_members where user_id = '$UID8'")
[ "$LINKED" = "1" ] || { echo "linking race: expected exactly 1 linked row, got $LINKED"; exit 1; }
echo "LINKING RACE PASSED (two sessions, one linked row, both received the membership)"

# Roster race: two admin sessions import the same NEW normalized e-mail (in
# different case) at once. Both calls must succeed, exactly one row may exist,
# the later call's name/flag win, and owner/toggle stay untouched.
ADMIN=44444444-4444-4444-4444-444444444444
ASESSION="set role authenticated; select set_config('request.jwt.claim.sub', '$ADMIN', false);"
"${PSQL[@]}" -d "$DB" -c "$ASESSION begin; select upsert_resident_roster('[{\"name\":\"Race A\",\"email\":\"race@example.com\",\"exam_this_year\":true}]'); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
B_OUT=$("${PSQL[@]}" -d "$DB" -Atc "$ASESSION select upsert_resident_roster('[{\"name\":\"Race B\",\"email\":\"RACE@example.com\",\"exam_this_year\":false}]')::text;" 2>&1)
wait $A
echo "$B_OUT" | grep -q '"applied": true, "updated": 1, "inserted": 0' || { echo "roster race: second session did not apply as an update, got: $B_OUT"; exit 1; }
ROW=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) || '/' || string_agg(full_name || ':' || exam_this_year || ':' || coalesce(user_id::text, '-') || ':' || national_access, ',') from academy_members where lower(btrim(email)) = 'race@example.com'")
[ "$ROW" = "1/Race B:false:-:false" ] || { echo "roster race: expected one row, updated by B, no owner/toggle; got: $ROW"; exit 1; }
echo "ROSTER RACE PASSED (two admin sessions, same new e-mail, both applied, one row, B's update won, owner/toggle untouched)"

# Regression: the predecessor durable-attempts tests must still hold on top of
# the entitlement migration (fresh build; the entitlement tests mutate state).
build
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/tests.sql
echo "PREDECESSOR ATTEMPTS TESTS PASSED ON TOP OF THE ENTITLEMENT MIGRATION"
