/**
 * Builds the args object for the `increment_user_answer` RPC when the user
 * presses "לחזור על זה מחר" (mark-for-review).
 *
 * Why this exists: mark-for-review used to bypass user_answers entirely and
 * write directly to answer_history, which left user_answers.answered_count
 * behind by N (= number of mark-for-review clicks since last reload) and
 * caused the local count to silently roll backward after a page reload.
 *
 * Routing through the same atomic RPC that updateHistory uses keeps
 * user_answers consistent; the trg_sync_answer_history trigger populates
 * answer_history automatically. The previous `flagged_for_review=true` flag
 * is intentionally dropped — verified zero readers across the repo
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
