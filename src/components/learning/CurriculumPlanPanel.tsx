import { useEffect, useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { DEFAULT_BASKET_SIZE, buildCurriculumPlan, curriculumNoticeLabel, type ChapterEvidence, type CurriculumPlan, type ResidentContext } from '@/lib/curriculumPlan';
import { curriculumErrorMessage, fetchCurriculumConfig, type CurriculumConfigState } from '@/lib/curriculumRepository';

const PACES = [1, 2, 3, 4, 5, 6];
const list = (ids: readonly number[]) => (ids.length ? ids.map((c) => `פרק ${c}`).join(', ') : '—');

export function residentContextOf(resident: ReturnType<typeof useApp>['resident']): ResidentContext {
  const m = resident?.member;
  return { residencyYear: m?.residencyYear ?? null, examThisYear: m?.examThisYear ?? false, examDate: m?.examDate ?? null };
}

export function PlanView({ plan }: { plan: CurriculumPlan }) {
  if (plan.mode === 'invalid') return <p role="alert" className="text-sm text-destructive">תצורת הליבה אינה תקינה: {plan.errors.join(', ')}</p>;
  if (plan.mode === 'unavailable') return <p role="note" className="text-sm">{plan.notice}</p>;
  const pacing = plan.pacing.kind === 'suggested'
    ? `קצב מוצע: כ־${plan.pacing.chaptersPerMonth} פרקים בחודש ל־${plan.pacing.monthsRemaining} חודשים (${plan.pacing.basis === 'exam-date' ? 'לפי תאריך הבחינה' : 'אופק ייחוס, לא דדליין'}).`
    : plan.pacing.reason === 'no-remaining' ? 'כל פרקי הליבה ירוקים.' : 'לא ניתן להציע קצב (תאריך בחינה חסר/עבר).';
  return (
    <div className="space-y-2 text-sm">
      {plan.mode === 'draft-preview' && <p className="text-amber-700 dark:text-amber-400">תצוגה מקדימה של טיוטה {plan.configVersion} — אינה פעילה למתמחים.</p>}
      {plan.notices.map((n) => <p key={n} className="text-xs text-muted-foreground">{curriculumNoticeLabel[n]}</p>)}
      <p>נותרו {plan.remaining.remaining} מתוך {plan.remaining.total} פרקי ליבה (סדר לפי {plan.ordering.basis === 'year-config' ? 'שנת התמחות' : 'סדר המקור'}).</p>
      <p>{pacing}</p>
      <p><strong>הסל הבא (המלצה בלבד):</strong> {list(plan.basket.chapterIds)}</p>
      <p className="text-xs text-muted-foreground">{plan.basket.rationale}</p>
      {plan.outsideCore.length > 0 && <p className="text-xs text-muted-foreground">עדות מחוץ לליבה: {list(plan.outsideCore)}</p>}
      <p className="text-xs text-muted-foreground">כל החומר שזמין לך פתוח ללימוד; התוכנית לא נועלת דבר.</p>
    </div>
  );
}

/** Resident plan from the approved core config only; a draft never drives the recommendation. */
export default function CurriculumPlanPanel({ evidence }: { evidence: readonly ChapterEvidence[] }) {
  const { resident, userId } = useApp();
  const [config, setConfig] = useState<CurriculumConfigState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pace, setPace] = useState(DEFAULT_BASKET_SIZE);

  useEffect(() => {
    let live = true;
    setConfig(null); setError(null);
    if (!userId) return;
    fetchCurriculumConfig().then((c) => live && setConfig(c)).catch((e) => live && setError(curriculumErrorMessage(e)));
    return () => { live = false; };
  }, [userId]);

  const approved = config?.approved ?? null;
  const plan = approved ? buildCurriculumPlan({ config: approved, resident: residentContextOf(resident), evidence, audience: 'resident', nowMs: Date.now(), basketSize: pace }) : null;

  return (
    <section aria-label="תוכנית ליבה" className="rounded-xl border border-border p-4 space-y-3" dir="rtl">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-bold text-sm">תוכנית ליבה</h4>
        <label className="text-xs flex items-center gap-2">קצב נבחר
          <select aria-label="קצב פרקים" value={pace} onChange={(e) => setPace(Number(e.target.value))} className="rounded border border-border bg-background px-2 py-1">
            {PACES.map((p) => <option key={p} value={p}>{p} פרקים בסל</option>)}
          </select>
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!error && !config && <p className="text-sm text-muted-foreground">טוען תצורת ליבה…</p>}
      {config && !approved && (
        <p role="note" className="text-sm">
          ההמלצה ממתינה לאישור רשימת הליבה{config.draft ? ` (טיוטה ${config.draft.version})` : ''}. כל החומר שזמין לך פתוח ללימוד.
        </p>
      )}
      {plan && <PlanView plan={plan} />}
    </section>
  );
}
