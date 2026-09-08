import type { ConfidenceLevel, FeedbackTiming, SessionMode } from './types';

export function feedbackTimingFor(mode: SessionMode, selected?: FeedbackTiming): FeedbackTiming {
  if (mode === 'simulation') return 'end';
  return selected ?? (mode === 'practice' ? 'immediate' : 'end');
}

export function sessionFeedback(mode: SessionMode, timing: FeedbackTiming | undefined, answer: string | null, confidence: ConfidenceLevel | null) {
  const immediate = feedbackTimingFor(mode, timing) === 'immediate';
  const requiresConfidence = mode === 'practice' || mode === 'exam' || mode === 'simulation';
  const committed = requiresConfidence && answer != null && confidence != null;
  return {
    needsConfidence: requiresConfidence && answer != null && confidence == null,
    answerLocked: mode === 'review' || (committed && (mode === 'practice' || immediate)),
    showFeedback: mode === 'review' || (immediate && committed),
  };
}
