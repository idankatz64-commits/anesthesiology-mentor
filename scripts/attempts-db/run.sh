#!/usr/bin/env bash
# Runs the durable-attempts migration against a throwaway database on the
# isolated PostgreSQL test cluster (TCP 127.0.0.1:55439) and executes the SQL
# behaviour tests plus a two-session concurrency probe. Never points at a live
# Supabase project: the host/port are fixed to the sandbox cluster.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=ysnp_attempts_test
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
"${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
"${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/tests.sql

# Concurrency: two sessions race to repeat the same root. The root row lock
# serialises them; the second must receive the attempt the first created, and
# exactly one new in-progress attempt may exist afterwards.
ROOT=$("${PSQL[@]}" -d "$DB" -Atc "update attempt_roots set latest_submitted_at = now() - interval '8 days' where id = (select root_id from attempts where status = 'submitted' order by submitted_at limit 1) returning id")
"${PSQL[@]}" -d "$DB" -c "update attempts set status = 'abandoned' where root_id = '$ROOT' and status = 'in_progress'"
UID1=11111111-1111-1111-1111-111111111111
SESSION="set role authenticated; select set_config('request.jwt.claim.sub', '$UID1', false);"
"${PSQL[@]}" -d "$DB" -c "$SESSION begin; select attempt_repeat('$ROOT', 'end'); select pg_sleep(2); commit;" >/dev/null &
A=$!
sleep 0.5
set +e
B_OUT=$("${PSQL[@]}" -d "$DB" -c "$SESSION select attempt_repeat('$ROOT', 'end');" 2>&1)
set -e
wait $A
OPEN_ID=$("${PSQL[@]}" -d "$DB" -Atc "select id from attempts where root_id = '$ROOT' and status = 'in_progress'")
echo "$B_OUT" | grep -q "\"attempt_id\": *\"$OPEN_ID\"" || { echo "concurrency probe: expected the open attempt $OPEN_ID, got: $B_OUT"; exit 1; }
OPEN=$("${PSQL[@]}" -d "$DB" -Atc "select count(*) from attempts where root_id = '$ROOT' and status = 'in_progress'")
[ "$OPEN" = "1" ] || { echo "concurrency probe: expected 1 open attempt, got $OPEN"; exit 1; }
echo "CONCURRENCY PROBE PASSED (second session blocked on the root lock, then received the same open attempt)"
