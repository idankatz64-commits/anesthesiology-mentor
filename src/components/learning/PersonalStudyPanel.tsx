import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useApp } from '@/contexts/AppContext';
import { fetchCurriculumConfig, type HashedConfig } from '@/lib/curriculumRepository';
import { readStudyPreferences, saveStudyPreferences } from '@/lib/studyPreferencesRepository';
import { APPROVED_TOPIC_GROUPS, groupsMatch, localDate, personalQuarter, quarterlySchedule, studyRecommendation, type StudyPreferences, type StudyMode } from '@/lib/personalStudyPlan';
import { RANDOM_PLAN_NOTICE } from './useStudyScope';
import { useLearningReport } from './useLearningReport';

const modes: { id: StudyMode; label: string }[] = [{ id: 'quarterly', label: 'לפי רבעונים' }, { id: 'grouped', label: 'נושאים קשורים' }, { id: 'random', label: 'עבודה אקראית' }];
const percent = (value: number | null) => value === null ? 'אין נתון' : `${Math.round(value)}%`;

// Remount the complete form on identity changes, including pending saves.
export default function PersonalStudyPanel() {
  const { userId } = useApp();
  return userId ? <PersonalStudyContent key={userId} /> : null;
}
function PersonalStudyContent() {
  const { openRecommendation, resident } = useApp();
  const evidence = useLearningReport();
  const [config, setConfig] = useState<HashedConfig | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState<StudyPreferences>({ startDate: '', mode: 'quarterly', chapters: [] });
  const [saved, setSaved] = useState<StudyPreferences | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const mounted = useRef(true);
  const saving = useRef(false);
  const [today, setToday] = useState(localDate);
  useEffect(() => {
    const timer = window.setInterval(() => setToday(localDate()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    Promise.all([fetchCurriculumConfig(), readStudyPreferences()]).then(([c, p]) => {
      if (!active) return;
      setConfig(c.approved); setSaved(p); if (p) setDraft(p); setLoaded(true);
    }).catch(() => { if (active) setError('לא ניתן לטעון את התכנית האישית. רעננו ונסו שוב; הנתונים הקיימים נשמרים.'); });
    return () => { active = false; mounted.current = false; };
  }, []);
  const reports = evidence.status === 'ready' ? evidence.report.chapters : [];
  const examDate = resident.member?.examDate ?? null;
  const quarter = saved ? personalQuarter(saved.startDate, today) : null;
  const schedule = config && draft.startDate ? quarterlySchedule(config, draft.startDate, today, examDate, reports) : [];
  const allowedGroups = config && groupsMatch(config);
  const recommended = schedule[0]?.chapters ?? [];
  const selected = new Set(draft.chapters);
  const activeIds = saved?.chapters.length ? saved.chapters.slice(0, 3) : reports.filter(c => c.policy.coveredCount > 0 && !c.policy.green).slice(0, 3).map(c => c.chapter);
  const currentTopics = activeIds.flatMap(id => reports.filter(c => c.chapter === id));
  const title = (id: number) => config?.chapters.find(c => c.id === id)?.title ?? `פרק ${id}`;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const field = 'rounded-lg border border-input bg-background p-2';
  return <section aria-label="תכנית הלמידה האישית" className="rounded-2xl border bg-card p-4 sm:p-6 space-y-4" dir="rtl">
    <Dialog open={planOpen} onOpenChange={setPlanOpen}>
      <DialogTrigger asChild><button type="button" aria-label="פתיחת תכנית הלמידה המלאה" className="w-full text-start flex items-center justify-between gap-3 rounded-lg hover:bg-muted/50 p-1">
        <span><span className="block text-lg font-bold">תכנית הלמידה שלי</span><span className="text-sm text-muted-foreground">צברים ורבעונים · לחצו לתכנית המלאה</span></span><span aria-hidden="true">←</span>
      </button></DialogTrigger>
      {quarter && <p className="text-sm">רבעון אישי {quarter.number} · נותרו {quarter.daysLeft} ימים · עד {quarter.endDate}</p>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
      {!loaded && !error && <p>טוען תכנית אישית…</p>}
      <DialogContent dir="rtl" className="sm:max-w-3xl p-4 sm:p-6">
        <DialogTitle className="px-5">תכנית הלמידה המלאה</DialogTitle>
        <DialogDescription>תכנית לפי צברים ורבעונים אישיים. בוחרים עד שלושה פרקים פעילים בכל פעם. ההתקדמות מצטברת ואינה מתאפסת.</DialogDescription>
        {error && <p role="alert">{error}</p>}
        {loaded && <>
      <form className="space-y-3" onSubmit={async e => {
        e.preventDefault();
        if (saving.current || !draft.startDate) return;
        if (draft.mode !== 'random' && !draft.chapters.length) { setMessage('בחרו עד 3 פרקים פעילים מתוך הצעה או בבחירה ידנית.'); return; }
        saving.current = true; setBusy(true); setMessage('');
        try {
          const result = await saveStudyPreferences(draft);
          if (!result) throw new Error('NOT_SAVED');
          if (mounted.current) { setSaved(result); setDraft(result); setMessage('התכנית נשמרה לחשבון שלך.'); }
        } catch { if (mounted.current) setMessage('השמירה נכשלה. השינויים לא נשמרו; נסו שוב.'); }
        finally { saving.current = false; if (mounted.current) setBusy(false); }
      }}>
        <fieldset disabled={busy} className="space-y-3">
          <label className="flex flex-wrap items-center gap-2">תאריך תחילת הלמידה שלי<input aria-label="תאריך תחילת הלמידה שלי" type="date" required min="2000-01-01" max={today} value={draft.startDate} onChange={e => setDraft({ ...draft, startDate: e.target.value })} className={field} /></label>
          <p className="text-xs text-muted-foreground">בחרו את תאריך התחילה שלכם. כל רבעון נמשך שלושה חודשי לוח מתאריך זה.</p>
          <label className="flex flex-wrap items-center gap-2">מסלול למידה<select aria-label="מסלול למידה" className={field} value={draft.mode} onChange={e => setDraft({ ...draft, mode: e.target.value as StudyMode })}>{modes.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}</select></label>
          {!config && <p>רשימת הליבה ממתינה להפעלה. אפשר לשמור תאריך התחלה ולהמשיך ללמוד בחומר הזמין.</p>}
          {draft.mode === 'quarterly' && config && <>
            {!saved && <p>בחרו תאריך תחילה והצעת פרקים, ואז שמרו את התכנית.</p>}
            {saved && schedule.length === 0 && <p>אופק התכנית הסתיים או תאריך הבחינה חלף. אפשר להמשיך בבחירה ידנית או לעדכן את התאריכים.</p>}
            {schedule.length > 0 && <details><summary className="cursor-pointer font-medium">הצעת העבודה לרבעונים שנותרו</summary><p className="text-xs">החלוקה מתעדכנת לפי הפרקים שנותרו עד היעדים. פרק שהושלם נשאר בהיסטוריה.</p><ol className="space-y-2 mt-2">{schedule.map(q => <li key={q.number}>רבעון {q.number} · {q.startDate} עד {q.endDate}: {q.chapters.map(id => `${id} — ${title(id)}`).join(' · ') || 'פרקי הליבה הושלמו'}</li>)}</ol></details>}
            {recommended.length > 0 && <button type="button" className={field} onClick={() => setDraft({ ...draft, chapters: recommended.slice(0, 3) })}>בחירת עד 3 פרקים מהרבעון הנוכחי</button>}
            {resident.member?.examThisYear && !examDate && <p className="text-sm">לא נקבע תאריך בחינה — התכנית מציגה אופק של שנתיים מתאריך התחילה.</p>}
          </>}
          {(draft.mode === 'grouped' || draft.mode === 'quarterly') && <>{!allowedGroups ? <p>אין מיפוי נושאים מאושר עבור גרסת הליבה הפעילה.</p> : <div className="grid gap-2 sm:grid-cols-2">{APPROVED_TOPIC_GROUPS.map(g => <button key={g.title} type="button" className={`${field} text-start`} onClick={() => setDraft({ ...draft, chapters: g.chapterIds.filter(id => !reports.find(c => c.chapter === id)?.policy.green).slice(0, 3) })}>{g.title}<span className="block text-xs">בחירת עד 3 הפרקים הבאים בצבר</span><span className="block text-xs text-muted-foreground">פרקים {g.chapterIds.join(', ')}</span></button>)}</div>}</>}
          {draft.mode === 'random' && <p>{RANDOM_PLAN_NOTICE} השאלות ייבחרו במנגנון האקראי הקיים מתוך הפרקים שתבחרו והחומר שמותר לחשבון שלכם. ללא בחירת פרקים — מכל החומר הזמין.</p>}
          {config && <details><summary className="cursor-pointer">בחירת פרקים ידנית ({draft.chapters.length})</summary><div className="grid gap-2 mt-2 sm:grid-cols-2">{config.chapters.map(c => <label key={c.id} className="flex gap-2 items-start"><input type="checkbox" checked={selected.has(c.id)} disabled={!selected.has(c.id) && draft.chapters.length >= 3} onChange={() => setDraft({ ...draft, chapters: selected.has(c.id) ? draft.chapters.filter(id => id !== c.id) : [...draft.chapters, c.id] })} /><span>{c.id} — {c.title}</span></label>)}</div><button type="button" className={field} onClick={() => setDraft({ ...draft, chapters: [] })}>ניקוי הבחירה</button></details>}
          <button disabled={busy || !dirty} className="rounded-lg bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">{busy ? 'שומר…' : 'שמירת התכנית'}</button>
        </fieldset>
        {message && <p role="status">{message}</p>}
      </form>
      <div className="flex flex-wrap gap-2">{(['practice', 'exam'] as const).map(mode => <button key={mode} type="button" disabled={busy || (draft.mode !== 'random' && !draft.chapters.length)} className={field} onClick={() => { if (draft.mode !== 'random' && !draft.chapters.length) return; setPlanOpen(false); openRecommendation(studyRecommendation(draft.chapters, mode, Date.now())); }}>{mode === 'practice' ? 'פתיחת תרגול עם הבחירה' : 'פתיחת בחינה עם הבחירה'}</button>)}</div>
      {dirty && <p className="text-xs text-muted-foreground">הבחירה הנוכחית תשמש לפתיחת הלמידה. לשימוש גם בכניסה הבאה יש לשמור את התכנית.</p>}
    </>}
      </DialogContent>
    </Dialog>
    {saved?.mode === 'random' && <p className="text-xs text-amber-700 dark:text-amber-400">{RANDOM_PLAN_NOTICE}</p>}
    <h3 className="text-sm font-bold">הפרקים הפעילים שלי</h3>
    {evidence.status === 'loading' && <p>טוען התקדמות…</p>}
    {evidence.status === 'unavailable' && <p role="alert">{evidence.message}</p>}
    {evidence.status === 'ready' && <>

      {!activeIds.length && <p className="text-sm text-muted-foreground">בחרו בתכנית 2–3 פרקים להתחלה. פרקים מההיסטוריה בלבד אינם נחשבים פעילים.</p>}
      <div className="grid gap-2 lg:grid-cols-3 text-sm">{currentTopics.map(c => <article key={c.chapter} className="rounded-xl border p-3 space-y-2">
        <h4 className="font-semibold">{c.chapter} — {title(c.chapter)}{c.policy.green ? ' · היעדים הושגו' : ''}</h4>
        <p>נפח כללי: {percent(c.policy.coveragePercent)} / יעד 50% ({c.policy.coveredCount}/{c.total})</p>
        <p>נפח בחינה: {percent(c.total ? c.policy.quizCount * 100 / c.total : null)} / יעד 25% ({c.policy.quizCount}/{c.total})</p>
        <p>הצלחה בבחינה: {percent(c.policy.quizSuccessPercent)} / יעד 70%</p>
        <p className="text-xs text-muted-foreground">נותרו לנפח: {Math.max(0, c.policy.requiredCoverageCount - c.policy.coveredCount)} שאלות; לבחינה: {Math.max(0, c.policy.requiredQuizCount - c.policy.quizCount)} שאלות שונות. מספרים מעוגלים כלפי מעלה.</p>
      </article>)}</div>
      {activeIds.filter(id => !reports.some(c => c.chapter === id)).map(id => <p key={id}>{id} — {title(id)}: אין כרגע נתוני שאלות זמינות לחישוב התקדמות.</p>)}
    </>}
  </section>;
}
