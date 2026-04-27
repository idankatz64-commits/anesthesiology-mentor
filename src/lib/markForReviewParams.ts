/**
 * Bug E: markForReview previously bypassed user_answers entirely and wrote
 * directly to answer_history. That left user_answers.answered_count behind
 * by N (where N = number of "לחזור על זה מחר" clicks since last reload),
 * because local progress.history was incremented but the DB row was not.
 * After page reload, fetchProgress reads from user_answers and the local
 * count silently rolls backward.
 *
 * Fix: route mark-for-review through the same `increment_user_answer` RPC
 * that updateHistory uses. The DB trigger trg_sync_answer_history then
 * populates answer_history automatically. We deliberately drop the
 * `flagged_for_review=true` flag — verified zero readers across the repo
 * (frontend, edge functions, DB views/functions/policies).
 *
 * The marking is recorded as is_correct=false because that is exactly
 * what the user is signaling: "I do not know this yet, queue it again."
 */

export interface IncrementUserAnswerArgs {
  p_user_id: string;
  p_question_id: string;
  p_is_correct: boolean;
  p_topic: string | null;
}

export function buildMarkForReviewIncrementArgs(
  userId: string,
  questionId: string,
  topic?: string,
): IncrementUserAnswerArgs {
  return {
    p_user_id: userId,
    p_question_id: questionId,
    p_is_correct: false,
    p_topic: topic ?? null,
  };
}
