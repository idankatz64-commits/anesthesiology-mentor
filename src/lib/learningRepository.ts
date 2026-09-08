// Learning evidence (migration 20260908000002): owner-scoped rows from
// immutable submitted attempts, mapped 1:1 into the reviewed learningInsights
// engine. No question content ever arrives here — the RPC only returns ids,
// outcome, confidence, server confirm time, frozen chapter and access scope.
import { rpc } from '@/lib/attemptsRepository';
import { supabase } from '@/integrations/supabase/client';
import { managementProjection, type AttemptEvidence, type LearningReport, type Recommendation, type SourceScope } from '@/lib/learningInsights';

export type LearningEvidenceRow = AttemptEvidence & {
  attemptId: string;
  rootId: string;
  /** 'simulation' = self-run simulation (scored like an exam, labelled, never an official quiz). */
  kind: 'simulation' | null;
  /** Frozen at attempt time; may differ from the live bank after an edit. */
  chapter: number | null;
  /** Access scope of the frozen source; a revoked national grant keeps the row, hides the content. */
  scope: SourceScope;
  answerMs: number | null;
  scored: boolean;
  priorExposures: number;
};

const SCOPES: readonly SourceScope[] = ['core', 'national', 'unclassified'];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapRow = (r: any): LearningEvidenceRow => ({
  questionId: String(r.question_id),
  attemptId: String(r.attempt_id),
  rootId: String(r.root_id),
  mode: r.mode === 'practice' ? 'practice' : 'exam',
  kind: r.kind === 'simulation' ? 'simulation' : null,
  feedbackTiming: r.feedback_timing === 'immediate' ? 'immediate' : 'end',
  answeredAt: new Date(r.confirmed_at).getTime(),
  isCorrect: typeof r.is_correct === 'boolean' ? r.is_correct : null,
  confidence: r.confidence === 'confident' || r.confidence === 'hesitant' || r.confidence === 'guessed' ? r.confidence : null,
  recommendationId: r.recommendation_id ?? null,
  chapter: Number.isFinite(Number(r.chapter)) && r.chapter != null ? Number(r.chapter) : null,
  // server 'open' == engine 'core' (same classifier, different label)
  scope: r.scope === 'open' ? 'core' : SCOPES.includes(r.scope) ? r.scope : 'unclassified',
  answerMs: r.answer_ms ?? null,
  scored: !!r.scored,
  priorExposures: Number(r.prior_exposures ?? 0),
});

/** Every confirmed answer of every submitted attempt of the caller, oldest first. No cache: identity changes must never reuse a previous user's rows. */
export const fetchLearningEvidence = async (): Promise<LearningEvidenceRow[]> => {
  const rows = await rpc<unknown>('learning_evidence_read', {});
  return Array.isArray(rows) ? rows.filter(r => r && !Number.isNaN(new Date(r.confirmed_at).getTime())).map(mapRow) : [];
};

/** Records that an open attempt followed a recommendation. Provenance only — the engine's follow-up never claims causality. */
export const linkRecommendation = (attemptId: string, recommendation: Pick<Recommendation, 'id' | 'kind' | 'setup' | 'provenance'>) =>
  rpc<void>('learning_recommendation_link', {
    _attempt_id: attemptId,
    _recommendation: { id: recommendation.id, kind: recommendation.kind, setup: recommendation.setup, provenance: recommendation.provenance },
  });

/** The only shape that leaves the learner: approved coverage/success projection, nothing else. */
export const managementExport = (report: LearningReport) => managementProjection(report);

// ---- Owner-only management aggregate (management_aggregate_read, same migration) ----
// Server authority: editorial owner only, active roster only, approved coverage/success only.
// The client re-applies the allowlist so nothing beyond it can ever reach a table or a file.
export type AggregateMeasure = { coveragePercent: number | null; successPercent: number | null };
export type ManagementResident = { memberId: string; fullName: string; residencyYear: number | null; overall: AggregateMeasure; chapters: (AggregateMeasure & { chapter: number })[] };
export type ManagementAggregate = { curriculumVersion: string; generatedAt: string; residents: ManagementResident[] };
export const MANAGEMENT_ERROR_CODES = ['NOT_AUTHENTICATED', 'NOT_OWNER', 'NOT_CONFIGURED'] as const;
const MANAGEMENT_HEBREW: Record<string, string> = {
  NOT_AUTHENTICATED: 'יש להתחבר מחדש כדי להמשיך.',
  NOT_OWNER: 'דוח הכיסוי של המחזור שמור לבעלים העריכתי בלבד.',
  NOT_CONFIGURED: 'אין עדיין גרסת ליבה מאושרת, ולכן אין מכנה לדוח.',
};
export const managementErrorMessage = (error: unknown): string =>
  MANAGEMENT_HEBREW[error instanceof Error ? error.message : ''] ?? 'הדוח לא נטען מהשרת. בדקו את החיבור ונסו שוב.';
const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const measure = (m: any): AggregateMeasure => ({ coveragePercent: num(m?.coverage_percent), successPercent: num(m?.success_percent) });
export const fetchManagementAggregate = async (): Promise<ManagementAggregate> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)('management_aggregate_read', {});
  if (error) throw new Error(MANAGEMENT_ERROR_CODES.find(c => String(error.message ?? '').includes(c)) ?? 'MANAGEMENT_UNAVAILABLE');
  return {
    curriculumVersion: String(data?.curriculum_version ?? ''),
    generatedAt: String(data?.generated_at ?? ''),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    residents: (Array.isArray(data?.residents) ? data.residents : []).map((r: any) => ({
      memberId: String(r.member_id), fullName: String(r.full_name ?? ''), residencyYear: num(r.residency_year),
      overall: measure(r.overall),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      chapters: (Array.isArray(r.chapters) ? r.chapters : []).map((c: any) => ({ chapter: Number(c.chapter), ...measure(c) })),
    })),
  };
};

/** CSV of the approved aggregate only: one row per resident × chapter plus an overall row. */
export function managementAggregateCsv(a: ManagementAggregate): string {
  const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = a.residents.flatMap(r => [
    [r.fullName, r.residencyYear, 'overall', r.overall.coveragePercent, r.overall.successPercent],
    ...r.chapters.map(c => [r.fullName, r.residencyYear, c.chapter, c.coveragePercent, c.successPercent]),
  ]);
  return [['full_name', 'residency_year', 'chapter', 'coverage_percent', 'success_percent'], ...rows].map(row => row.map(cell).join(',')).join('\n');
}
