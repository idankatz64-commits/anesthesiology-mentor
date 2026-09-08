import { describe, expect, it } from 'vitest';
import { feedbackTimingFor, sessionFeedback } from '@/lib/sessionFeedback';

describe('feedback independent of session purpose', () => {
  it('preserves legacy defaults', () => {
    expect(feedbackTimingFor('practice')).toBe('immediate');
    expect(feedbackTimingFor('exam')).toBe('end');
    expect(feedbackTimingFor('simulation', 'immediate')).toBe('end');
  });

  it('simulation asks for explicit confidence like every other mode', () => {
    expect(sessionFeedback('simulation', 'end', 'A', null)).toMatchObject({ needsConfidence: true, showFeedback: false });
    expect(sessionFeedback('simulation', 'end', 'A', 'guessed')).toMatchObject({ needsConfidence: false, showFeedback: false });
  });

  it.each(['practice', 'exam'] as const)('locks a confirmed %s answer before showing immediate feedback', mode => {
    expect(sessionFeedback(mode, 'immediate', 'A', null)).toEqual({ needsConfidence: true, answerLocked: false, showFeedback: false });
    expect(sessionFeedback(mode, 'immediate', 'A', 'hesitant')).toEqual({ needsConfidence: false, answerLocked: true, showFeedback: true });
  });

  it('keeps practice answers locked but hides feedback until the end', () => {
    expect(sessionFeedback('practice', 'end', 'A', 'confident')).toEqual({ needsConfidence: false, answerLocked: true, showFeedback: false });
  });

  it('allows exam answers to be edited before end feedback and always reveals review', () => {
    expect(sessionFeedback('exam', 'end', 'A', null)).toEqual({ needsConfidence: true, answerLocked: false, showFeedback: false });
    expect(sessionFeedback('exam', 'end', 'A', 'guessed')).toEqual({ needsConfidence: false, answerLocked: false, showFeedback: false });
    expect(sessionFeedback('review', 'end', null, null)).toEqual({ needsConfidence: false, answerLocked: true, showFeedback: true });
    expect(sessionFeedback('practice', 'immediate', null, null).needsConfidence).toBe(false);
  });
});
