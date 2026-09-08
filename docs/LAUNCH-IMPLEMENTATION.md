# YSNP launch implementation — 7 September 2026

Source: `/Users/idankatz15/Documents/Codex/agent-os/docs/YSNP-LAUNCH-2026-09-07.md` and Idan's explicit approval to begin implementation on 7 September. Production remains subject to Idan's review of the actual product. Base commit: `0105221`. Worktree: `ysnp-launch-v1`; branch: `codex/ysnp-launch-v1`.

Status: first local feature slice implemented and independently reviewed; 272 tests pass. See `docs/LAUNCH-MILESTONE-1-REVIEW.md` for evidence and remaining legacy-flow/storage limitations. This is not launch readiness.

## First implementation milestone: unified question experience

1. Decouple feedback timing from practice/exam mode. Both allow immediate feedback or feedback at the end. Preserve the chosen setting across saves/resume; legacy sessions retain their former defaults. Feedback exposure locks the recorded answer. Existing academy simulations remain on their existing path until the attempt-storage milestone.
2. All user-selected question counts use smart selection, with no arbitrary 500-question cap. Keep existing source/topic filters, including current mistakes; do not silently broaden filters. On selection-service failure, keep the setup visible with a retryable error rather than silently using random selection. Explicitly retain existing SRS policy until the new-pool decision is finalized.
3. Count elapsed use time in both practice/exam; pause counting while hidden or in an exit dialog. No time limit on these modes. Question-level timing and removal of legacy simulation time limits belong to the storage milestone.
4. Preserve saved drafts on failed saves and keep them until an explicit successful finish/discard. Complete both feedback modes without prematurely exposing answers or bypassing their existing persistence flow.
5. Remove SRS navigation and block flashcards through all entry points, without deleting their data. Redirect legacy view IDs to a usable screen.
6. Implement and test the approved progress calculation as a pure policy module: 50% distinct coverage from both modes, quiz minimum half the coverage target, 70% latest quiz accuracy. Keep quiz counts/internal checks out of the management projection. This is not presented as a live metric until new attempt data is integrated.

Verification: behavioral tests for both feedback settings, setup selection, resume compatibility and save failures; policy examples 99 practice+1 quiz, 90+10, 25+25, deduplication and small/large chapters; production build; independent code review; local demo UI smoke checks with synthetic data only.

## Requested follow-up: transitions and learning summary

Implemented locally after Idan identified slow screen transitions: remove exit-before-entry and staggered Setup animations; compute a deterministic personal learning summary in both practice and exam, including overall/topic coverage delta, corrected/repeated mistakes, and actionable source/topic recommendations. Snapshot successfully loaded history at session start and persist it with drafts; unknown history remains explicitly unavailable. Use consistent practice accuracy across results, last-session card and PDF, excluding skips/unscored answers. Render question details in batches of 30. Legacy Academy simulations remain separate.

Verified: 266 tests in 36 files, Vite build, unchanged three baseline TypeScript diagnostics, independent review with findings fixed, real Setup/Session/Results component demo using synthetic data in desktop and 390px mobile layouts. No production latency benchmark or durable DB verification is implied.

## Follow-up: choice input, export, and completed-session review

Fixed the reproduced Enter/Space conflict with native focused buttons. A 12-question mouse run allowed every choice; the exact user-reported incident remains unidentified pending feedback timing/input method. Prominent read-only review opens the first explanation and resets the inner list scroll without restarting or rescoring. Full report preview includes all insights, questions and complete multipart explanations, with safe content handling and print-to-PDF via a sandboxed iframe. The browser rendering and print invocation were checked; OS-level save and actual generated PDF remain a manual acceptance check.

## Follow-up: explicit exam confidence for SRS

Both exam feedback timings now request confident/hesitant/guessed immediately after choosing an answer. End-feedback exams retain editable answers before submission; changing an answer clears its rating, while choosing the same answer preserves it. Confidence remains draft-only until exam submission and survives save/resume. Submission redirects an answered but unrated legacy draft question before any writes. Immediate feedback still locks the answer after confirmation; legacy simulations remain unchanged.

Verified: 272 tests in 36 files, successful Vite build, unchanged three baseline TypeScript diagnostics, independent focused review (32 tests), and a synthetic browser flow through answer, confidence, changed answer, fresh confidence and final results without early answer disclosure.

## Following milestones

- Durable session/attempt records, explicit mode/feedback/time provenance, server-scored quizzes, quarterly archive, immutable questions per quiz and seven-day retake enforcement; idempotent writes and legacy-data migration. Existing answer_history is insufficient to infer practice/quiz provenance.
- Route legacy quick-start and repeat-session shortcuts through the feedback/count choices. Finish replacing the legacy simulation timer. Await durable history commits before declaring submission successful; preserve retry checkpoints across reloads.
- Personal profiles and admin-controlled national-exam entitlement, enforced in DB and all content reads. No production migration without the product/release gate.
- Versioned 24-month curriculum, dynamic recommendations and progress screens using the approved core list; ownership of thresholds and internal/management report projections.
- Resident roster/onboarding, accessibility/mobile/recovery checks, staff acceptance and Idan's release approval.

Do not claim that the first milestone implements the following milestones. No new clinical answer keys, new production accounts or national-exam release dates may be guessed.
