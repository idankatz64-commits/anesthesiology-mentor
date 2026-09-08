#!/usr/bin/env bash
# Two-session proof: same-card order, SKIP LOCKED, lease expiry and retry token.
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=${FSRS_DB:-ysnp_fsrs_test}
case "$DB" in ysnp_fsrs_test|ysnp_fsrs_test_v2|ysnp_fsrs_test_v3|ysnp_fsrs_test_v4|ysnp_fsrs_fix_20260908|ysnp_fsrs_fix_20260908_v2|ysnp_fsrs_fix_20260908_v3) ;; *) echo "REFUSING: unsupported database name"; exit 1;; esac
PSQL=(psql -h 127.0.0.1 -p 55439 -v ON_ERROR_STOP=1 -X -q -d "$DB")
TMP_A=$(mktemp /private/tmp/ysnp-fsrs-claim-a.XXXXXX)
trap 'rm -f "$TMP_A"' EXIT

"${PSQL[@]}" -Atc "begin; select fsrs_worker_claim(1); select pg_sleep(2); commit" >"$TMP_A" &
PID_A=$!
sleep 0.4
B_OUT=$("${PSQL[@]}" -Atc "select fsrs_worker_claim(1)")
wait "$PID_A"
[ "$B_OUT" = "[]" ] || { echo "same-card concurrent claim should be empty, got: $B_OUT"; exit 1; }

EVENT=$("${PSQL[@]}" -Atc "select event_id from fsrs_processing_queue where status='processing'")
OLD_TOKEN=$("${PSQL[@]}" -Atc "select lease_token from fsrs_processing_queue where event_id='$EVENT'")
[ -n "$EVENT" ] && [ -n "$OLD_TOKEN" ] || { echo "first lease was not persisted"; exit 1; }
"${PSQL[@]}" -c "update fsrs_processing_queue set lease_expires_at=now()-interval '1 second' where event_id='$EVENT'"
EXPIRED_BEFORE=$("${PSQL[@]}" -Atc "select to_jsonb(q)::text||(select '|'||count(*) from fsrs_card_states)||(select '|'||count(*) from fsrs_review_logs) from fsrs_processing_queue q where event_id='$EVENT'")
for FINALIZER in \
  "select fsrs_worker_commit('$EVENT','$OLD_TOKEN','{}'::jsonb)" \
  "select fsrs_worker_exclude('$EVENT','$OLD_TOKEN')" \
  "select fsrs_worker_fail('$EVENT','$OLD_TOKEN','EXPIRED_WORKER_PROBE')"; do
  REJECTED=$("${PSQL[@]}" -Atc "$FINALIZER" 2>&1 || true)
  echo "$REJECTED" | grep -q LEASE_MISMATCH || { echo "expired finalizer was accepted: $FINALIZER"; exit 1; }
done
EXPIRED_AFTER=$("${PSQL[@]}" -Atc "select to_jsonb(q)::text||(select '|'||count(*) from fsrs_card_states)||(select '|'||count(*) from fsrs_review_logs) from fsrs_processing_queue q where event_id='$EVENT'")
[ "$EXPIRED_BEFORE" = "$EXPIRED_AFTER" ] || { echo "expired finalizer changed queue/state/log data"; exit 1; }
NEW_CLAIM=$("${PSQL[@]}" -Atc "select fsrs_worker_claim(1)")
NEW_EVENT=$("${PSQL[@]}" -Atc "select event_id from fsrs_processing_queue where status='processing'")
NEW_TOKEN=$("${PSQL[@]}" -Atc "select lease_token from fsrs_processing_queue where event_id='$EVENT'")
[ "$NEW_EVENT" = "$EVENT" ] && [ "$NEW_TOKEN" != "$OLD_TOKEN" ] && echo "$NEW_CLAIM" | grep -q "$EVENT" || {
  echo "expired lease was not reclaimed with a new token"; exit 1;
}
STALE=$("${PSQL[@]}" -Atc "select fsrs_worker_exclude('$EVENT','$OLD_TOKEN')" 2>&1 || true)
echo "$STALE" | grep -q LEASE_MISMATCH || { echo "stale lease token was accepted"; exit 1; }
LIVE_FAIL=$("${PSQL[@]}" -Atc "select fsrs_worker_fail('$EVENT','$NEW_TOKEN','LIVE_WORKER_PROBE')")
echo "$LIVE_FAIL" | grep -q '"status": "retry"' || { echo "live lease failure did not schedule retry"; exit 1; }
LIVE_RETRY=$("${PSQL[@]}" -Atc "select status='retry' and last_error='LIVE_WORKER_PROBE' and available_at>now() from fsrs_processing_queue where event_id='$EVENT'")
[ "$LIVE_RETRY" = t ] || { echo "live lease failure state is incorrect"; exit 1; }
"${PSQL[@]}" -Atc "update fsrs_processing_queue set available_at=now() where event_id='$EVENT'" >/dev/null
"${PSQL[@]}" -Atc "select fsrs_worker_claim(1)" >/dev/null
FINAL_TOKEN=$("${PSQL[@]}" -Atc "select lease_token from fsrs_processing_queue where event_id='$EVENT'")
"${PSQL[@]}" -Atc "select fsrs_worker_exclude('$EVENT','$FINAL_TOKEN')" >/dev/null
FINALIZED_BEFORE=$("${PSQL[@]}" -Atc "select to_jsonb(q)::text||(select '|'||count(*) from fsrs_card_states)||(select '|'||count(*) from fsrs_review_logs) from fsrs_processing_queue q where event_id='$EVENT'")
FINAL_RETRY=$("${PSQL[@]}" -Atc "select fsrs_worker_fail('$EVENT','$FINAL_TOKEN','NETWORK_RETRY')")
echo "$FINAL_RETRY" | grep -q '"status": "processed"' || { echo "finalized network retry was not idempotent"; exit 1; }
FINALIZED_AFTER=$("${PSQL[@]}" -Atc "select to_jsonb(q)::text||(select '|'||count(*) from fsrs_card_states)||(select '|'||count(*) from fsrs_review_logs) from fsrs_processing_queue q where event_id='$EVENT'")
[ "$FINALIZED_BEFORE" = "$FINALIZED_AFTER" ] || { echo "finalized network retry changed queue/state/log data"; exit 1; }

NEXT=$("${PSQL[@]}" -Atc "select fsrs_worker_claim(1)")
NEXT_EVENT=$("${PSQL[@]}" -Atc "select event_id from fsrs_processing_queue where status='processing'")
NEXT_TOKEN=$("${PSQL[@]}" -Atc "select lease_token from fsrs_processing_queue where event_id='$NEXT_EVENT'")
[ "$NEXT_EVENT" != "$EVENT" ] && echo "$NEXT" | grep -q "$NEXT_EVENT" || { echo "second ordered event was not released"; exit 1; }
"${PSQL[@]}" -Atc "select fsrs_worker_exclude('$NEXT_EVENT','$NEXT_TOKEN')" >/dev/null
LEFT=$("${PSQL[@]}" -Atc "select count(*) from fsrs_processing_queue where status<>'processed'")
[ "$LEFT" = 0 ] || { echo "$LEFT unprocessed FSRS queue rows remain"; exit 1; }
echo "FSRS CONCURRENCY/LEASE TEST PASSED"
