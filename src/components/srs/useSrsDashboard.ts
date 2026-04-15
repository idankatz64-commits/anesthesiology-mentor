import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { fetchQuestions as fetchQuestionsCsv } from '@/lib/csvService';
import { addDaysIsrael, daysBetween, getIsraelToday } from '@/lib/dateHelpers';

export interface DayBin { date: string; count: number; isOverdue: boolean; topics: string[]; }
export interface TopicRow { topic: string; due: number; overdue: number; accuracy: number; criticalScore: number; isCritical: boolean; }
export interface ChapterRow { chapter: number; totalInSrs: number; due: number; accuracy: number; }
export interface PendingQuestion { id: string; refId: string; questionShort: string; topic: string; chapter: number; nextReviewDate: string; daysOverdue: number; }
export type SessionFilter = { kind: 'all' } | { kind: 'random' } | { kind: 'topic'; topic: string } | { kind: 'chapter'; chapter: number };
export interface SrsDashboardData {
  loading: boolean; error: string | null;
  stats: { dueToday: number; overdue: number; totalPending: number; next7Days: number };
  decayBins: DayBin[]; topics: TopicRow[]; chapters: ChapterRow[]; pendingQuestions: PendingQuestion[];
  refresh: () => Promise<void>;
}

interface SrsRow { question_id: string; next_review_date: string; last_correct: boolean | null; }
interface QLike { id: string; ref_id?: string; topic?: string | null; chapter?: number | null; question?: string | null; }

export function aggregate(params: { srsRows: SrsRow[]; questions: QLike[]; today: string }) {
  const { srsRows, questions, today } = params;
  const qMap = new Map<string, QLike>(questions.map(q => [q.id, q]));
  const joined = srsRows
    .map(r => ({ srs: r, q: qMap.get(r.question_id) }))
    .filter((j): j is { srs: SrsRow; q: QLike } => !!j.q);

  let dueToday = 0, overdue = 0, next7Days = 0;
  const binMap = new Map<string, { count: number; topics: Set<string> }>();
  for (let i = 0; i < 30; i++) binMap.set(addDaysIsrael(today, i), { count: 0, topics: new Set() });

  const topicAgg = new Map<string, { due: number; overdue: number; correct: number; total: number }>();
  const chapterAgg = new Map<number, { totalInSrs: number; due: number; correct: number; total: number }>();

  for (const { srs, q } of joined) {
    const diff = daysBetween(today, srs.next_review_date);
    const topic = (q.topic ?? 'ללא נושא').trim() || 'ללא נושא';
    const chapter = q.chapter ?? 0;
    const correct = srs.last_correct === true ? 1 : 0;
    const hasHistory = srs.last_correct !== null ? 1 : 0;

    const t = topicAgg.get(topic) ?? { due: 0, overdue: 0, correct: 0, total: 0 };
    t.correct += correct; t.total += hasHistory;
    const c = chapterAgg.get(chapter) ?? { totalInSrs: 0, due: 0, correct: 0, total: 0 };
    c.totalInSrs += 1; c.correct += correct; c.total += hasHistory;

    if (diff < 0) { overdue++; t.overdue++; t.due++; c.due++; }
    else if (diff === 0) { dueToday++; t.due++; c.due++; }
    if (diff <= 7) next7Days++;

    if (diff >= 0 && diff < 30) {
      const bin = binMap.get(srs.next_review_date);
      if (bin) { bin.count++; bin.topics.add(topic); }
    }
    topicAgg.set(topic, t);
    chapterAgg.set(chapter, c);
  }

  const decayBins: DayBin[] = [];
  for (let i = 0; i < 30; i++) {
    const date = addDaysIsrael(today, i);
    const bin = binMap.get(date)!;
    decayBins.push({
      date,
      count: i === 0 ? bin.count + overdue : bin.count,
      isOverdue: i === 0 && overdue > 0,
      topics: Array.from(bin.topics),
    });
  }

  const topicsUnsorted: TopicRow[] = Array.from(topicAgg.entries()).map(([topic, a]) => {
    const accuracy = a.total > 0 ? a.correct / a.total : 0;
    const criticalScore = (1 - accuracy) * a.overdue;
    return { topic, due: a.due, overdue: a.overdue, accuracy, criticalScore, isCritical: false };
  });
  const scores = topicsUnsorted.map(t => t.criticalScore).sort((a, b) => a - b);
  const p75 = scores.length === 0 ? 0 : scores[Math.floor(scores.length * 0.75)];
  const topics = topicsUnsorted
    .map(t => ({ ...t, isCritical: t.criticalScore > 0 && t.criticalScore >= p75 }))
    .sort((a, b) => b.criticalScore - a.criticalScore)
    .slice(0, 10);

  const chapters: ChapterRow[] = Array.from(chapterAgg.entries())
    .map(([chapter, a]) => ({
      chapter, totalInSrs: a.totalInSrs, due: a.due,
      accuracy: a.total > 0 ? a.correct / a.total : 0,
    }))
    .sort((a, b) => a.chapter - b.chapter);

  const pendingQuestions: PendingQuestion[] = joined
    .filter(j => daysBetween(today, j.srs.next_review_date) <= 0)
    .map(({ srs, q }) => ({
      id: q.id,
      refId: q.ref_id ?? q.id,
      questionShort: (q.question ?? '').slice(0, 80),
      topic: (q.topic ?? 'ללא נושא'),
      chapter: q.chapter ?? 0,
      nextReviewDate: srs.next_review_date,
      daysOverdue: Math.max(0, -daysBetween(today, srs.next_review_date)),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);

  return { stats: { dueToday, overdue, totalPending: dueToday + overdue, next7Days }, decayBins, topics, chapters, pendingQuestions };
}

async function fetchAllSrsRows(userId: string): Promise<SrsRow[]> {
  const pageSize = 1000;
  const out: SrsRow[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('spaced_repetition')
      .select('question_id, next_review_date, last_correct')
      .eq('user_id', userId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...(data as SrsRow[]));
    if (data.length < pageSize) break;
  }
  return out;
}

export function useSrsDashboard(enabled: boolean): SrsDashboardData {
  const ctx = useApp();
  const questions = ctx.data;
  const [srsRows, setSrsRows] = useState<SrsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user?.id) { setSrsRows([]); return; }
      if (!questions || questions.length === 0) {
        try { await fetchQuestionsCsv(); } catch { /* non-fatal */ }
      }
      const rows = await fetchAllSrsRows(u.user.id);
      setSrsRows(rows);
    } catch (e: unknown) {
      console.error('useSrsDashboard refresh error:', e);
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת הנתונים');
    } finally { setLoading(false); }
  }, [questions]);

  useEffect(() => { if (enabled) refresh(); }, [enabled, refresh]);

  const agg = useMemo(() => aggregate({
    srsRows,
    questions: (questions ?? []) as unknown as QLike[],
    today: getIsraelToday(),
  }), [srsRows, questions]);

  return { loading, error, ...agg, refresh };
}
