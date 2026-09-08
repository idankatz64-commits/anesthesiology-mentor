import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { buildLearningReport, type LearningReport } from '@/lib/learningInsights';
import { fetchLearningEvidence, type LearningEvidenceRow } from '@/lib/learningRepository';
import { attemptErrorMessage } from '@/lib/attemptsRepository';
import type { SrsRecord } from '@/lib/srsRepository';

export type LearningReportState =
  | { status: 'loading' }
  | { status: 'unavailable'; message: string }
  | { status: 'ready'; report: LearningReport };

type Loaded = { userId: string; evidence: LearningEvidenceRow[]; srs: Record<string, SrsRecord> };

/**
 * Evidence is fetched once per signed-in identity (never cached across users);
 * the report is recomputed locally whenever the bank or legacy history changes.
 */
export function useLearningReport(scope?: { chapters?: readonly number[] }): LearningReportState {
  const { data, progress, userId, fetchSrsData } = useApp();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tokenRef = useRef(0);

  useEffect(() => {
    const token = ++tokenRef.current;
    setLoaded(null);
    setError(null);
    if (!userId) return;
    Promise.all([fetchLearningEvidence(), fetchSrsData().catch(() => ({}) as Record<string, SrsRecord>)])
      .then(([evidence, srs]) => { if (token === tokenRef.current) setLoaded({ userId, evidence, srs }); })
      .catch((e) => { if (token === tokenRef.current) setError(attemptErrorMessage(e)); });
    return () => { tokenRef.current++; };
  }, [userId, fetchSrsData]);

  const chapterKey = scope?.chapters?.join(',') ?? '';
  const report = useMemo(() => {
    if (!loaded || loaded.userId !== userId) return null;
    return buildLearningReport({
      bank: data, evidence: loaded.evidence, legacyHistory: progress.history, srsData: loaded.srs, nowMs: Date.now(),
      scope: chapterKey ? { chapters: chapterKey.split(',').map(Number) } : undefined,
    });
  }, [loaded, userId, data, progress.history, chapterKey]);

  if (!userId) return { status: 'unavailable', message: 'יש להתחבר כדי לראות ניתוח למידה.' };
  if (error) return { status: 'unavailable', message: error };
  if (!report) return { status: 'loading' };
  return { status: 'ready', report };
}
