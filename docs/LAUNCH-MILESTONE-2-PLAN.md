# Milestone 2 — durable attempts and quarterly archive

Authorized by Idan on 7 September 2026 after local acceptance of the unified question UI. Work only in this worktree; production migration/activation remains gated by product review.

## Deliverable and acceptance

Create a durable personal attempt path for regular practice/exam, with a quarterly archive and read-only questions/explanations. Repeat an exam with the same frozen question set in a different order only after seven elapsed days from its latest submission. A retry uses the same attempt ID and cannot increment progress or SRS twice. Legacy Academy simulations stay separate.

- Preserve provenance: explicit mode, feedback timing, selected answer, confidence, per-question active answer time, total active session time, canonical question/key snapshot, start/submission timestamps and root quiz identity.
- Server scores against its snapshot; missing/non-A–D keys are unscored, never invented. Client cannot submit a score or another user's identity.
- Practice confirmation persists a question and its learning/SRS credit atomically, as today. Exam confirmation persists a response but its learning/SRS credit is applied atomically at final submission. Immediate feedback appears only after confirmation succeeds; end-feedback exam answers remain editable until submission. Practice/immediate-exam confirmed responses cannot be changed server-side.
- Final submission atomically completes the attempt, applies outstanding credit once, and assigns the calendar quarter in Asia/Jerusalem. Repeating an exam starts a fresh attempt, not a replacement of the original. Review is always read-only. New quizzes are not subject to the repeat-quiz cooldown.
- New tables are owner-only, approved-user SELECT; no direct client mutation grants. Explicit RPC ownership/approval checks; root row locks serialize retakes; question snapshots cannot be supplied by the client.
- Stable attempt identity persists with drafts. Submitted/abandoned attempts cannot be reopened as editable drafts. A stale draft never submits new writes against an already submitted attempt. New attempt activation is gated by a build-time flag until the migration and release are approved.

## Implementation

1. Add migration and local PostgreSQL harness for creation/answer/submission/read/repeat/discard. Test actual SQL authorization, server grading, immutable responses, idempotent retries, rollback, cooling and shuffled membership.
2. Add typed repository and context integration with feature flag default off. Preserve legacy flow when off; no silent fallback to non-durable writes if enabled RPCs fail.
3. Add quarterly history screen, saved-attempt review and repeat/resume controls. Wire real components into synthetic local demo.
4. Test UI behavior and full existing suite/build, independently review changes, update the existing OS task and show the completed slice.

## Deliberate limits

No new national-exam entitlement rules, profiles, official management projections, curriculum, FSRS replacement, production data writes or migration deployment in this milestone. Existing legacy history is not relabeled as practice/exam. Existing content contains answer keys client-side; this milestone adds authoritative scoring and auditability, not a proctored examination boundary. Future entitlement checks must also cover archive snapshot retrieval before release.
