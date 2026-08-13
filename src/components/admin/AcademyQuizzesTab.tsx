import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { KEYS } from "@/lib/types";
import { MILLER_CHAPTERS, getChapterDisplay } from "@/data/millerChapters";
import { createQuiz, deleteQuiz, fetchQuizzes, fetchAllAttempts, QuizRow } from "@/lib/academyRepository";

// datetime-local wants "YYYY-MM-DDTHH:mm" in local time
const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function AcademyQuizzesTab() {
  const { data } = useApp();
  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [quizType, setQuizType] = useState<"weekly" | "baseline">("weekly");
  const [opensAt, setOpensAt] = useState(toLocalInput(new Date()));
  const [closesAt, setClosesAt] = useState(toLocalInput(new Date(Date.now() + 24 * 3600 * 1000)));
  const [idsText, setIdsText] = useState("");
  const [fillChapter, setFillChapter] = useState<number>(1);
  const [fillCount, setFillCount] = useState(10);
  const [busy, setBusy] = useState(false);

  const questionById = useMemo(() => new Map(data.map((q) => [String(q[KEYS.ID]), q])), [data]);

  const reload = useCallback(async () => {
    try {
      const [qs, attempts] = await Promise.all([fetchQuizzes(), fetchAllAttempts()]);
      setQuizzes(qs);
      const counts: Record<string, number> = {};
      for (const a of attempts) counts[a.quiz_id] = (counts[a.quiz_id] ?? 0) + 1;
      setAttemptCounts(counts);
    } catch (e) {
      console.error("quiz reload failed:", e);
      toast.error("טעינת הבחנים נכשלה");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const parsedIds = useMemo(
    () =>
      idsText
        .split(/[\s,;]+/)
        .map((t) => t.trim())
        .filter(Boolean),
    [idsText],
  );
  const missingIds = parsedIds.filter((id) => !questionById.has(id));

  const randomFill = () => {
    const n = Math.max(1, Math.min(120, Number(fillCount) || 1));
    const chosen = new Set(parsedIds);
    const pool = data.filter(
      (q) => q[KEYS.CHAPTER] === fillChapter && !chosen.has(String(q[KEYS.ID])) && Boolean(q[KEYS.CORRECT]),
    );
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, n);
    if (shuffled.length < n) {
      toast.warning(`בפרק ${fillChapter} נמצאו רק ${shuffled.length} שאלות פנויות עם תשובה נכונה`);
    }
    const added = shuffled.map((q) => String(q[KEYS.ID]));
    setIdsText([...parsedIds, ...added].join("\n"));
  };

  const handleCreate = async () => {
    if (!title.trim()) return toast.error("חסרה כותרת לבוחן");
    if (parsedIds.length === 0) return toast.error("לא נבחרו שאלות");
    // Dedupe before validation: submit_quiz_attempt enforces set-equality between a
    // submission and question_ids, so a quiz saved with duplicate ids becomes
    // deterministically un-submittable for every resident.
    const uniqueIds = [...new Set(parsedIds)];
    if (uniqueIds.length !== parsedIds.length) {
      toast.info(`${parsedIds.length - uniqueIds.length} מזהים כפולים הוסרו`);
    }
    const uniqueMissingIds = uniqueIds.filter((id) => !questionById.has(id));
    if (uniqueMissingIds.length > 0)
      return toast.error(
        `${uniqueMissingIds.length} מזהים לא קיימים במאגר: ${uniqueMissingIds.slice(0, 5).join(", ")}`,
      );
    const noCorrectAnswerIds = uniqueIds.filter((id) => !questionById.get(id)?.[KEYS.CORRECT]);
    if (noCorrectAnswerIds.length > 0)
      return toast.error(
        `${noCorrectAnswerIds.length} שאלות ללא תשובה נכונה מוגדרת — הסר אותן: ${noCorrectAnswerIds.slice(0, 5).join(", ")}`,
      );
    const opens = new Date(opensAt);
    const closes = new Date(closesAt);
    if (!(closes > opens)) return toast.error("שעת הסגירה חייבת להיות אחרי שעת הפתיחה");
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      await createQuiz({
        title: title.trim(),
        quiz_type: quizType,
        question_ids: uniqueIds,
        opens_at: opens.toISOString(),
        closes_at: closes.toISOString(),
        created_by: userData?.user?.id ?? null,
      });
      toast.success("הבוחן נוצר");
      setTitle("");
      setIdsText("");
      await reload();
    } catch (e) {
      console.error("createQuiz failed:", e);
      toast.error("יצירת הבוחן נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (quizRow: QuizRow) => {
    if ((attemptCounts[quizRow.id] ?? 0) > 0) return toast.error("יש הגשות לבוחן — לא ניתן למחוק");
    if (!window.confirm(`למחוק את "${quizRow.title}"?`)) return;
    try {
      await deleteQuiz(quizRow.id);
      await reload();
    } catch (e) {
      console.error("deleteQuiz failed:", e);
      toast.error("מחיקת הבוחן נכשלה");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold">יצירת בוחן</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="כותרת (למשל: בייסליין חלק 1)"
            className="border rounded-lg p-2"
          />
          <select
            value={quizType}
            onChange={(e) => setQuizType(e.target.value as "weekly" | "baseline")}
            className="border rounded-lg p-2"
          >
            <option value="weekly">בוחן שבועי</option>
            <option value="baseline">בייסליין</option>
          </select>
          <label className="text-sm">
            נפתח:
            <input
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
              className="border rounded-lg p-2 w-full"
              dir="ltr"
            />
          </label>
          <label className="text-sm">
            נסגר:
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
              className="border rounded-lg p-2 w-full"
              dir="ltr"
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-end gap-2 flex-wrap">
            <label className="text-sm">
              מילוי אקראי מפרק:
              <select
                value={fillChapter}
                onChange={(e) => setFillChapter(Number(e.target.value))}
                className="border rounded-lg p-2 w-64 block"
              >
                {Object.keys(MILLER_CHAPTERS).map((ch) => (
                  <option key={ch} value={ch}>
                    {getChapterDisplay(Number(ch))}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              כמות:
              <input
                type="number"
                min={1}
                max={120}
                value={fillCount}
                onChange={(e) => setFillCount(Number(e.target.value))}
                className="border rounded-lg p-2 w-20 block"
              />
            </label>
            <button onClick={randomFill} className="px-3 py-2 rounded-lg border font-medium">
              מלא אקראית
            </button>
          </div>
          <textarea
            value={idsText}
            onChange={(e) => setIdsText(e.target.value)}
            rows={5}
            dir="ltr"
            className="w-full border rounded-lg p-2 text-sm font-mono"
            placeholder="מזהי שאלות — שורה לכל מזהה"
          />
          <div className="text-sm text-muted-foreground">
            {parsedIds.length} שאלות נבחרו
            {missingIds.length > 0 && <span className="text-destructive"> · {missingIds.length} מזהים לא קיימים</span>}
          </div>
        </div>

        <button
          onClick={handleCreate}
          disabled={busy}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50"
        >
          צור בוחן
        </button>
      </div>

      <div className="border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-right">
              <th className="p-2">כותרת</th>
              <th className="p-2">סוג</th>
              <th className="p-2">חלון</th>
              <th className="p-2">שאלות</th>
              <th className="p-2">הגשות</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {quizzes.map((q) => (
              <tr key={q.id} className="border-b">
                <td className="p-2 font-medium">{q.title}</td>
                <td className="p-2">{q.quiz_type === "baseline" ? "בייסליין" : "שבועי"}</td>
                <td className="p-2 text-xs" dir="ltr">
                  {new Date(q.opens_at).toLocaleString("he-IL")} → {new Date(q.closes_at).toLocaleString("he-IL")}
                </td>
                <td className="p-2">{q.question_ids.length}</td>
                <td className="p-2">{attemptCounts[q.id] ?? 0}</td>
                <td className="p-2">
                  <button onClick={() => void handleDelete(q)} className="text-destructive">
                    מחק
                  </button>
                </td>
              </tr>
            ))}
            {quizzes.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  אין בחנים עדיין
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
