import { KEYS, type Question, type ConfidenceLevel } from "./types";

export type SavedSessionData = {
  questionIds: string[];
  answers: (string | null)[];
  confidence: (string | null)[];
  index: number;
};

export type RebuiltSession = {
  quiz: Question[];
  answers: (string | null)[];
  confidence: (ConfidenceLevel | null)[];
  validIndex: number;
};

/**
 * Rebuild an in-progress quiz from a saved session, remapping answers and
 * confidence BY QUESTION ID (not array index). If a question was deleted from
 * the DB since the session was saved, the remaining answers stay aligned with
 * their questions instead of shifting. Deleted questions are dropped and the
 * resume index is clamped to the surviving quiz length.
 */
export function rebuildResumedQuiz(saved: SavedSessionData, questionMap: Map<string, Question>): RebuiltSession {
  const savedIds = saved.questionIds;
  const answersById: Record<string, string | null> = {};
  const confidenceById: Record<string, string | null> = {};
  savedIds.forEach((id, i) => {
    answersById[id] = saved.answers[i] ?? null;
    confidenceById[id] = saved.confidence[i] ?? null;
  });

  const quiz = savedIds.map((id) => questionMap.get(id)).filter((q): q is Question => !!q);
  const answers = quiz.map((q) => answersById[q[KEYS.ID]] ?? null);
  const confidence = quiz.map((q) => (confidenceById[q[KEYS.ID]] ?? null) as ConfidenceLevel | null);
  const validIndex = quiz.length > 0 ? Math.min(saved.index, quiz.length - 1) : 0;

  return { quiz, answers, confidence, validIndex };
}
