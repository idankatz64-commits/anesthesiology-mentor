import type { Question, SessionMode } from "./types";

export type ReconcileResult = { ok: boolean; quiz: Question[]; missing: number; message: string | null };

/**
 * A legacy draft stores question ids only. If some no longer resolve (deleted,
 * or national access revoked since the save) an exam must not quietly continue
 * and be scored as the original paper. Practice may continue with what is left.
 */
export function reconcileSavedQuestions(savedIds: string[], questionMap: Map<string, Question>, mode: SessionMode): ReconcileResult {
  const quiz = savedIds.map((id) => questionMap.get(id)).filter((q): q is Question => !!q);
  const missing = savedIds.length - quiz.length;
  if (missing === 0) return { ok: true, quiz, missing, message: null };
  if (quiz.length === 0) return { ok: false, quiz, missing, message: "אף שאלה מהמפגש השמור אינה זמינה לחשבון שלך כרגע. אפשר למחוק את המפגש השמור." };
  if (mode === "exam") return {
    ok: false, quiz: [], missing,
    message: `${missing} מתוך ${savedIds.length} שאלות בבוחן השמור אינן זמינות לחשבון שלך כרגע, ולכן אי אפשר להמשיך את הבוחן המקורי. אפשר למחוק אותו ולהתחיל בוחן חדש.`,
  };
  return { ok: true, quiz, missing, message: `${missing} שאלות מהתרגול השמור אינן זמינות לחשבון שלך כרגע. ממשיכים עם ${quiz.length} שנותרו.` };
}
