/** Launch v1 policy. Call only with submitted first answers before feedback.
 * Legacy answer_history does not establish practice/exam provenance and must
 * not be converted into these records by guessing its mode.
 */
export interface ChapterAnswer {
  questionId: string;
  mode: 'practice' | 'exam';
  correct: boolean;
  answeredAt: number;
}

export function calculateChapterProgress(questionIds: readonly string[], answers: readonly ChapterAnswer[]) {
  const eligible = new Set(questionIds);
  const covered = new Set<string>();
  const latestQuiz = new Map<string, ChapterAnswer>();
  for (const answer of answers) {
    if (!eligible.has(answer.questionId)) continue;
    covered.add(answer.questionId);
    if (answer.mode !== 'exam') continue;
    const previous = latestQuiz.get(answer.questionId);
    if (!previous || answer.answeredAt >= previous.answeredAt) latestQuiz.set(answer.questionId, answer);
  }
  const requiredCoverageCount = Math.ceil(eligible.size * 0.5);
  const requiredQuizCount = Math.ceil(requiredCoverageCount * 0.5);
  const correct = [...latestQuiz.values()].filter(answer => answer.correct).length;
  const quizSuccessPercent = latestQuiz.size ? correct * 100 / latestQuiz.size : null;
  return {
    coveredCount: covered.size,
    quizCount: latestQuiz.size,
    requiredCoverageCount,
    requiredQuizCount,
    coveragePercent: eligible.size ? covered.size / eligible.size * 100 : null,
    quizSuccessPercent,
    green: eligible.size > 0 && covered.size >= requiredCoverageCount &&
      latestQuiz.size >= requiredQuizCount && latestQuiz.size > 0 && correct * 100 >= latestQuiz.size * 70,
  };
}

/** Explicit allowlist: the internal quiz quota is not a management field. */
export function managementProgress(progress: ReturnType<typeof calculateChapterProgress>) {
  return { coveragePercent: progress.coveragePercent, successPercent: progress.quizSuccessPercent };
}
