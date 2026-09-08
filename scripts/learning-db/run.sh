#!/usr/bin/env bash
# Learning evidence + curriculum config: builds a throwaway database on the
# isolated PostgreSQL test cluster (TCP 127.0.0.1:55439) exactly like
# scripts/feedback-db/run.sh (fixtures → academy → durable attempts →
# entitlement → feedback/editorial owner), applies
# 20260908000002_learning_curriculum.sql and runs the behaviour tests.
# The synthetic owner comes from B's owner.sql (read, never edited).
# Re-runs the predecessor suites on top of the new migration afterwards.
# Never points at a live Supabase project.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=127.0.0.1; PORT=55439; DB=ysnp_learning_test
PSQL=(psql -h "$HOST" -p "$PORT" -v ON_ERROR_STOP=1 -X -q)
ACADEMY=(supabase/migrations/20260812000001_academy_module.sql supabase/migrations/20260812000002_academy_hardening.sql
         supabase/migrations/20260812000003_academy_submit_completeness.sql supabase/migrations/20260812000004_academy_restrict_quiz_delete.sql
         supabase/migrations/20260813000001_academy_visibility_hardening.sql supabase/migrations/20260814000001_academy_residency_year.sql)
CANDIDATE=${CORE_CANDIDATE:-/Users/idankatz15/Documents/Codex/agent-os/runtime/external-workers/ysnp-autonomous-20260907/CORE-CANDIDATE.json}

build() {
  "${PSQL[@]}" -d postgres -c "drop database if exists $DB" -c "create database $DB"
  "${PSQL[@]}" -d "$DB" -f scripts/attempts-db/fixtures.sql
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/fixtures.sql
  for m in "${ACADEMY[@]}"; do "${PSQL[@]}" -d "$DB" -f "$m"; done
  "${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/post-academy.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000001_durable_attempts.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260907000002_resident_entitlement.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000001_feedback_editorial.sql
  "${PSQL[@]}" -d "$DB" -f scripts/feedback-db/owner.sql
  "${PSQL[@]}" -d "$DB" -f supabase/migrations/20260908000002_learning_curriculum.sql
}

build
# persona fixture only for this suite: the predecessor suites assert the
# untouched roster row, so they run on a fixture-free build below.
"${PSQL[@]}" -d "$DB" -f scripts/learning-db/fixtures.sql
"${PSQL[@]}" -d "$DB" -f scripts/learning-db/tests.sql
echo "LEARNING TESTS PASSED"

# Seed provenance: the stored chapters must equal CORE-CANDIDATE.json exactly
# (same order, same numbers, same titles; jsonb reorders keys, so both sides
# are compared with sorted keys) and carry its sha256.
if [ -f "$CANDIDATE" ]; then
  EXPECT=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(json.dumps(d['chapters'],ensure_ascii=False,sort_keys=True,separators=(',',':')))" "$CANDIDATE")
  EXPECT_SHA=$(shasum -a 256 "$CANDIDATE" | cut -d' ' -f1)
  GOT=$("${PSQL[@]}" -d "$DB" -Atc "select chapters::text from curriculum_configs where version='core-candidate-2026-09-07'")
  GOT_SHA=$("${PSQL[@]}" -d "$DB" -Atc "select source->>'candidate_sha256' from curriculum_configs where version='core-candidate-2026-09-07'")
  [ "$(python3 -c "import json,sys;print(json.dumps(json.loads(sys.argv[1]),ensure_ascii=False,sort_keys=True,separators=(',',':')))" "$GOT")" = "$EXPECT" ] || { echo "seed chapters differ from CORE-CANDIDATE.json"; exit 1; }
  [ "$GOT_SHA" = "$EXPECT_SHA" ] || { echo "seed candidate_sha256 $GOT_SHA != $EXPECT_SHA"; exit 1; }
  echo "SEED PROVENANCE MATCHES CORE-CANDIDATE.json ($EXPECT_SHA)"
else
  echo "SEED PROVENANCE CHECK SKIPPED (candidate file not found at $CANDIDATE)"
fi

# Regression: predecessor suites on top of the new migration.
build
"${PSQL[@]}" -d "$DB" -f scripts/entitlement-db/tests.sql
echo "PREDECESSOR ENTITLEMENT TESTS PASSED ON TOP OF THE LEARNING MIGRATION"
build
"${PSQL[@]}" -d "$DB" -f scripts/attempts-db/tests.sql
echo "PREDECESSOR ATTEMPTS TESTS PASSED ON TOP OF THE LEARNING MIGRATION"
