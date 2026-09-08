import { KEYS, type HistoryEntry, type LearningBaseline, type Question } from './types';

export function captureLearningBaseline(history: Record<string, HistoryEntry>): LearningBaseline {
  return { lastResults: Object.fromEntries(Object.entries(history)
    .filter(([, entry]) => entry.answered > 0)
    .map(([id, entry]) => [id, entry.lastResult])) };
}

export type QuestionChange = 'new' | 'corrected' | 'repeated-error' | 'needs-refresh' | 'retained' | 'skipped' | 'unscored' | 'unknown';
export const questionChangeLabel: Record<QuestionChange, string> = {
  new: 'שאלה חדשה עבורך', corrected: 'טעות קודמת תוקנה', 'repeated-error': 'טעות שחזרה',
  'needs-refresh': 'הצלחת בעבר — כדאי לחזור', retained: 'הצלחה חוזרת', skipped: 'טרם נענתה',
  unscored: 'ללא מפתח תשובה תקין', unknown: 'אין השוואה למענה קודם',
};

const percent = (part: number, total: number) => total ? part * 100 / total : null;

export function buildSessionInsights({ bank, quiz, answers, baseline, history, historyAvailable = true }: {
  bank: readonly Question[];
  quiz: readonly Question[];
  answers: readonly (string | null)[];
  baseline?: LearningBaseline;
  history: Record<string, HistoryEntry>;
  historyAvailable?: boolean;
}) {
  const progressAvailable = !!baseline || historyAvailable;
  const eligible = new Map(bank.map(q => [q[KEYS.ID], q]));
  const before = baseline ? new Map(Object.entries(baseline.lastResults)) : null;
  const after = new Map(Object.entries((baseline ?? captureLearningBaseline(history)).lastResults));
  const seen = new Set<string>();
  const questions = quiz.flatMap((q, index) => {
    const id = q[KEYS.ID];
    if (seen.has(id)) return [];
    seen.add(id);
    const userAns = answers[index] ?? null;
    const correctAns = q[KEYS.CORRECT];
    const isCorrect = userAns && ['A', 'B', 'C', 'D'].includes(correctAns) ? userAns === correctAns : null;
    const previous = before?.get(id);
    let change: QuestionChange = 'unknown';
    if (!userAns) change = 'skipped';
    else if (isCorrect === null) change = 'unscored';
    else if (before) {
      if (!before.has(id)) change = 'new';
      else if (previous === 'wrong') change = isCorrect ? 'corrected' : 'repeated-error';
      else if (previous === 'correct') change = isCorrect ? 'retained' : 'needs-refresh';
    }
    if (userAns && eligible.has(id)) after.set(id, isCorrect === null ? null : isCorrect ? 'correct' : 'wrong');
    return [{ q, id, index, topic: q[KEYS.TOPIC] || 'כללי', userAns, correctAns, isCorrect, change }];
  });

  // One pass over the available bank; deleted/inaccessible history never
  // contributes to coverage or its denominator.
  const groups = new Map<string, string[]>();
  for (const [id, q] of eligible) {
    const topic = q[KEYS.TOPIC] || 'כללי';
    if (!groups.has(topic)) groups.set(topic, []);
    groups.get(topic)!.push(id);
  }
  const progressFor = (ids: string[]) => {
    const coveredBefore = before ? ids.filter(id => before.has(id)).length : null;
    const coveredAfter = ids.filter(id => after.has(id)).length;
    const latestCorrectBefore = before ? ids.filter(id => before.get(id) === 'correct').length : null;
    const latestCorrectAfter = ids.filter(id => after.get(id) === 'correct').length;
    return {
      total: ids.length, coveredBefore, coveredAfter, latestCorrectBefore, latestCorrectAfter,
      coverageBefore: coveredBefore === null ? null : percent(coveredBefore, ids.length),
      coverageAfter: percent(coveredAfter, ids.length),
      newCount: coveredBefore === null ? null : coveredAfter - coveredBefore,
    };
  };
  const sessionStats = (rows: typeof questions) => {
    const answered = rows.filter(q => q.userAns).length;
    const scored = rows.filter(q => q.isCorrect !== null).length;
    const correct = rows.filter(q => q.isCorrect === true).length;
    return {
      answered, scored, correct, skipped: rows.length - answered, accuracy: percent(correct, scored),
      wrong: scored - correct,
      correctedCount: before ? rows.filter(q => q.change === 'corrected').length : null,
      repeatedErrors: rows.filter(q => q.change === 'repeated-error').length,
    };
  };
  const overall = { ...progressFor([...eligible.keys()]), ...sessionStats(questions) };
  const topicRows = new Map<string, typeof questions>();
  for (const question of questions) {
    if (!topicRows.has(question.topic)) topicRows.set(question.topic, []);
    topicRows.get(question.topic)!.push(question);
  }
  const topics = [...topicRows].map(([topic, rows]) => ({ topic, ...progressFor(groups.get(topic) ?? []), ...sessionStats(rows) }));
  const recommendations = [...topics]
    .sort((a, b) => b.repeatedErrors - a.repeatedErrors || b.wrong - a.wrong || b.skipped - a.skipped)
    .slice(0, 3)
    .map(topic => {
      if (topic.wrong) return {
        topic: topic.topic, kind: 'review' as const, source: 'mistakes' as const,
        title: `לחזק את ${topic.topic}`,
        reason: `${topic.wrong} תשובות שגויות במפגש${topic.repeatedErrors ? `, מתוכן ${topic.repeatedErrors} טעויות שחזרו` : ''}. קרא את ההסברים ואז חזור לתרגול בנושא.`,
      };
      if (topic.skipped) return {
        topic: topic.topic, kind: 'continue' as const, source: 'all' as const,
        title: `להמשיך ב${topic.topic}`,
        reason: `${topic.skipped} שאלות נשארו ללא מענה. אפשר להשלים בקצב שלך.`,
      };
      if (topic.scored === 0) return {
        topic: topic.topic, kind: 'continue' as const, source: 'all' as const,
        title: `להמשיך ב${topic.topic}`,
        reason: 'אין במפגש הזה תשובות שניתן לחשב מהן הצלחה בנושא. אפשר לבחור שאלות נוספות.',
      };
      if (!progressAvailable) return {
        topic: topic.topic, kind: 'continue' as const, source: 'all' as const,
        title: `להמשיך ב${topic.topic}`,
        reason: 'אפשר לבחור מפגש נוסף. המלצה על הרחבת הכיסוי תתאפשר כשההיסטוריה תהיה זמינה.',
      };
      if (topic.coveredAfter < topic.total) return {
        topic: topic.topic, kind: 'explore' as const, source: 'all' as const,
        title: `להרחיב כיסוי ב${topic.topic}`,
        reason: `${topic.correct} מתוך ${topic.scored} תשובות נכונות במפגש. עוד ${topic.total - topic.coveredAfter} שאלות בנושא טרם נענו — אפשר להמשיך אליהן.`,
      };
      return {
        topic: topic.topic, kind: 'maintain' as const, source: 'all' as const,
        title: `לשמר את הלמידה ב${topic.topic}`,
        reason: 'כיסית את המאגר הזמין בנושא. אפשר לבחור נושא נוסף ולשלב חזרות בהמשך.',
      };
    });
  return { baselineAvailable: before !== null, progressAvailable, overall, topics, questions, recommendations };
}

export type SessionInsights = ReturnType<typeof buildSessionInsights>;
