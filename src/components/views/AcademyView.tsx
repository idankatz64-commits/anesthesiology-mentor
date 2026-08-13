import { useEffect, useMemo, useState } from "react";
import { GraduationCap, Clock, CheckCircle2, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { KEYS, Question } from "@/lib/types";
import {
  fetchQuizzes,
  fetchMyAttempts,
  fetchCohortStats,
  QuizRow,
  QuizAttemptRow,
  CohortStats,
} from "@/lib/academyRepository";

const fmtDate = (iso: string): string =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function AcademyView() {
  const {
    data,
    startSession,
    invalidateQuestions,
    academyMember,
    savedSessionInfo,
    resumeSessionFromDb,
    loadingSavedSession,
  } = useApp();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [stats, setStats] = useState<Record<string, CohortStats | null>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [resuming, setResuming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const userId = userData?.user?.id;
        if (!userId) return;
        const [qs, ats] = await Promise.all([fetchQuizzes(), fetchMyAttempts(userId)]);
        if (cancelled) return;
        setQuizzes(qs);
        setAttempts(ats);
        const statEntries = await Promise.all(
          ats.map(async (a) => [a.quiz_id, await fetchCohortStats(a.quiz_id).catch(() => null)] as const),
        );
        if (!cancelled) setStats(Object.fromEntries(statEntries));
      } catch (e) {
        console.warn("Academy load failed:", e);
        toast.error("טעינת הבחנים נכשלה — נסה לרענן");
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const attemptByQuiz = useMemo(() => new Map(attempts.map((a) => [a.quiz_id, a])), [attempts]);

  const now = Date.now();
  const open = quizzes.filter(
    (q) => now >= Date.parse(q.opens_at) && now <= Date.parse(q.closes_at) && !attemptByQuiz.has(q.id),
  );
  const done = attempts;

  const isSuspended = academyMember?.status === "suspended";
  const hasSavedQuiz = !loadingSavedSession && !!savedSessionInfo?.quizId;

  const startQuiz = (quizRow: QuizRow) => {
    if (data.length === 0) {
      toast.error("מאגר השאלות עדיין נטען — נסה שוב בעוד רגע");
      return;
    }
    const byId = new Map(data.map((q) => [String(q[KEYS.ID]), q]));
    const questions = quizRow.question_ids.map((id) => byId.get(id)).filter((q): q is Question => Boolean(q));
    const missing = quizRow.question_ids.length - questions.length;
    if (missing > 0) {
      toast.error("חלק משאלות הבוחן חסרות במאגר המקומי — המאגר מתרענן, נסה שוב בעוד רגע");
      void invalidateQuestions();
      return;
    }
    startSession(questions, questions.length, "simulation", { quizId: quizRow.id });
  };

  const handleResume = async () => {
    setResuming(true);
    await resumeSessionFromDb();
    setResuming(false);
  };

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">טוען בחנים…</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-8" dir="rtl">
      {hasSavedQuiz && (
        <div className="border rounded-xl p-4 bg-primary/5 border-primary/30 flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">יש לך בוחן שנקטע באמצע</div>
            <div className="text-sm text-muted-foreground">
              שאלה {savedSessionInfo!.index + 1}/{savedSessionInfo!.questionIds.length}
            </div>
          </div>
          <button
            onClick={handleResume}
            disabled={resuming}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {resuming ? "טוען…" : "המשך בוחן"}
          </button>
        </div>
      )}

      <div className="flex items-center gap-3">
        <GraduationCap className="w-8 h-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">אקדמיה — בחנים</h1>
          <p className="text-sm text-muted-foreground">בחנים שבועיים וסימולציית פתיחה</p>
        </div>
      </div>

      {isSuspended ? (
        <section>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <PlayCircle className="w-5 h-5" /> בחנים פתוחים
          </h2>
          <div className="border rounded-xl p-4 text-sm text-muted-foreground">
            החשבון שלך מסומן כמושהה (רוטציה/מילואים) — הבחנים מוסתרים. פנה לאחראי האקדמיה בחזרתך.
          </div>
        </section>
      ) : (
        <section>
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <PlayCircle className="w-5 h-5" /> בחנים פתוחים
          </h2>
          {loadError ? (
            <p className="text-sm text-destructive">טעינת הבחנים נכשלה — רענן את הדף</p>
          ) : (
            open.length === 0 && <p className="text-sm text-muted-foreground">אין בוחן פתוח כרגע.</p>
          )}
          <div className="space-y-3">
            {open.map((q) => {
              const savedForThisQuiz = savedSessionInfo?.quizId === q.id;
              return (
                <div key={q.id} className="border rounded-xl p-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="font-medium">{q.title}</div>
                    <div className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="w-4 h-4" /> נסגר: {fmtDate(q.closes_at)} · {q.question_ids.length} שאלות
                    </div>
                  </div>
                  {savedForThisQuiz ? (
                    <span className="text-sm text-muted-foreground px-4 py-2">בוחן באמצע — המשך למעלה</span>
                  ) : (
                    <button
                      onClick={() => startQuiz(q)}
                      className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium hover:opacity-90"
                    >
                      התחל בוחן
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" /> הבחנים שלי
        </h2>
        {done.length === 0 && <p className="text-sm text-muted-foreground">עדיין לא הגשת בוחן.</p>}
        <div className="space-y-2">
          {done.map((a) => {
            const quizRow = quizzes.find((q) => q.id === a.quiz_id);
            const s = stats[a.quiz_id];
            const pct = a.total > 0 ? Math.round((100 * a.score) / a.total) : 0;
            return (
              <div key={a.id} className="border rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">{quizRow?.title ?? "בוחן"}</div>
                  <div className="text-sm text-muted-foreground">
                    הוגש {fmtDate(a.submitted_at)}
                    {s && s.avg_pct !== null && ` · ממוצע מחזור ${s.avg_pct}% (${s.submitted} הגשות)`}
                  </div>
                </div>
                <div className="text-xl font-bold">{pct}%</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
