import { describe, it, expect } from 'vitest';
import { buildMarkForReviewIncrementArgs } from '@/lib/markForReviewParams';

// Bug E: markForReview previously wrote directly to answer_history without
// updating user_answers. After page reload, user_answers.answered_count was
// off by N (where N is the number of mark-for-review clicks since last load).
//
// Fix: route through the same `increment_user_answer` RPC that updateHistory
// uses. The DB trigger trg_sync_answer_history then inserts answer_history
// automatically. The marking is recorded as is_correct=false (a wrong attempt)
// because that is exactly what the user is signaling: "I need to see this
// again tomorrow because I don't know it yet."
describe('buildMarkForReviewIncrementArgs', () => {
  it('builds args with p_is_correct=false (mark-for-review = wrong attempt)', () => {
    const args = buildMarkForReviewIncrementArgs(
      'user-uuid-123',
      'Q-6C275F',
      'Bariatric',
    );
    expect(args).toEqual({
      p_user_id: 'user-uuid-123',
      p_question_id: 'Q-6C275F',
      p_is_correct: false,
      p_topic: 'Bariatric',
    });
  });

  it('passes topic through verbatim when provided', () => {
    const args = buildMarkForReviewIncrementArgs('u', 'q', 'Pharmacology');
    expect(args.p_topic).toBe('Pharmacology');
  });

  it('coerces undefined topic to null (RPC contract requires nullable, not undefined)', () => {
    const args = buildMarkForReviewIncrementArgs('u', 'q');
    expect(args.p_topic).toBeNull();
  });

  it('always sets is_correct to false regardless of inputs', () => {
    expect(buildMarkForReviewIncrementArgs('u', 'q').p_is_correct).toBe(false);
    expect(buildMarkForReviewIncrementArgs('u', 'q', 'X').p_is_correct).toBe(false);
  });
});
