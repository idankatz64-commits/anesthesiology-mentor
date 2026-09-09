import { useState, useMemo, useEffect, useRef } from 'react';
import { useApp, type SavedSessionData } from '@/contexts/AppContext';
import { attemptErrorMessage } from '@/lib/attemptsRepository';
import { KEYS, Question, UserProgress } from '@/lib/types';
import { TrendingUp } from 'lucide-react';
import {
  Sparkles, Timer, RefreshCcw, Heart, BookOpen, Cpu,
  Layers, SlidersHorizontal, AlertCircle,
  Play, X, AlertTriangle, ClipboardList, Info, ChevronDown,
  FolderOpen, FileText, Link as LinkIcon, ExternalLink,
} from 'lucide-react';
import jigsawImg from '@/assets/jigsaw.png';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { StatCard } from '@/components/stats/StatCard';
import { getExamProximityPhase } from '@/lib/smartSelection';
import { selectBounded, type SelectionResult } from '@/lib/selectionPolicy';
import { policyModeFor, compositionText, shortageText, smartRank } from '@/lib/selectionSummary';
import { readLastSession } from '@/lib/lastSessionStore';
import MatrixCountdown from '@/components/MatrixCountdown';
import { readStudyPreferences } from '@/lib/studyPreferencesRepository';
import { RANDOM_PLAN_NOTICE } from '@/components/learning/useStudyScope';
import PersonalStudyPanel from '@/components/learning/PersonalStudyPanel';
import HomeStatsSummary from '@/components/stats/HomeStatsSummary';
import HomeTopicHeatmap from '@/components/stats/HomeTopicHeatmap';
import DailyReportModal from '@/components/DailyReportModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 250, damping: 25, mass: 0.8 } },
};

/* ── Animated Icon Wrappers ── */
// Animated icon wrappers — all respect prefers-reduced-motion
function PulseIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >{children}</motion.div>
  );
}

function SpinIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { rotate: 360 }}
      transition={{ duration: 10, repeat: Infinity, ease: 'linear' }}
    >{children}</motion.div>
  );
}

// RotateIcon: toned down from ±30° to ±12°, slower
function RotateIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { rotate: [0, -12, 0, 12, 0] }}
      transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
    >{children}</motion.div>
  );
}

// FlipIcon: replaced 3D flip with a gentle bounce (less GPU intensive)
function FlipIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { y: [0, -5, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >{children}</motion.div>
  );
}

function BounceIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { y: [0, -4, 0] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
    >{children}</motion.div>
  );
}

function ShakeIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { x: [0, -2, 2, -2, 0] }}
      transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 4 }}
    >{children}</motion.div>
  );
}

function BeatIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { scale: [1, 1.15, 1, 1.08, 1] }}
      transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 2.5 }}
    >{children}</motion.div>
  );
}

function BlinkIcon({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      animate={reduced ? {} : { opacity: [1, 0.4, 1] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    >{children}</motion.div>
  );
}

/* ── Focus Card (larger, decorative) ── */
function FocusCard({
  icon, title, description, onClick, accentColor, disabled, badge,
}: {
  icon: React.ReactNode; title: string; description: string;
  onClick: () => void; accentColor: string; disabled?: boolean;
  badge?: number;
}) {
  return (
    <motion.div
      variants={cardVariant}
      whileTap={{ scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      className={`glass-tile relative overflow-hidden p-6 cursor-pointer group ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      style={{ willChange: 'transform', borderColor: accentColor + '33' }}
    >
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-3 left-3 rounded-full bg-red-500 text-white text-xs font-bold px-2 py-0.5 z-10 shadow-md">
          {badge}
        </span>
      )}
      {/* Decorative circle */}
      <div
        className="absolute -right-6 -bottom-6 w-24 h-24 rounded-full opacity-10 pointer-events-none"
        style={{ background: accentColor }}
      />
      <div className="relative">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"
          style={{ background: accentColor + '22', color: accentColor }}
        >
          {icon}
        </div>
        <h3 className="font-bold text-lg mb-1.5 text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground font-light leading-relaxed">{description}</p>
      </div>
    </motion.div>
  );
}

/* ── Resource Links Section ── */
interface ResourceLink {
  id: string; title: string; description: string | null;
  url: string; category: string;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  drive: <FolderOpen className="w-4 h-4" />,
  exam: <FileText className="w-4 h-4" />,
  reference: <BookOpen className="w-4 h-4" />,
  other: <LinkIcon className="w-4 h-4" />,
};

function ResourceLinksSection() {
  const [links, setLinks] = useState<ResourceLink[]>([]);

  useEffect(() => {
    supabase
      .from('resource_links')
      .select('id, title, description, url, category')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data }) => { if (data?.length) setLinks(data); });
  }, []);

  if (links.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">קישורים ומשאבים</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {links.map(link => (
          <a
            key={link.id}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-tile p-3 flex items-center gap-3 hover:border-primary/30 transition-all group"
          >
            <div className="w-8 h-8 bg-primary/15 text-primary rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
              {CATEGORY_ICONS[link.category] ?? <LinkIcon className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-foreground truncate">{link.title}</p>
              {link.description && (
                <p className="text-xs text-muted-foreground truncate">{link.description}</p>
              )}
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Small Card ── */
function SmallCard({
  icon, title, subtitle, onClick, disabled = false,
}: {
  icon: React.ReactNode; title: string; subtitle: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <motion.button
      variants={cardVariant}
      type="button"
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      className="glass-tile p-4 text-right cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed"
      style={{ willChange: 'transform' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 bg-primary/15 text-primary rounded-lg flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
          {icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground font-light mt-0.5">{subtitle}</p>
        </div>
      </div>
    </motion.button>
  );
}

/* ── Session Panel (always visible) ── */
function SessionPanel({
  savedSessionInfo, loadingSavedSession, resuming, onResume, onClear, userId,
}: {
  savedSessionInfo: SavedSessionData | null; loadingSavedSession: boolean; resuming: boolean;
  onResume: () => void; onClear: () => void;
  progress: UserProgress; data: Question[]; userId: string | null;
}) {
  // Identity-scoped: a record left by a demo run or another account is not this
  // user's last session and is not shown (see lib/lastSessionStore).
  const lastSession = useMemo(() => readLastSession(userId), [userId]);

  const hasSaved = !loadingSavedSession && savedSessionInfo;

  const modeLabel = (m: string) =>
    m === 'simulation' ? 'סימולציה' : m === 'exam' ? 'בחינה' : 'תרגול';

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `לפני ${mins} דקות`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `לפני ${hrs} שעות`;
    const days = Math.floor(hrs / 24);
    return `לפני ${days} ימים`;
  };

  return (
    <div className="glass-tile px-5 py-4 relative overflow-hidden h-full flex flex-col justify-center">
      {hasSaved ? (
        <>
          <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent pointer-events-none" />
          <div className="relative flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Play className="w-5 h-5 text-primary shrink-0" />
              <div>
                <span className="font-bold text-foreground text-sm">יש לך סשן שמור!</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {modeLabel(savedSessionInfo.mode)}{' '}
                  — שאלה {savedSessionInfo.index + 1} מתוך {savedSessionInfo.questionIds.length}
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  נשמר ב-{new Date(savedSessionInfo.createdAt).toLocaleDateString('he-IL')}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onResume}
                disabled={resuming}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-xl font-bold text-sm hover:opacity-90 transition flex items-center gap-2 shadow-lg disabled:opacity-50 flex-1 justify-center"
              >
                <Play className="w-4 h-4" />
                {resuming ? 'טוען...' : 'המשך סשן'}
              </button>
              <button
                onClick={onClear}
                className="text-muted-foreground hover:text-destructive p-2 rounded-xl hover:bg-destructive/10 transition"
                title="מחק סשן שמור"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : lastSession ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{(lastSession.pct ?? 0) >= 80 ? '🏆' : (lastSession.pct ?? 0) >= 60 ? '💪' : '📚'}</span>
            <span className="text-xs font-semibold text-muted-foreground">סשן אחרון</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-foreground tabular-nums">{lastSession.score}/{lastSession.total}</span>
            <span className={`text-sm font-bold tabular-nums ${
              (lastSession.pct ?? 0) >= 70 ? 'text-success' : (lastSession.pct ?? 0) >= 50 ? 'text-warning' : 'text-destructive'
            }`}>({lastSession.pct === null ? "—" : `${lastSession.pct ?? 0}%`})</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-muted/30 overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              style={{ backgroundColor: (lastSession.pct ?? 0) >= 70 ? 'hsl(var(--success))' : (lastSession.pct ?? 0) >= 50 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))' }}
              initial={{ width: 0 }}
              animate={{ width: `${lastSession.pct ?? 0}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground/60">{modeLabel(lastSession.mode)}</span>
            <span className="text-muted-foreground/30">·</span>
            <span className="text-[10px] text-muted-foreground/60">{timeAgo(lastSession.timestamp)}</span>
          </div>
          {lastSession.topics.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {lastSession.topics.map(t => (
                <span key={t} className="text-[10px] bg-muted/30 text-muted-foreground px-2 py-0.5 rounded-full truncate max-w-[140px]">{t}</span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-full">
          <span className="text-xs text-muted-foreground/50">עדיין לא השלמת סשן</span>
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export default function HomeView() {
  const {
    data,
    progress,
    navigate,
    startSession,
    savedSessionInfo,
    resumeSessionFromDb,
    clearSavedSession,
    loadingSavedSession,
    fetchSrsData,
    setSourceFilter,
    userId,
  } = useApp();
  const [resuming, setResuming] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [algoOpen, setAlgoOpen] = useState(false);

  const examPhase = useMemo(() => getExamProximityPhase(), []);
  const [phaseDismissed, setPhaseDismissed] = useState(() => {
    const stored = localStorage.getItem('exam_phase_banner_dismissed_v1');
    return stored === examPhase;
  });
  const showExamBadge = examPhase !== 'early' && !phaseDismissed;
  const dismissExamBadge = () => {
    localStorage.setItem('exam_phase_banner_dismissed_v1', examPhase);
    setPhaseDismissed(true);
  };

  let mistakes = 0;
  Object.values(progress.history).forEach(h => { if (h.lastResult === 'wrong') mistakes++; });
  const notesCount = Object.keys(progress.notes).length;
  const favsCount = progress.favorites.length;

  const withExp = data.filter(q => q[KEYS.EXPLANATION] && q[KEYS.EXPLANATION].trim().length > 5).length;
  const withoutExp = data.length - withExp;

  // Quick actions are automatic selection: the same bounded policy as SetupView with the adaptive
  // filters on (cool-down / future-schedule), ranked by the smart score inside the approved tiers.
  // A shortage or an empty result is shown in a panel with explicit options — never a silent fallback pool.
  type QuickMode = 'practice' | 'simulation';
  // quickStart awaits the SRS fetch, and the shortage panel waits for a click. Meanwhile the user,
  // the visible bank (entitlement projection) or the history may change — sign-out, quarantine,
  // re-projection. fetchSrsData resolving {} is not proof of a current context, so the context is
  // snapshotted at the click and compared by identity to what this view renders now, right before start.
  type Ctx = { userId: typeof userId; data: typeof data; history: typeof progress.history };
  const ctxRef = useRef<Ctx>({ userId, data, history: progress.history });
  ctxRef.current = { userId, data, history: progress.history };
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [pending, setPending] = useState<{ mode: QuickMode; result: SelectionResult; snap: Ctx } | null>(null);
  useEffect(() => { setPending(null); }, [userId, data, progress.history]);
  const abortIfStale = (snap: Ctx) => {
    const now = ctxRef.current;
    const stale = !mounted.current || now.userId !== snap.userId || now.data !== snap.data || now.history !== snap.history;
    if (stale && mounted.current) toast.error('לא הצלחנו להכין את השאלות. אפשר לנסות שוב.');
    return stale;
  };
  const launch = async (mode: QuickMode, result: SelectionResult, snap: Ctx) => {
    if (abortIfStale(snap)) return;
    setPending(null);
    try {
      await startSession(result.questions, result.questions.length, mode);
      toast.info(compositionText(result.composition));
    } catch (e) {
      // Durable path only: the server refused to open the attempt. Report it; never retry on another pool.
      toast.error(attemptErrorMessage(e));
    }
  };
  const quickStart = async (mode: QuickMode, count: number) => {
    const snap = ctxRef.current;
    if (!snap.data.length) return;
    let result: SelectionResult;
    try {
      const [srsData, preferences] = await Promise.all([fetchSrsData(), readStudyPreferences()]);
      if (abortIfStale(snap)) return;
      const bank = preferences && preferences.mode !== 'random' ? snap.data.filter(q => preferences.chapters.includes(q[KEYS.CHAPTER])) : snap.data;
      if (preferences?.mode === 'random') toast.info(RANDOM_PLAN_NOTICE);
      if (preferences && preferences.mode !== 'random' && !preferences.chapters.length) { toast.info('בחרו 2–3 פרקים פעילים בתכנית הלמידה לפני ההתחלה.'); return; }
      result = selectBounded(bank, snap.history, srsData, {
        mode: policyModeFor(mode), count, rank: smartRank(snap.data, snap.history, srsData, count),
      });
    } catch (e) {
      console.error('Selection failed:', e);
      toast.error('לא הצלחנו להכין את השאלות. אפשר לנסות שוב.');
      return;
    }
    if (result.shortage.reason !== 'none') { setPending({ mode, result, snap }); return; }
    await launch(mode, result, snap);
  };
  const handleSmartPractice = () => quickStart('practice', 15);
  const handleSimulation = () => quickStart('simulation', 120);


  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* ═══ COUNTDOWN ═══ */}
      <MatrixCountdown />

      {/* ═══ EXAM BADGE ═══ */}
      <AnimatePresence>
        {showExamBadge && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`rounded-xl border px-5 py-3 flex items-center justify-between gap-3 ${
              examPhase === 'imminent'
                ? 'bg-destructive/10 border-destructive/30 text-destructive'
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {examPhase === 'imminent'
                ? 'מצב בחינה — עדיפות מקסימלית לנושאים חלשים'
                : 'מצב התקרבות לבחינה — דגש על נושאים חלשים'}
            </div>
            <button onClick={dismissExamBadge} className="p-1 rounded hover:bg-foreground/10 transition shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ ANALYTICS BLOCK ═══ */}
      <div className="flex flex-col gap-3">
        {/* Stats Row — full width */}
        <HomeStatsSummary />

        {/* Second Row — Topic Heatmap + Session Panel side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-7">
            <HomeTopicHeatmap />
          </div>
          <div className="lg:col-span-5">
            <SessionPanel
              savedSessionInfo={savedSessionInfo}
              loadingSavedSession={loadingSavedSession}
              resuming={resuming}
              onResume={async () => {
                setResuming(true);
                try { await resumeSessionFromDb(); }
                catch (e) { toast.error(attemptErrorMessage(e)); }
                finally { setResuming(false); }
              }}
              onClear={() => { void clearSavedSession().catch(() => toast.error('לא הצלחנו למחוק את המפגש השמור. אפשר לנסות שוב.')); }}
              progress={progress}
              data={data}
              userId={userId}
            />
          </div>
        </div>

        {/* DB Status */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard variant="deep" label='סה"כ שאלות' value={<span className="text-xl font-bold matrix-text">{data.length}</span>} />
          <StatCard variant="deep" label="כוללות הסבר" color="text-success" labelColor="text-success/70" value={<span className="text-xl font-bold text-success matrix-text">{withExp}</span>} />
          <StatCard variant="deep" label="ללא הסבר" color="text-warning" labelColor="text-warning/70" value={<span className="text-xl font-bold text-warning matrix-text">{withoutExp}</span>} />
        </div>
      </div>

      {/* ═══ HEADER — centered, LTR ═══ */}
      <header className="flex justify-center" dir="ltr">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold text-foreground tracking-tight matrix-title">
            Let's Play A Game<span className="text-primary">...</span>
          </h2>
          <motion.img
            src={jigsawImg}
            alt="Jigsaw"
            className="w-10 h-10 object-contain drop-shadow-[0_0_12px_rgba(220,38,38,0.7)]"
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', repeatDelay: 3 }}
          />
        </div>
      </header>

      <PersonalStudyPanel />

      {/* ═══ FOCUS SESSIONS — 3 large cards ═══ */}
      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
        variants={containerVariant}
        initial="hidden"
        animate="visible"
      >
        <FocusCard
          icon={<PulseIcon><Sparkles className="w-7 h-7" /></PulseIcon>}
          title="Smart Practice"
          description="15 שאלות מהמאגר, נושאים חלשים ושאלות שהגיע זמנן קודם. בלי מה שענית ב-24 השעות האחרונות."
          onClick={handleSmartPractice}
          accentColor="#f59f0a"
        />
        <FocusCard
          icon={<RotateIcon><RefreshCcw className="w-7 h-7" /></RotateIcon>}
          title="בוחן אישי"
          description="בחר כמות שאלות ומועד הצגת הסברים. החזרה המרווחת משולבת בבחירה."
          onClick={() => navigate('setup-exam')}
          accentColor="#10b981"
        />
        <FocusCard
          icon={<SpinIcon><Timer className="w-7 h-7" /></SpinIcon>}
          title="מבחן סימולציה"
          description="120 שאלות, שאלות חדשות קודם, הסברים רק בסיום. הזמן הפעיל מתועד, ללא הגבלה."
          onClick={handleSimulation}
          accentColor="#6366f1"
        />
      </motion.div>
      {pending && (
        <div role="status" className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
          <p className="font-bold text-foreground">{pending.mode === 'practice' ? 'תרגול מהיר' : 'מבחן סימולציה'}</p>
          {pending.result.questions.length > 0 && <p className="text-muted-foreground">{compositionText(pending.result.composition)}</p>}
          <p className={pending.result.questions.length ? 'text-amber-600' : 'text-destructive'}>{shortageText(pending.result.shortage)}</p>
          <div className="flex flex-wrap gap-2">
            {pending.result.questions.length > 0 && (
              <button type="button" onClick={() => launch(pending.mode, pending.result, pending.snap)} className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold">
                התחל עם {pending.result.questions.length}
              </button>
            )}
            <button type="button" onClick={() => navigate(pending.mode === 'practice' ? 'setup-practice' : 'setup-exam')} className="px-3 py-1.5 rounded-lg border border-border font-bold">הגדרות מותאמות</button>
            <button type="button" onClick={() => setPending(null)} className="px-3 py-1.5 rounded-lg text-muted-foreground">ביטול</button>
          </div>
        </div>
      )}

      {/* ═══ SECONDARY CARDS — smaller, 2-3 cols ═══ */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-3 gap-3"
        variants={containerVariant}
        initial="hidden"
        animate="visible"
      >
        <SmallCard
          icon={<FlipIcon><Layers className="w-5 h-5" /></FlipIcon>}
          title="תרגול כרטיסיות"
          subtitle="בהמשך — עדיין לא זמין"
          disabled
        />
        <SmallCard
          icon={<BounceIcon><SlidersHorizontal className="w-5 h-5" /></BounceIcon>}
          title="תרגול מותאם"
          subtitle="בחר נושאים ומספר שאלות. מותר לחזור על שאלות."
          onClick={() => navigate('setup-practice')}
        />
        <SmallCard
          icon={<ShakeIcon><AlertCircle className="w-5 h-5" /></ShakeIcon>}
          title="חזרה על טעויות"
          subtitle={<><span className="text-primary font-medium">{mistakes}</span> טעויות פתוחות</>}
          onClick={() => { setSourceFilter('mistakes'); navigate('setup-practice'); }}
        />
        <SmallCard
          icon={<BeatIcon><Heart className="w-5 h-5" /></BeatIcon>}
          title="מועדפים"
          subtitle={<><span className="text-primary font-medium">{favsCount}</span> שאלות שסימנת</>}
          onClick={() => navigate('setup-practice')}
        />
        <SmallCard
          icon={<BookOpen className="w-5 h-5" />}
          title="המחברת שלי"
          subtitle={<><span className="text-primary font-medium">{notesCount}</span> הערות</>}
          onClick={() => navigate('notebook')}
        />
        <SmallCard
          icon={<BlinkIcon><Cpu className="w-5 h-5" /></BlinkIcon>}
          title="איך נבחרות השאלות?"
          subtitle="מה באמת קובע את הסדר"
          onClick={() => setAlgoOpen(o => !o)}
        />
      </motion.div>

      {/* ═══ ALGORITHM EXPLAINER ═══ */}
      <AnimatePresence>
        {algoOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            {/* Describes selectBounded + smartRank as they run. Keep in sync with selectionPolicy.ts / selectionSummary.ts. */}
            <div className="deep-tile p-6 space-y-3 text-sm text-muted-foreground leading-relaxed" dir="rtl">
              <p className="text-foreground font-medium">איך נבחרות השאלות בפועל</p>
              <ul className="list-disc pr-5 space-y-2">
                <li><span className="text-foreground">המאגר:</span> רק שאלות שזמינות לך, אחרי הסינון שבחרת (נושא, שנה, מקור, טעויות). אם חסר — מוצג כמה נמצאו, בלי השלמה שקטה.</li>
                <li><span className="text-foreground">בחירה אוטומטית (Smart Practice), בוחן וסימולציה:</span> שאלות שנענו ב-24 השעות האחרונות ושאלות שמתוזמנות לחזרה בעוד יותר משבוע לא נכנסות.</li>
                <li><span className="text-foreground">תרגול ידני (הגדרות תרגול, חזרה על טעויות):</span> מותר לחזור גם על שאלות שענית לאחרונה. נספר כלמידה, לא כציון בחינה.</li>
                <li><span className="text-foreground">בוחן וסימולציה:</span> קודם שאלות חדשות, אחריהן טעויות, אחריהן שאלות שהגיע זמן החזרה שלהן, ובסוף חזרות.</li>
                <li><span className="text-foreground">הסדר בתוך כל קבוצה</span> (ובתרגול — על כל המאגר הזמין): דחיפות החזרה המרווחת, חולשה בנושא, זמן מאז שתרגלת את הנושא, רצף טעויות, קרבה לבחינה ומשקל הנושא בבחינה. שוויון נשבר באקראי.</li>
                <li><span className="text-foreground">סימולציה:</span> 120 שאלות. חלוקת הנושאים לפי ההתפלגות ההיסטורית של הבחינה עדיין לא משולבת בבחירה. אין שעון ספירה לאחור ואין הגבלת זמן; הזמן הפעיל מתועד ומוצג, והמבחן לא נסגר אוטומטית.</li>
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ RESOURCE LINKS ═══ */}
      <ResourceLinksSection />

      {/* ═══ DAILY REPORT ═══ */}
      <button
        onClick={() => setReportOpen(true)}
        className="deep-tile w-full px-6 py-3 flex items-center justify-center gap-2 text-sm font-semibold text-primary"
      >
        <ClipboardList className="w-5 h-5" />
        דו״ח יומי
      </button>

      <DailyReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
