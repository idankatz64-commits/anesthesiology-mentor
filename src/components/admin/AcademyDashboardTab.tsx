import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { KEYS } from "@/lib/types";
import {
  tallyByDomain,
  DOMAIN_ORDER,
  QuestionResolver,
} from "@/lib/academyProgress";
import AcademyProgressCharts from "./AcademyProgressCharts";
import {
  fetchMembers,
  fetchQuizzes,
  fetchAllAttempts,
  AcademyMemberRow,
  QuizRow,
  QuizAttemptRow,
} from "@/lib/academyRepository";

interface DomainAgg {
  domain: string;
  answered: number;
  correct: number;
}

export default function AcademyDashboardTab() {
  const { data } = useApp();
  const [members, setMembers] = useState<AcademyMemberRow[]>([]);
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [attempts, setAttempts] = useState<QuizAttemptRow[]>([]);
  const [selectedMember, setSelectedMember] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [ms, qs, ats] = await Promise.all([
          fetchMembers(),
          fetchQuizzes(),
          fetchAllAttempts(),
        ]);
        setMembers(ms);
        setQuizzes(qs);
        setAttempts(ats);
      } catch (e) {
        console.error("dashboard load failed:", e);
        toast.error("טעינת נתוני הדאשבורד נכשלה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const questionById = useMemo(
    () => new Map(data.map((q) => [String(q[KEYS.ID]), q])),
    [data],
  );

  const resolve = useMemo<QuestionResolver>(
    () => (id) => {
      const q = questionById.get(id);
      return q
        ? {
            chapter: q[KEYS.CHAPTER] as number,
            correct: q[KEYS.CORRECT] as string,
          }
        : undefined;
    },
    [questionById],
  );

  // member.user_id -> quiz_id -> attempt
  const attemptsByUser = useMemo(() => {
    const m = new Map<string, Map<string, QuizAttemptRow>>();
    for (const a of attempts) {
      if (!m.has(a.user_id)) m.set(a.user_id, new Map());
      m.get(a.user_id)!.set(a.quiz_id, a);
    }
    return m;
  }, [attempts]);

  const sortedQuizzes = useMemo(
    () =>
      [...quizzes].sort(
        (a, b) => Date.parse(a.opens_at) - Date.parse(b.opens_at),
      ),
    [quizzes],
  );

  const selectedUserId = useMemo(
    () => members.find((m) => m.id === selectedMember)?.user_id ?? null,
    [members, selectedMember],
  );

  const domainRows = useMemo((): DomainAgg[] => {
    if (!selectedUserId) return [];
    const tallies = tallyByDomain(
      attempts.filter((a) => a.user_id === selectedUserId),
      resolve,
    );
    return DOMAIN_ORDER.flatMap((domain) => {
      const t = tallies.get(domain);
      return t && t.answered > 0
        ? [{ domain, answered: t.answered, correct: t.correct }]
        : [];
    });
  }, [selectedUserId, attempts, resolve]);

  const chartMembers = useMemo(
    () =>
      members.map((m) => ({
        id: m.id,
        label: m.full_name || m.email,
        userId: m.user_id,
        residencyYear: m.residency_year,
      })),
    [members],
  );

  if (loading)
    return <div className="p-8 text-center text-muted-foreground">טוען…</div>;

  const pctCell = (a: QuizAttemptRow | undefined) => {
    if (!a) return <span className="text-muted-foreground">—</span>;
    const pct = a.total > 0 ? Math.round((100 * a.score) / a.total) : 0;
    return (
      <span
        className={
          pct >= 60 ? "text-green-600 font-medium" : "text-red-600 font-medium"
        }
      >
        {pct}%
      </span>
    );
  };

  return (
    <div className="space-y-6" dir="rtl">
      <section className="deep-tile rounded-2xl p-5 sm:p-6">
        <h3 className="text-base font-bold mb-5">
          מטריצת הגשות — מתמחה × בוחן
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right">
                <th className="p-2">מתמחה</th>
                {sortedQuizzes.map((q) => (
                  <th key={q.id} className="p-2 whitespace-nowrap">
                    {q.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className={`border-b ${m.status === "suspended" ? "opacity-50" : ""}`}
                >
                  <td className="p-2">
                    {m.full_name || m.email}
                    {m.status === "suspended" && (
                      <span className="text-xs text-amber-600 mr-1">
                        (מושהה)
                      </span>
                    )}
                    {!m.user_id && (
                      <span className="text-xs text-muted-foreground mr-1">
                        (טרם נרשם)
                      </span>
                    )}
                  </td>
                  {sortedQuizzes.map((q) => (
                    <td key={q.id} className="p-2">
                      {pctCell(
                        m.user_id
                          ? attemptsByUser.get(m.user_id)?.get(q.id)
                          : undefined,
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td
                    className="p-4 text-center text-muted-foreground"
                    colSpan={1 + sortedQuizzes.length}
                  >
                    המחזור ריק
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="deep-tile rounded-2xl p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="text-base font-bold">פילוח תחומים למתמחה</h3>
          <select
            value={selectedMember}
            onChange={(e) => setSelectedMember(e.target.value)}
            className="border rounded-lg p-2 bg-background"
          >
            <option value="">בחר מתמחה…</option>
            {members
              .filter((m) => m.user_id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
          </select>
        </div>
        {selectedMember && domainRows.length === 0 && (
          <p className="text-sm text-muted-foreground">
            אין עדיין הגשות למתמחה זה.
          </p>
        )}
        {domainRows.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-right">
                <th className="p-2">תחום קליני</th>
                <th className="p-2">נענו</th>
                <th className="p-2">נכונות</th>
                <th className="p-2">אחוז</th>
              </tr>
            </thead>
            <tbody>
              {domainRows.map((r) => {
                const pct = Math.round((100 * r.correct) / r.answered);
                return (
                  <tr key={r.domain} className="border-b">
                    <td className="p-2">{r.domain}</td>
                    <td className="p-2">{r.answered}</td>
                    <td className="p-2">{r.correct}</td>
                    <td
                      className={`p-2 font-medium ${pct >= 60 ? "text-green-600" : "text-red-600"}`}
                    >
                      {pct}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <AcademyProgressCharts
        members={chartMembers}
        quizzes={quizzes}
        attempts={attempts}
        resolve={resolve}
        selectedUserId={selectedUserId}
      />
    </div>
  );
}
