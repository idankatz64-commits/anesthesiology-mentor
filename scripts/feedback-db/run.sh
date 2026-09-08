#!/usr/bin/env bash
# Feedback + Idan-only editorial approval: builds a throwaway database on the
# isolated PostgreSQL test cluster (TCP 127.0.0.1:55439) exactly like
# scripts/entitlement-db/run.sh, adds the legacy question-write state, applies
# 20260908000001_feedback_editorial.sql, and runs the behaviour tests. A second
# build re-runs the predecessor entitlement + attempts tests on top of the new
# migration (regression). Never points at a live Supabase project.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=ysnp_feedback_test
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
ACADEMY=(supabase/migrations/20260812000001_academy_module.sql supabase/migrations/20260812000002_academy_hardening.sql
         supabase/migrations/20260812000003_academy_submit_completeness.sql supabase/migrations/20260812000004_academy_restrict_quiz_delete.sql
         supabase/migrations/20260813000001_academy_visibility_hardening.sql supabase/migrations/20260814000001_academy_residency_year.sql)

build() { # $1 = "legacy" to load the feedback fixture (legacy write policies) before the migration
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
  # production has service_role (used by Edge Functions); the bare cluster does not
  "${PSQL[@]}" -d "$DB" -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if; end \$\$"
  "${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/fixtures.sql
  for m in "${ACADEMY[@]}"; do "${PSQL[@]}" -d "$DB" -f "$m"; done
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/post-academy.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000002_resident_entitlement.sql
  [ "${1:-}" = legacy ] && "${PSQL[@]}" -d "$DB" -f scripts/feedback-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000001_feedback_editorial.sql
  "${PSQL[@]}" -d "$DB" -f scripts/feedback-db/owner.sql
}

build legacy
"${PSQL[@]}" -d "$DB" -f scripts/feedback-db/tests.sql
echo "FEEDBACK TESTS PASSED"

# Approval race: two owner sessions approve two competing corrections of the
# same target. The second must fail with STALE_BASE and the first's text stays.
OWNER=0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f
S="set role authenticated; select set_config('request.jwt.claim.sub', '$OWNER', false);"
"${PSQL[@]}" -d "$DB" -c "$S select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false); select feedback_submit('correction','q2','explanation','race','race A','Miller 10e',null); select feedback_submit('correction','q2','explanation','race','race B','Miller 10e',null);" >/dev/null
IDS=$("${PSQL[@]}" -d "$DB" -Atc "select string_agg(id::text, ' ' order by proposed_text) from feedback_items where question_id='q2' and proposed_text like 'race %'")
IDA=${IDS% *}; IDB=${IDS#* }
BASE=$("${PSQL[@]}" -d "$DB" -Atc "select feedback_question_hash(q) from questions q where id='q2'")
"${PSQL[@]}" -d "$DB" -c "$S begin; select feedback_approve('$IDA','$BASE',null); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
B_OUT=$("${PSQL[@]}" -d "$DB" -Atc "$S select feedback_approve('$IDB','$BASE',null);" 2>&1 || true)
wait $A
echo "$B_OUT" | grep -q "STALE_BASE" || { echo "approval race: second approval should be STALE_BASE, got: $B_OUT"; exit 1; }
LIVE=$("${PSQL[@]}" -d "$DB" -Atc "select explanation || '/' || (select status from feedback_items where id='$IDB') from questions where id='q2'")
[ "$LIVE" = "race A/pending" ] || { echo "approval race: expected 'race A/pending', got $LIVE"; exit 1; }
echo "APPROVAL RACE PASSED (second concurrent approval rejected as STALE_BASE, first version live)"

# Rate-limit race: a user sitting at 29/30 for the hour sends two submissions at
# once. The first holds the per-user advisory lock inside an open transaction;
# the second must wait for it and then see the full window (RATE_LIMITED), so
# exactly one lands. A different user is not held by that lock.
U2=22222222-2222-2222-2222-222222222222
U1=11111111-1111-1111-1111-111111111111
"${PSQL[@]}" -d "$DB" -c "insert into feedback_items (kind, issue_text, submitted_by) select 'app_bug', 'seed ' || g, '$U2' from generate_series(1, 29 - (select count(*) from feedback_items where submitted_by = '$U2' and created_at > now() - interval '1 hour')) g" >/dev/null
S2="set role authenticated; select set_config('request.jwt.claim.sub', '$U2', false);"
S1="set role authenticated; select set_config('request.jwt.claim.sub', '$U1', false);"
"${PSQL[@]}" -d "$DB" -c "$S2 begin; select feedback_submit('app_bug', null, null, 'slot 30 first', null, null, null); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
START=$(date +%s)
B_OUT=$("${PSQL[@]}" -d "$DB" -Atc "$S2 select feedback_submit('app_bug', null, null, 'slot 30 second', null, null, null);" 2>&1 || true)
WAITED=$(( $(date +%s) - START ))
OTHER=$("${PSQL[@]}" -d "$DB" -Atc "$S1 select feedback_submit('app_bug', null, null, 'other user during the race', null, null, null)->>'status';" 2>&1 | tail -n 1 || true)
wait $A
echo "$B_OUT" | grep -q "RATE_LIMITED" || { echo "rate race: second concurrent submission should be RATE_LIMITED, got: $B_OUT"; exit 1; }
[ "$WAITED" -ge 1 ] || { echo "rate race: second submission did not wait for the first (waited ${WAITED}s)"; exit 1; }
LANDED=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from feedback_items where submitted_by = '$U2' and issue_text like 'slot 30%'")
[ "$LANDED" = "1" ] || { echo "rate race: expected exactly one of the two to land, got $LANDED"; exit 1; }
[ "$OTHER" = "pending" ] || { echo "rate race: another user must not be held by the per-user lock, got: $OTHER"; exit 1; }
echo "RATE-LIMIT RACE PASSED (per-user serialization: one of two concurrent submissions took the last slot, other user unaffected)"

# Regression: predecessor suites on top of the feedback migration (fresh builds
# without the legacy fixture; those suites assert their own policy counts).
build
"${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/tests.sql
echo "PREDECESSOR ENTITLEMENT TESTS PASSED ON TOP OF THE FEEDBACK MIGRATION"
build
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/tests.sql
echo "PREDECESSOR ATTEMPTS TESTS PASSED ON TOP OF THE FEEDBACK MIGRATION"
