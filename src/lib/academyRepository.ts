import { supabase } from "@/integrations/supabase/client";

export interface AcademyMembership {
  access_level: "academy" | "full";
  status: "active" | "suspended";
}

export interface AcademyMemberRow {
  id: string;
  email: string;
  full_name: string | null;
  user_id: string | null;
  access_level: string;
  status: string;
  created_at: string;
}

export interface QuizRow {
  id: string;
  title: string;
  quiz_type: "baseline" | "weekly";
  question_ids: string[];
  opens_at: string;
  closes_at: string;
  time_limit_minutes: number | null;
  created_at: string;
}

export interface QuizAttemptRow {
  id: string;
  quiz_id: string;
  user_id: string;
  question_ids: string[];
  answers: (string | null)[];
  score: number;
  total: number;
  submitted_at: string;
}

export interface CohortStats {
  submitted: number;
  avg_pct: number | null;
  median_pct: number | null;
}

// Academy tables are not in the generated types yet — same raw-query
// precedent as topic_summaries / saved_sessions casts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabase.from(name as never) as any;

function throwIfError(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if (error.code === "23505") throw new Error("ALREADY_SUBMITTED");
  if (error.code === "42501") throw new Error("WINDOW_CLOSED");
  throw new Error(error.message);
}

// ---------- pure helpers ----------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(text: string): { valid: string[]; invalid: string[] } {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const t of tokens) {
    if (!EMAIL_RE.test(t)) {
      if (!invalid.includes(t)) invalid.push(t);
    } else if (!valid.includes(t)) {
      valid.push(t);
    }
  }
  return { valid, invalid };
}

// ---------- member-facing ----------

export async function claimAcademyMembership(): Promise<AcademyMembership | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("claim_academy_membership");
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { access_level: row.access_level, status: row.status };
}

export async function fetchQuizzes(): Promise<QuizRow[]> {
  const { data, error } = await table("quizzes").select("*").order("opens_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as QuizRow[];
}

export async function fetchMyAttempts(userId: string): Promise<QuizAttemptRow[]> {
  const { data, error } = await table("quiz_attempts")
    .select("*")
    .eq("user_id", userId)
    .order("submitted_at", { ascending: false });
  throwIfError(error);
  return (data ?? []) as QuizAttemptRow[];
}

export async function submitQuizAttempt(
  quizId: string,
  questionIds: string[],
  answers: (string | null)[],
): Promise<{ score: number; total: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("submit_quiz_attempt", {
    _quiz_id: quizId,
    _question_ids: questionIds,
    _answers: answers,
  });
  if (error) {
    const message = error.message ?? "";
    if (message.includes("ALREADY_SUBMITTED")) throw new Error("ALREADY_SUBMITTED");
    if (message.includes("WINDOW_CLOSED")) throw new Error("WINDOW_CLOSED");
    if (message.includes("NOT_MEMBER")) throw new Error("NOT_MEMBER");
    if (message.includes("INCOMPLETE_SUBMISSION")) throw new Error("INCOMPLETE_SUBMISSION");
    if (message.includes("DUPLICATE_QUESTIONS")) throw new Error("DUPLICATE_QUESTIONS");
    throw new Error(error.message);
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { score: Number(row.score), total: Number(row.total) };
}

export async function fetchCohortStats(quizId: string): Promise<CohortStats | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)("quiz_cohort_stats", {
    _quiz_id: quizId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    submitted: Number(row.submitted ?? 0),
    avg_pct: row.avg_pct === null ? null : Number(row.avg_pct),
    median_pct: row.median_pct === null ? null : Number(row.median_pct),
  };
}

// ---------- admin ----------

export async function fetchMembers(): Promise<AcademyMemberRow[]> {
  const { data, error } = await table("academy_members").select("*").order("created_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as AcademyMemberRow[];
}

export async function addMembers(emails: string[]): Promise<void> {
  if (emails.length === 0) return;
  const rows = emails.map((email) => ({ email }));
  const { error } = await table("academy_members").upsert(rows, {
    onConflict: "email",
    ignoreDuplicates: true,
  });
  throwIfError(error);
}

export async function updateMember(
  id: string,
  patch: Partial<Pick<AcademyMemberRow, "full_name" | "access_level" | "status">>,
): Promise<void> {
  const { error } = await table("academy_members").update(patch).eq("id", id);
  throwIfError(error);
}

export async function deleteMember(id: string): Promise<void> {
  const { error } = await table("academy_members").delete().eq("id", id);
  throwIfError(error);
}

export interface NewQuiz {
  title: string;
  quiz_type: "baseline" | "weekly";
  question_ids: string[];
  opens_at: string;
  closes_at: string;
  created_by: string | null;
}

export async function createQuiz(input: NewQuiz): Promise<void> {
  const { error } = await table("quizzes").insert(input);
  throwIfError(error);
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await table("quizzes").delete().eq("id", id);
  throwIfError(error);
}

export async function fetchAllAttempts(): Promise<QuizAttemptRow[]> {
  const { data, error } = await table("quiz_attempts").select("*").order("submitted_at", { ascending: true });
  throwIfError(error);
  return (data ?? []) as QuizAttemptRow[];
}
