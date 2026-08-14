// Pure aggregation for the academy progress charts (wave A.6).
// Two sources of truth by design: the server-frozen score/total on an attempt
// (used for overall trend) and per-domain recomputation against the CURRENT
// question bank (used for domain breakdowns — no per-question result is
// stored). Same rule the dashboard's domain table already applies.
import {
  ACADEMY_DOMAINS,
  UNCLASSIFIED_DOMAIN,
  domainOfChapter,
} from "./academyDomains";

export interface AttemptLike {
  quiz_id: string;
  user_id: string;
  question_ids: string[];
  answers: (string | null)[];
  score: number;
  total: number;
}

export interface QuizLike {
  id: string;
  title: string;
  opens_at: string;
}

/** Resolves a question id to what grading needs. Returns undefined if the question left the bank. */
export type QuestionResolver = (
  id: string,
) => { chapter: number | null; correct: string } | undefined;

export interface Tally {
  answered: number;
  correct: number;
}

export const DOMAIN_ORDER: string[] = [
  ...ACADEMY_DOMAINS.map((d) => d.label),
  UNCLASSIFIED_DOMAIN,
];

export const pct = (t: Tally): number | null =>
  t.answered > 0 ? Math.round((100 * t.correct) / t.answered) : null;

/** Per-domain answered/correct for one or more attempts. */
export function tallyByDomain(
  attempts: AttemptLike[],
  resolve: QuestionResolver,
): Map<string, Tally> {
  const byDomain = new Map<string, Tally>();
  for (const attempt of attempts) {
    attempt.question_ids.forEach((qid, i) => {
      const answer = attempt.answers[i];
      if (!answer) return;
      const question = resolve(qid);
      const domain = domainOfChapter(question ? question.chapter : null);
      const tally = byDomain.get(domain) ?? { answered: 0, correct: 0 };
      tally.answered++;
      if (question && answer === question.correct) tally.correct++;
      byDomain.set(domain, tally);
    });
  }
  return byDomain;
}

export const sortQuizzesChronologically = <T extends { opens_at: string }>(
  quizzes: T[],
): T[] =>
  [...quizzes].sort((a, b) => Date.parse(a.opens_at) - Date.parse(b.opens_at));

export interface TrendPoint {
  quiz: string;
  mine: number | null;
  cohort: number | null;
}

/** Overall score per quiz for one member, against the cohort average of that quiz. */
export function personalTrend(
  quizzes: QuizLike[],
  attempts: AttemptLike[],
  userId: string,
): TrendPoint[] {
  return sortQuizzesChronologically(quizzes).map((quiz) => {
    const onQuiz = attempts.filter((a) => a.quiz_id === quiz.id && a.total > 0);
    const mine = onQuiz.find((a) => a.user_id === userId);
    const cohortAvg = onQuiz.length
      ? Math.round(
          onQuiz.reduce((sum, a) => sum + (100 * a.score) / a.total, 0) /
            onQuiz.length,
        )
      : null;
    return {
      quiz: quiz.title,
      mine: mine ? Math.round((100 * mine.score) / mine.total) : null,
      cohort: cohortAvg,
    };
  });
}

/** Per-domain score per quiz for one member. Domains the member never answered are omitted. */
export function domainTrend(
  quizzes: QuizLike[],
  attempts: AttemptLike[],
  userId: string,
  resolve: QuestionResolver,
): { domains: string[]; points: Record<string, string | number | null>[] } {
  const mine = attempts.filter((a) => a.user_id === userId);
  const touched = new Set(tallyByDomain(mine, resolve).keys());
  const domains = DOMAIN_ORDER.filter((d) => touched.has(d));
  const points = sortQuizzesChronologically(quizzes).map((quiz) => {
    const tallies = tallyByDomain(
      mine.filter((a) => a.quiz_id === quiz.id),
      resolve,
    );
    const point: Record<string, string | number | null> = { quiz: quiz.title };
    for (const domain of domains) {
      const tally = tallies.get(domain);
      point[domain] = tally ? pct(tally) : null;
    }
    return point;
  });
  return { domains, points };
}

export interface HeatCell {
  domain: string;
  pct: number | null;
  answered: number;
}

/** Member × domain matrix, rows in the given member order, columns in DOMAIN_ORDER. */
export function heatmap(
  members: { id: string; label: string; userId: string | null }[],
  attempts: AttemptLike[],
  resolve: QuestionResolver,
): {
  domains: string[];
  rows: { id: string; label: string; cells: HeatCell[] }[];
} {
  const perMember = members.map((member) => ({
    member,
    tallies: member.userId
      ? tallyByDomain(
          attempts.filter((a) => a.user_id === member.userId),
          resolve,
        )
      : new Map<string, Tally>(),
  }));
  const domains = DOMAIN_ORDER.filter((d) =>
    perMember.some(({ tallies }) => (tallies.get(d)?.answered ?? 0) > 0),
  );
  return {
    domains,
    rows: perMember.map(({ member, tallies }) => ({
      id: member.id,
      label: member.label,
      cells: domains.map((domain) => {
        const tally = tallies.get(domain) ?? { answered: 0, correct: 0 };
        return { domain, pct: pct(tally), answered: tally.answered };
      }),
    })),
  };
}

export interface CohortDomainStrength {
  domain: string;
  pct: number;
  answered: number;
}

/** Cohort-wide score per domain, weakest first — the meeting agenda. */
export function cohortStrength(
  attempts: AttemptLike[],
  resolve: QuestionResolver,
): CohortDomainStrength[] {
  const tallies = tallyByDomain(attempts, resolve);
  return DOMAIN_ORDER.flatMap((domain) => {
    const tally = tallies.get(domain);
    const value = tally ? pct(tally) : null;
    return value === null || !tally
      ? []
      : [{ domain, pct: value, answered: tally.answered }];
  }).sort((a, b) => a.pct - b.pct);
}
