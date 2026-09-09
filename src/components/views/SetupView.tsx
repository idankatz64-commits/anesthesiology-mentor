import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useStudyScope, RANDOM_PLAN_NOTICE } from '@/components/learning/useStudyScope';
import { useApp } from '@/contexts/AppContext';
import { durableAttemptsEnabled } from '@/lib/featureFlags';
import { attemptErrorMessage } from '@/lib/attemptsRepository';
import { KEYS, type Question, type SessionMode, type FeedbackTiming, type MultiSelectState } from '@/lib/types';
import { feedbackTimingFor } from '@/lib/sessionFeedback';
import { ChevronDown, Search, EyeOff, BookOpen, Calendar, Building2, Tag, Brain, Zap, ArrowRight, Clock, Hash, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { SESSION_SIZE_CONFIG, type SessionSize } from '@/lib/smartSelection';
import { selectBounded } from '@/lib/selectionPolicy';
import type { SrsRecord } from '@/lib/srsRepository';
import { policyModeFor, compositionText, shortageText, seededRandom, smartRank } from '@/lib/selectionSummary';

function MultiSelectDropdown({
  label,
  type,
  values,
  labelMap,
  icon,
}: {
  label: string;
  type: keyof MultiSelectState;
  values: string[];
  labelMap?: Record<string, string>;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { multiSelect, toggleMultiSelect } = useApp();
  const set = multiSelect[type];

  const displayLabel = set.has('all')
    ? 'הכל'
    : `${set.size} נבחרו`;

  return (
    <div className="p-6 rounded-xl bg-primary/5 border border-primary/10 hover:border-primary/30 transition-all group relative min-h-[140px]">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 rounded-lg bg-primary/20 text-primary">
          {icon}
        </div>
        <span className="font-bold text-base text-foreground">{label}</span>
      </div>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-3.5 bg-background border border-border rounded-lg text-right text-foreground text-base font-medium flex justify-between items-center focus:outline-none focus:border-primary transition-all duration-200"
      >
        <span className="text-muted-foreground">{displayLabel}</span>
        <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-4 right-4 bg-card border border-border shadow-xl rounded-xl mt-2 max-h-80 overflow-y-auto p-2">
            <div
              onClick={() => { toggleMultiSelect(type, 'all'); }}
              className={`p-4 rounded-lg cursor-pointer flex items-center gap-3 text-base transition-all duration-200 border-b border-border/50 ${
                set.has('all') ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
              }`}
            >
              {set.has('all') ? '☑' : '☐'} הכל
            </div>
            {values.map((val, i) => (
              <div
                key={val}
                onClick={() => toggleMultiSelect(type, val)}
                className={`p-4 rounded-lg cursor-pointer flex items-center gap-3 text-base transition-all duration-200 ${
                  i < values.length - 1 ? 'border-b border-border/30' : ''
                } ${
                  set.has(val) ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
                }`}
              >
                {set.has(val) ? '☑' : '☐'} {labelMap?.[val] ?? val}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const SESSION_SIZES: SessionSize[] = ['quick', 'regular', 'long', 'simulation'];

/** Ceiling on the custom question count. Applies to the manual input only — a learning
 *  recommendation carries its own count and is not clamped. */
export const MAX_CUSTOM_COUNT = 500;

export default function SetupView({ mode }: { mode: SessionMode }) {
  const {
    data, progress, session, multiSelect, confidenceMap, userId,
    setSourceFilter, toggleUnseenOnly, getFilteredQuestions, startSession, navigate,
    toggleMultiSelect, fetchSrsData, resetFilters, recommendation, clearRecommendation,
  } = useApp();

  // A learning recommendation opened from the report: exact count/filters, pool never wider than its chapters/ids.
  const rec = recommendation && recommendation.setup.mode === mode ? recommendation : null;
  const study = useStudyScope(userId);
  const studyChapters = !rec && study.preferences && study.preferences.mode !== 'random' ? study.preferences.chapters : null;
  const studyBlocked = study.loading || study.error;
  const scopedData = useMemo(() => data.filter(q => !studyChapters || studyChapters.includes(q[KEYS.CHAPTER])), [data, studyChapters]);
  useEffect(() => {
    if (!rec) return;
    if (session.sourceFilter !== rec.setup.source) setSourceFilter(rec.setup.source);
    if (session.unseenOnly !== rec.setup.unseenOnly) toggleUnseenOnly();
  }, [rec]); // eslint-disable-line react-hooks/exhaustive-deps

  const [sessionSize, setSessionSize] = useState<SessionSize | 'custom'>('regular');
  const [customCount, setCustomCount] = useState(30);
  const isCustom = sessionSize === 'custom';
  const count = rec ? rec.setup.count : isCustom ? customCount : SESSION_SIZE_CONFIG[sessionSize as SessionSize].count;
  const [serial, setSerial] = useState('');
  const [textSearch, setTextSearch] = useState('');
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [feedbackTiming, setFeedbackTiming] = useState<FeedbackTiming>(() => feedbackTimingFor(mode));
  useEffect(() => { setFeedbackTiming(feedbackTimingFor(mode)); }, [mode]);
  // SRS is fetched once per mount so the composition/shortage preview can show before start;
  // handleStart reuses the in-flight load and only refetches after a failure (retryable).
  const [srsData, setSrsData] = useState<Record<string, SrsRecord> | null>(null);
  const srsLoad = useRef<Promise<Record<string, SrsRecord>> | null>(null);
  const loadSrs = () => (srsLoad.current = fetchSrsData().then(srs => { setSrsData(srs); return srs; }));
  useEffect(() => { loadSrs().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 32));

  const topics = useMemo(() => [...new Set(scopedData.map(q => q[KEYS.TOPIC]).filter(Boolean))].sort(), [scopedData]);
  const years = useMemo(() => [...new Set(scopedData.map(q => q[KEYS.YEAR]).filter(Boolean))].sort(), [scopedData]);
  const kinds = useMemo(() => [...new Set(scopedData.map(q => q[KEYS.KIND]).filter(x => x && x.trim()))].sort(), [scopedData]);
  const institutions = useMemo(() => [...new Set(scopedData.map(q => q[KEYS.SOURCE]).filter(x => x && x !== 'N/A' && x.trim()))].sort(), [scopedData]);
  const userTags = useMemo(() => {
    const allTags = new Set<string>();
    Object.values(progress.tags).forEach(tags => tags.forEach(t => allTags.add(t)));
    return [...allTags].sort();
  }, [progress.tags]);

  const confidenceLabelMap: Record<string, string> = {
    confident: '✅ בטוח',
    hesitant: '🤔 מתלבט',
    guessed: '🎲 ניחוש',
  };

  // getFilteredQuestions is a stable useCallback that reads every filter through a ref,
  // so React cannot see what it depends on. The array below names that hidden state itself:
  // drop any one of these and a chip toggle would leave the pool stale.
  // The rule below reads them as unnecessary, because getFilteredQuestions takes only
  // two arguments; the ref reads are invisible to it.
  const basePool = useMemo(
    () => getFilteredQuestions(serial, textSearch).filter(q => !studyChapters || studyChapters.includes(q[KEYS.CHAPTER])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      getFilteredQuestions, serial, textSearch, studyChapters,
      data, progress, confidenceMap, multiSelect,
      session.sourceFilter, session.unseenOnly,
    ],
  );
  const recChapters = useMemo(() => new Set(rec?.setup.chapters ?? []), [rec]);
  const recIds = useMemo(() => (rec?.setup.questionIds ? new Set(rec.setup.questionIds) : null), [rec]);
  const pool = useMemo(
    () => (rec ? basePool.filter(q => ((rec.kind === 'study-plan' && recChapters.size === 0) || recChapters.has(q[KEYS.CHAPTER])) && (!recIds || recIds.has(q[KEYS.ID]))) : basePool),
    [rec, basePool, recChapters, recIds],
  );
  // The ranking pass walks the whole bank and the whole history, and none of the filters
  // touch it — so it is cached apart from the pool and survives every chip and keystroke.
  const rank = useMemo(
    () => (srsData ? smartRank(data, progress.history, srsData, count) : null),
    [data, progress.history, srsData, count],
  );
  // Same seed for preview and start → the set shown is the set that opens.
  // Setup is explicit user intent: practice/review may repeat recently answered questions
  // (manual lifts cooldown / future-schedule); exam keeps the adaptive filters.
  // handleStart may pass an srs map fetched after a retry, which the cached rank does not
  // describe; it then ranks against that map instead.
  const select = useCallback(
    (srs: Record<string, SrsRecord>, rankFn?: (question: Question) => number) =>
      selectBounded(pool, progress.history, srs, {
        mode: policyModeFor(mode), count, mistakesOnly: session.sourceFilter === 'mistakes', random: seededRandom(seed),
        manual: policyModeFor(mode) === 'practice', rank: rankFn ?? smartRank(data, progress.history, srs, count),
      }),
    [pool, progress.history, data, mode, count, session.sourceFilter, seed],
  );
  const preview = useMemo(() => (srsData && rank ? select(srsData, rank) : null), [select, srsData, rank]);
  const noneEligible = preview !== null && preview.questions.length === 0;

  const handleStart = async () => {
    if (studyBlocked) return;
    setStarting(true);
    setStartError('');
    try {
      const srs = srsData ?? await (srsLoad.current ?? loadSrs()).catch(loadSrs);
      const result = select(srs, srs === srsData ? (rank ?? undefined) : undefined);
      if (!result.questions.length) {
        setStartError(shortageText(result.shortage));
        return;
      }
      await startSession(result.questions, result.questions.length, mode, { feedbackTiming });
      clearRecommendation?.();
    } catch (e) {
      console.error('Smart selection failed:', e);
      setStartError(durableAttemptsEnabled() ? attemptErrorMessage(e) : 'לא הצלחנו להכין את השאלות. הבחירות שלך נשמרו כאן — אפשר לנסות שוב.');
    } finally {
      setStarting(false);
    }
  };

  const isPractice = mode === 'practice';
  const title = isPractice ? 'הגדרות תרגול' : 'הגדרות בחינה';

  const availableCount = preview?.questions.length ?? Math.min(count, pool.length);
  const estMinutes = Math.round(availableCount * 1.4);

  return (
    <div
      className="w-full p-4 lg:p-8 space-y-8"
    >
      {/* Header */}
      <section>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-1.5 rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{title}</h1>
        </div>
        <p className="text-muted-foreground">התאם את חוויית התרגול לצרכים שלך.</p>
        {isPractice && (
          <p className="text-sm text-foreground/70">תרגול ידני: מותר לחזור גם על שאלות שענית לאחרונה. נספר כלמידה, לא כציון בחינה.</p>
        )}
      </section>

      {study.loading && <p role="status">טוען את הסינון מהתכנית שלך…</p>}
      {study.error && <p role="alert">לא ניתן לטעון את התכנית. רעננו לפני התחלת למידה כדי לשמור על הסינון הנכון.</p>}
      {studyChapters && <section className="rounded-xl border border-primary/40 bg-primary/5 p-4" aria-label="סינון לפי התכנית"><p>מוצגים רק הפרקים הפעילים בתכנית: {studyChapters.join(', ') || 'טרם נבחרו פרקים — בחרו 2–3 פרקים בתכנית במסך הראשי'}.</p><button type="button" className="underline" onClick={() => navigate('home')}>שינוי התכנית במסך הראשי</button></section>}
      {study.preferences?.mode === 'random' && <p role="note" className="rounded-xl border border-amber-500/40 p-4">{RANDOM_PLAN_NOTICE}</p>}

      <section className="space-y-3" aria-label="מועד הצגת התשובות">
        <h3 className="font-bold">מתי להציג תשובה והסבר?</h3>
        <div className="flex gap-3">
          {([['immediate', 'אחרי כל שאלה'], ['end', 'בסיום המפגש']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={feedbackTiming === value}
              onClick={() => setFeedbackTiming(value)}
              className={`flex-1 rounded-xl border p-4 ${feedbackTiming === value ? 'bg-primary text-primary-foreground' : 'border-border bg-card'}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-sm text-foreground/70">אפשר ללמוד עם הסבר מיידי גם בבוחן. הזמן מתועד ללא מגבלת זמן.</p>
      </section>

      {rec && (
        <section role="status" aria-label="המלצה פעילה" className="rounded-xl border border-primary/40 bg-primary/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold">המלצה: {rec.title}</p>
            <p className="text-sm text-muted-foreground">{rec.setup.count} שאלות · פרקים {rec.setup.chapters.join(', ')} · {rec.setup.source === 'mistakes' ? 'טעויות בלבד' : 'כל השאלות'}{rec.setup.unseenOnly ? ' · חדשות בלבד' : ''}</p>
          </div>
          <button type="button" onClick={clearRecommendation} className="rounded-lg border border-border px-3 py-1.5 text-sm">בטל המלצה</button>
        </section>
      )}

      {startError && <p role="alert" className="text-destructive">{startError}</p>}

      {/* Session Intensity */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">עוצמת מפגש</h3>
        <div className="flex flex-wrap p-1 bg-primary/5 rounded-xl border border-primary/10">
          {SESSION_SIZES.map(size => {
            const cfg = SESSION_SIZE_CONFIG[size];
            const isSelected = sessionSize === size;
            return (
              <button
                key={size}
                onClick={() => setSessionSize(size)}
                className={`flex-1 min-w-[80px] flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all ${
                  isSelected
                    ? 'bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="text-sm font-bold">{cfg.label}</span>
                <span className={`text-[10px] ${isSelected ? 'opacity-80' : 'opacity-60'}`}>{cfg.count} שאלות</span>
              </button>
            );
          })}
          <button
            onClick={() => setSessionSize('custom')}
            className={`flex-1 min-w-[80px] flex flex-col items-center justify-center py-3 px-2 rounded-lg transition-all ${
              isCustom
                ? 'bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4 mb-0.5" />
            <span className="text-sm font-bold">מותאם אישית</span>
          </button>
        </div>
        {isCustom && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-xl bg-card border border-border">
            <div className="flex items-center gap-2">
              <label htmlFor="question-count" className="text-sm font-medium text-foreground whitespace-nowrap">מספר שאלות:</label>
              <input
                id="question-count"
                type="number"
                min={1}
                max={MAX_CUSTOM_COUNT}
                step={1}
                value={customCount}
                // The attribute alone does not constrain a pasted or programmatic value,
                // so the ceiling is applied here too — this count reaches attempt_start,
                // which has no server-side upper bound of its own.
                onChange={e => setCustomCount(Math.min(MAX_CUSTOM_COUNT, Math.max(1, Math.floor(Number(e.target.value) || 1))))}
                className="w-24 p-2.5 bg-background border border-border rounded-lg text-center text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-foreground/70">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>בחירה חכמה, עד מספר השאלות הזמינות בסינון</span>
            </div>
          </div>
        )}
      </section>

      {/* Source Filter Pills */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">מקור שאלות</h3>
        <div className="flex flex-wrap gap-2">
          {(['all', 'mistakes', 'fixed', 'favorites'] as const).map(src => (
            <button
              key={src}
              onClick={() => setSourceFilter(src)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                session.sourceFilter === src
                  ? 'bg-primary/10 text-primary border-primary/30'
                  : 'bg-card text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {src === 'all' ? 'כל המאגר' : src === 'mistakes' ? 'הטעויות שלי' : src === 'fixed' ? 'שאלות שתוקנו' : '⭐ מועדפים'}
            </button>
          ))}
          <button
            onClick={toggleUnseenOnly}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all border flex items-center gap-2 ${
              session.unseenOnly
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            <EyeOff className="w-3.5 h-3.5" />
            חדשות בלבד
          </button>
        </div>
      </section>

      {/* Free text search */}
      <section className="space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">חיפוש</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <input
              type="text"
              value={textSearch}
              onChange={e => setTextSearch(e.target.value)}
              placeholder="חפש תרופה, מחלה או מושג..."
              className="w-full p-3.5 pl-10 bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground placeholder-muted-foreground text-base"
            />
            <Search className="absolute left-3 top-4 w-4 h-4 text-muted-foreground" />
          </div>
          <div className="relative">
            <input
              type="text"
              value={serial}
              onChange={e => setSerial(e.target.value)}
              placeholder="מס' סידורי (למשל: 120)"
              className="w-full p-3.5 pl-10 bg-background border border-border rounded-lg outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground placeholder-muted-foreground text-base"
            />
            <Hash className="absolute left-3 top-4 w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </section>

      {/* Filters Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <MultiSelectDropdown
          label="נושא (Topic)"
          type="topic"
          values={topics}
          icon={<BookOpen className="w-5 h-5" />}
        />
        <MultiSelectDropdown
          label="שנה (Year)"
          type="year"
          values={years}
          icon={<Calendar className="w-5 h-5" />}
        />
        <MultiSelectDropdown
          label="מוסד (Institution)"
          type="institution"
          values={institutions}
          icon={<Building2 className="w-5 h-5" />}
        />
        <MultiSelectDropdown
          label="סוג (Kind)"
          type="kind"
          values={kinds}
          icon={<Tag className="w-5 h-5" />}
        />
        <MultiSelectDropdown
          label="תיוג (Tags)"
          type="usertags"
          values={userTags}
          icon={<Tag className="w-5 h-5" />}
        />
        <MultiSelectDropdown
          label="ביטחון (Confidence)"
          type="confidence"
          values={['confident', 'hesitant', 'guessed']}
          labelMap={confidenceLabelMap}
          icon={<Brain className="w-5 h-5" />}
        />
      </section>

      {/* Bottom Action Bar */}
      <div className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">זמן משוער</span>
            <span className="text-xl font-bold text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              ~{estMinutes} דק׳
            </span>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">שאלות זמינות</span>
            <span className={`text-xl font-bold ${pool.length > 0 ? 'text-foreground' : 'text-destructive'}`}>
              {pool.length} שאלות
            </span>
            {preview && !noneEligible && (
              <span className="text-xs text-muted-foreground">{compositionText(preview.composition)}</span>
            )}
            {preview && preview.shortage.reason !== 'none' && (
              <span className={`text-xs ${noneEligible ? 'text-destructive' : 'text-amber-600'}`}>{shortageText(preview.shortage)}</span>
            )}
            {noneEligible && (
              <span className="flex gap-2 mt-1">
                <button type="button" onClick={resetFilters} className="text-xs font-bold text-primary underline">נקה סינון</button>
                <button type="button" onClick={() => navigate('home')} className="text-xs font-bold text-primary underline">דף הבית</button>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={studyBlocked || starting || pool.length === 0 || noneEligible}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg px-12 py-4 rounded-xl shadow-2xl shadow-primary/30 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {starting ? 'מכין שאלות...' : `התחל ${isPractice ? 'תרגול' : 'בחינה'}`}
          <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </button>
      </div>
    </div>
  );
}
