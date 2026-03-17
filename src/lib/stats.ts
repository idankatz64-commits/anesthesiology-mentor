import { UserProgress, Question } from "./types";
import { LS_KEY } from "./types";

export interface TopicStat {
  topic: string;
  answered: number;
  correct: number;
  accuracy: number; // 0-100
}

export interface UserStatsForCoach {
  totalAnswered: number;
  totalCorrect: number;
  overallAccuracy: number;
  topicStats: TopicStat[]; // sorted worst first, min 3 answered
  weakTopics: TopicStat[];   // accuracy < 60%, min 5 answered
  strongTopics: TopicStat[]; // accuracy >= 80%, min 5 answered
  neverAttempted: string[];  // topic names with 0 answered
  totalQuestions: number;
  coveragePercent: number;   // % of question bank attempted
  examDaysLeft: number;
}

export function loadProgressFromStorage(): UserProgress | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as UserProgress;
  } catch {
    return null;
  }
}

export function computeUserStats(
  progress: UserProgress,
  questions: Question[]
): UserStatsForCoach {
  const history = progress.history ?? {};

  // Build topic lookup from questions
  const topicByQuestionId: Record<string, string> = {};
  for (const q of questions) {
    const topic = q.topic ?? "";
    if (q.id && topic) topicByQuestionId[q.id] = topic;
  }

  // Aggregate per topic
  const topicMap: Record<string, { answered: number; correct: number }> = {};

  let totalAnswered = 0;
  let totalCorrect = 0;

  for (const [qId, entry] of Object.entries(history)) {
    if (!entry || entry.answered === 0) continue;
    totalAnswered += entry.answered;
    totalCorrect += entry.correct;

    const topic = topicByQuestionId[qId];
    if (!topic) continue;

    if (!topicMap[topic]) topicMap[topic] = { answered: 0, correct: 0 };
    topicMap[topic].answered += entry.answered;
    topicMap[topic].correct += entry.correct;
  }

  // Build TopicStat array, sorted worst first
  const topicStats: TopicStat[] = Object.entries(topicMap)
    .filter(([, v]) => v.answered >= 3)
    .map(([topic, v]) => ({
      topic,
      answered: v.answered,
      correct: v.correct,
      accuracy: Math.round((v.correct / v.answered) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const MIN = 5;
  const weakTopics = topicStats.filter(t => t.answered >= MIN && t.accuracy < 60);
  const strongTopics = topicStats.filter(t => t.answered >= MIN && t.accuracy >= 80);

  // Topics never attempted
  const allTopics = new Set(questions.map(q => q.topic).filter(Boolean) as string[]);
  const attemptedTopics = new Set(Object.keys(topicMap));
  const neverAttempted = [...allTopics].filter(t => !attemptedTopics.has(t)).sort();

  // Days to exam (approximate: June 15, 2026)
  const examDate = new Date("2026-06-15");
  const today = new Date();
  const examDaysLeft = Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / 86400000));

  // Coverage
  const uniqueAttempted = Object.keys(history).filter(id => (history[id]?.answered ?? 0) > 0).length;
  const coveragePercent = questions.length > 0 ? Math.round((uniqueAttempted / questions.length) * 100) : 0;

  return {
    totalAnswered,
    totalCorrect,
    overallAccuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0,
    topicStats,
    weakTopics,
    strongTopics,
    neverAttempted,
    totalQuestions: questions.length,
    coveragePercent,
    examDaysLeft,
  };
}

export function formatStatsForClaude(stats: UserStatsForCoach): string {
  const lines: string[] = [];

  lines.push("=== נתוני ביצועים של המתמחה ===");
  lines.push(`שאלות שנענו: ${stats.totalAnswered} מתוך ${stats.totalQuestions} (${stats.coveragePercent}% כיסוי)`);
  lines.push(`דיוק כללי: ${stats.overallAccuracy}%`);
  lines.push(`ימים לבחינה: ${stats.examDaysLeft}`);
  lines.push("");

  if (stats.weakTopics.length > 0) {
    lines.push("=== נושאים חלשים (דיוק < 60%, מינימום 5 שאלות) ===");
    for (const t of stats.weakTopics.slice(0, 12)) {
      lines.push(`• ${t.topic}: ${t.accuracy}% (${t.correct}/${t.answered})`);
    }
    lines.push("");
  }

  if (stats.neverAttempted.length > 0) {
    lines.push(`=== נושאים שלא נוגעו כלל (${stats.neverAttempted.length} נושאים) ===`);
    lines.push(stats.neverAttempted.slice(0, 20).join(" | "));
    lines.push("");
  }

  if (stats.strongTopics.length > 0) {
    lines.push("=== נושאים חזקים (דיוק > 80%) ===");
    for (const t of stats.strongTopics.slice(0, 8)) {
      lines.push(`• ${t.topic}: ${t.accuracy}% (${t.answered} שאלות)`);
    }
    lines.push("");
  }

  if (stats.topicStats.length > 0) {
    lines.push("=== כל הנושאים (מהחלש לחזק) ===");
    for (const t of stats.topicStats) {
      lines.push(`${t.topic}: ${t.accuracy}% | ${t.answered} שאלות`);
    }
  }

  return lines.join("\n");
}
