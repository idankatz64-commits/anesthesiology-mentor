import { useMemo, useState, useEffect } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { getChapterDisplay } from '@/data/millerChapters';

export type TopicStat = {
  topic: string;
  totalInDb: number;
  totalAnswered: number;
  correct: number;
  wrong: number;
  accuracy: number;
  smartScore: number;
  trend: 'up' | 'down' | 'neutral';
};

export type DailyData = { date: string; count: number; correct: number; rate: number };

export type WeakZone = {
  deadZone: string[];      // wrong 3+ times
  studiedNotLearned: string[]; // <50% accuracy
  mastered: string[];      // >=50% accuracy
};

export type ForgettingRisk = {
  topic: string;
  risk: number;
  daysSince: number;
  accuracy: number;
};

export function calcSmartScore(answered: number, accuracy: number): number {
  return Math.round(((answered / (answered + 10)) * accuracy) + ((10 / (answered + 10)) * 50));
}

function toIsraelDateStr(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
}

export function linearRegression(data: { x: number; y: number }[]) {
  const n = data.length;
  if (n < 2) return null;
  const sumX = data.reduce((s, d) => s + d.x, 0);
  const sumY = data.reduce((s, d) => s + d.y, 0);
  const sumXY = data.reduce((s, d) => s + d.x * d.y, 0);
  const sumX2 = data.reduce((s, d) => s + d.x * d.x, 0);
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

export type PersonalStats = {
  totalAttempts: number;
  uniqueQuestions: number;
  totalErrors: number;
  corrected: number;
  uncorrected: number;
  repeatedErrors: number;
};

export type DetailedAnswer = {
  question_id: string;
  topic: string | null;
  answered_count: number;
  correct_count: number;
  is_correct: boolean;
  ever_wrong: boolean;
};

export function useStatsData() {
  const { data, progress } = useApp();
  const [dailyData90, setDailyData90] = useState<DailyData[]>([]);
  const [spacedRep, setSpacedRep] = useState<any[]>([]);
  const [personalStats, setPersonalStats] = useState<PersonalStats>({
    totalAttempts: 0, uniqueQuestions: 0, totalErrors: 0,
    corrected: 0, uncorrected: 0, repeatedErrors: 0,
  });

  const [detailedAnswers, setDetailedAnswers] = useState<DetailedAnswer[]>([]);
  const [repeatedErrorsByTopic, setRepeatedErrorsByTopic] = useState<Record<string, number>>({});

  // Fetch 90-day daily data + spaced repetition
  useEffect(() => {
    const fetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;

      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 89);
      const startStr = startDate.toISOString().split('T')[0];

      const [answersRes, srRes] = await Promise.all([
        supabase
          .from('user_answers')
          .select('updated_at, is_correct, topic')
          .eq('user_id', session.user.id)
          .gte('updated_at', startStr + 'T00:00:00Z'),
        supabase
          .from('spaced_repetition')
          .select('question_id, next_review_date, last_correct, updated_at, confidence')
          .eq('user_id', session.user.id),
      ]);

      // Build 30-day buckets
      const buckets: Record<string, { count: number; correct: number }> = {};
      for (let i = 0; i < 90; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (89 - i));
        buckets[toIsraelDateStr(d)] = { count: 0, correct: 0 };
      }
      (answersRes.data || []).forEach((r: any) => {
        const day = toIsraelDateStr(new Date(r.updated_at));
        if (buckets[day]) {
          buckets[day].count++;
          if (r.is_correct) buckets[day].correct++;
        }
      });
      setDailyData90(
        Object.entries(buckets).map(([date, v]) => ({
          date, count: v.count, correct: v.correct,
          rate: v.count > 0 ? Math.round((v.correct / v.count) * 100) : 0,
        }))
      );

      setSpacedRep(srRes.data || []);

      // Personal stats from user_answers
      const { data: allAnswers } = await supabase
        .from('user_answers')
        .select('question_id, topic, answered_count, correct_count, is_correct, ever_wrong')
        .eq('user_id', session.user.id);

      if (allAnswers) {
        let totalAttempts = 0, totalCorrect = 0, corrected = 0, uncorrected = 0, repeatedErrors = 0;
        const errByTopic: Record<string, number> = {};
        for (const row of allAnswers) {
          totalAttempts += row.answered_count;
          totalCorrect += row.correct_count;
          if (row.ever_wrong && row.is_correct) corrected++;
          if (row.ever_wrong && !row.is_correct) uncorrected++;
          if ((row.answered_count - row.correct_count) > 1) {
            repeatedErrors++;
            const t = row.topic || 'ללא נושא';
            errByTopic[t] = (errByTopic[t] || 0) + 1;
          }
        }
        setPersonalStats({
          totalAttempts,
          uniqueQuestions: allAnswers.length,
          totalErrors: totalAttempts - totalCorrect,
          corrected, uncorrected, repeatedErrors,
        });
        setDetailedAnswers(allAnswers as DetailedAnswer[]);
        setRepeatedErrorsByTopic(errByTopic);
      }
    };
    fetch();
  }, [progress]);

  const dailyData30 = useMemo(() => dailyData90.slice(-30), [dailyData90]);
  const dailyData14 = useMemo(() => dailyData90.slice(-14), [dailyData90]);

  // Core stats
  const stats = useMemo(() => {
    let totalUnique = 0, correctUnique = 0, totalAttempts = 0;
    const topicMap: Record<string, { totalAnswered: number; correct: number; wrong: number; answered: number }> = {};
    const topicDbCount: Record<string, number> = {};

    data.forEach(q => {
      const t = q[KEYS.TOPIC] || 'Uncategorized';
      topicDbCount[t] = (topicDbCount[t] || 0) + 1;
    });

    Object.entries(progress.history).forEach(([id, h]) => {
      totalUnique++;
      if (h.lastResult === 'correct') correctUnique++;
      totalAttempts += h.answered;
      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const t = q[KEYS.TOPIC] || 'Uncategorized';
        if (!topicMap[t]) topicMap[t] = { totalAnswered: 0, correct: 0, wrong: 0, answered: 0 };
        topicMap[t].totalAnswered++;
        topicMap[t].answered += h.answered;
        if (h.lastResult === 'correct') topicMap[t].correct++;
        else topicMap[t].wrong++;
      }
    });

    const accuracy = totalUnique > 0 ? Math.round((correctUnique / totalUnique) * 100) : 0;
    const coverage = data.length > 0 ? Math.round((totalUnique / data.length) * 100) : 0;

    const topicData: TopicStat[] = Object.entries(topicMap).map(([topic, s]) => {
      const acc = s.totalAnswered > 0 ? Math.round((s.correct / s.totalAnswered) * 100) : 0;
      return {
        topic,
        totalInDb: topicDbCount[topic] || 0,
        totalAnswered: s.totalAnswered,
        correct: s.correct,
        wrong: s.wrong,
        accuracy: acc,
        smartScore: calcSmartScore(s.totalAnswered, acc),
        trend: 'neutral' as const,
      };
    });

    return { totalUnique, correctUnique, totalAttempts, accuracy, coverage, topicData };
  }, [data, progress]);

  // Study streak
  const streak = useMemo(() => {
    let count = 0;
    const today = new Date();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = toIsraelDateStr(d);
      const dayData = dailyData30.find(dd => dd.date === key);
      if (dayData && dayData.count > 0) count++;
      else if (i > 0) break; // Allow today to be empty
    }
    return count;
  }, [dailyData30]);

  // ERI
  const eri = useMemo(() => {
    const { accuracy, coverage, topicData } = stats;
    // critical_topic_avg = avg smart score of bottom 10 topics
    const sorted = [...topicData].sort((a, b) => a.smartScore - b.smartScore);
    const bottom10 = sorted.slice(0, Math.min(10, sorted.length));
    const criticalAvg = bottom10.length > 0
      ? Math.round(bottom10.reduce((s, t) => s + t.smartScore, 0) / bottom10.length)
      : 50;

    // consistency = active days in last 14 / 14
    const activeDays14 = dailyData14.filter(d => d.count > 0).length;
    const consistency = Math.round((activeDays14 / 14) * 100);

    const eriValue = Math.round(
      accuracy * 0.25 + coverage * 0.25 + criticalAvg * 0.30 + consistency * 0.20
    );

    return {
      value: Math.min(100, Math.max(0, eriValue)),
      accuracy,
      coverage,
      criticalAvg,
      consistency,
    };
  }, [stats, dailyData14]);

  // Accuracy trend
  const accuracyTrend = useMemo<'up' | 'down' | 'neutral'>(() => {
    if (dailyData14.length < 14) return 'neutral';
    const recent = dailyData14.slice(7).filter(d => d.count > 0);
    const older = dailyData14.slice(0, 7).filter(d => d.count > 0);
    if (recent.length === 0 || older.length === 0) return 'neutral';
    const recentAvg = recent.reduce((s, d) => s + d.rate, 0) / recent.length;
    const olderAvg = older.reduce((s, d) => s + d.rate, 0) / older.length;
    if (recentAvg > olderAvg + 3) return 'up';
    if (recentAvg < olderAvg - 3) return 'down';
    return 'neutral';
  }, [dailyData14]);

  // Weak zones
  const weakZones = useMemo<WeakZone>(() => {
    const deadZone: string[] = [];
    const studiedNotLearned: string[] = [];
    const mastered: string[] = [];

    Object.entries(progress.history).forEach(([id, h]) => {
      const wrongCount = h.answered - h.correct;
      if (wrongCount >= 3) deadZone.push(id);
      else if (h.answered > 0 && (h.correct / h.answered) < 0.5) studiedNotLearned.push(id);
      else if (h.answered > 0) mastered.push(id);
    });

    return { deadZone, studiedNotLearned, mastered };
  }, [progress]);

  // Forgetting risk
  const forgettingRisk = useMemo<ForgettingRisk[]>(() => {
    const topicLastAttempt: Record<string, { lastDate: Date; correct: number; total: number }> = {};

    Object.entries(progress.history).forEach(([id, h]) => {
      const q = data.find(x => x[KEYS.ID] === id);
      if (!q) return;
      const t = q[KEYS.TOPIC] || 'Uncategorized';
      const d = new Date(h.timestamp);
      if (!topicLastAttempt[t]) topicLastAttempt[t] = { lastDate: d, correct: 0, total: 0 };
      if (d > topicLastAttempt[t].lastDate) topicLastAttempt[t].lastDate = d;
      topicLastAttempt[t].total++;
      topicLastAttempt[t].correct += h.correct > 0 ? 1 : 0;
    });

    const now = new Date();
    return Object.entries(topicLastAttempt)
      .map(([topic, info]) => {
        const daysSince = Math.max(0, Math.floor((now.getTime() - info.lastDate.getTime()) / (1000 * 60 * 60 * 24)));
        const accuracy = info.total > 0 ? info.correct / info.total : 0;
        const risk = (daysSince / 7) * (1 - accuracy);
        return { topic, risk: Math.round(risk * 100) / 100, daysSince, accuracy: Math.round(accuracy * 100) };
      })
      .filter(r => r.risk > 0)
      .sort((a, b) => b.risk - a.risk);
  }, [progress, data]);

  // Chapter coverage for heatmap
  const chapterCoverage = useMemo(() => {
    const chapterTotal: Record<number, number> = {};
    const chapterAnswered: Record<number, number> = {};

    data.forEach(q => {
      const ch = q[KEYS.CHAPTER] || 0;
      chapterTotal[ch] = (chapterTotal[ch] || 0) + 1;
    });

    Object.entries(progress.history).forEach(([id]) => {
      const q = data.find(x => x[KEYS.ID] === id);
      if (q) {
        const ch = q[KEYS.CHAPTER] || 0;
        chapterAnswered[ch] = (chapterAnswered[ch] || 0) + 1;
      }
    });

    return Object.keys(chapterTotal)
      .map(Number)
      .sort((a, b) => a - b)
      .map(ch => ({
        chapter: ch,
        chapterName: getChapterDisplay(ch),
        total: chapterTotal[ch],
        answered: chapterAnswered[ch] || 0,
        pct: chapterTotal[ch] > 0 ? Math.round(((chapterAnswered[ch] || 0) / chapterTotal[ch]) * 100) : 0,
      }));
  }, [data, progress]);

  // Trend data with regression line
  const trendData14 = useMemo(() => {
    const activeDays = dailyData14.filter(d => d.count > 0);
    if (activeDays.length < 2) return dailyData14.map(d => ({ ...d, trend: undefined as number | undefined }));
    const points = activeDays.map((d) => ({ x: dailyData14.indexOf(d), y: d.rate }));
    const reg = linearRegression(points);
    if (!reg) return dailyData14.map(d => ({ ...d, trend: undefined as number | undefined }));
    return dailyData14.map((d, i) => ({
      ...d,
      trend: Math.max(0, Math.min(100, Math.round(reg.intercept + reg.slope * i))),
    }));
  }, [dailyData14]);

  const trendData30 = useMemo(() => {
    const activeDays = dailyData30.filter(d => d.count > 0);
    if (activeDays.length < 2) return dailyData30.map(d => ({ ...d, trend: undefined as number | undefined }));
    const points = activeDays.map((d) => ({ x: dailyData30.indexOf(d), y: d.rate }));
    const reg = linearRegression(points);
    if (!reg) return dailyData30.map(d => ({ ...d, trend: undefined as number | undefined }));
    return dailyData30.map((d, i) => ({
      ...d,
      trend: Math.max(0, Math.min(100, Math.round(reg.intercept + reg.slope * i))),
    }));
  }, [dailyData30]);

  return {
    stats,
    eri,
    streak,
    accuracyTrend,
    weakZones,
    forgettingRisk,
    chapterCoverage,
    dailyData14,
    dailyData30,
    dailyData90,
    trendData14,
    trendData30,
    personalStats,
    detailedAnswers,
    repeatedErrorsByTopic,
  };
}
