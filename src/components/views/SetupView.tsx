import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type SessionMode } from '@/lib/types';
import { ChevronDown, Search, EyeOff, BookOpen, Calendar, Building2, Tag, Brain, Zap, ArrowRight, Clock, Hash, SlidersHorizontal, AlertTriangle } from 'lucide-react';
import { selectSmartQuestions, SESSION_SIZE_CONFIG, type SessionSize } from '@/lib/smartSelection';
import { motion } from 'framer-motion';

const sectionVariant = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 24, mass: 0.7 } },
};
const containerVariant = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

function MultiSelectDropdown({
  label,
  type,
  values,
  labelMap,
  icon,
}: {
  label: string;
  type: string;
  values: string[];
  labelMap?: Record<string, string>;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { multiSelect, toggleMultiSelect } = useApp();
  const set = multiSelect[type as keyof typeof multiSelect];

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
              onClick={() => { toggleMultiSelect(type as any, 'all'); }}
              className={`p-4 rounded-lg cursor-pointer flex items-center gap-3 text-base transition-all duration-200 border-b border-border/50 ${
                set.has('all') ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
              }`}
            >
              {set.has('all') ? '☑' : '☐'} הכל
            </div>
            {values.map((val, i) => (
              <div
                key={val}
                onClick={() => toggleMultiSelect(type as any, val)}
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

export default function SetupView({ mode }: { mode: SessionMode }) {
  const {
    data, progress, session, multiSelect,
    setSourceFilter, toggleUnseenOnly, getFilteredQuestions, startSession, navigate,
    toggleMultiSelect, fetchSrsData,
  } = useApp();

  const [sessionSize, setSessionSize] = useState<SessionSize | 'custom'>('regular');
  const [customCount, setCustomCount] = useState(30);
  const isCustom = sessionSize === 'custom';
  const count = isCustom ? customCount : SESSION_SIZE_CONFIG[sessionSize as SessionSize].count;
  const [serial, setSerial] = useState('');
  const [textSearch, setTextSearch] = useState('');
  const [starting, setStarting] = useState(false);

  const topics = useMemo(() => [...new Set(data.map(q => q[KEYS.TOPIC]).filter(Boolean))].sort(), [data]);
  const years = useMemo(() => [...new Set(data.map(q => q[KEYS.YEAR]).filter(Boolean))].sort(), [data]);
  const kinds = useMemo(() => [...new Set(data.map(q => q[KEYS.KIND]).filter(x => x && x.trim()))].sort(), [data]);
  const institutions = useMemo(() => [...new Set(data.map(q => q[KEYS.SOURCE]).filter(x => x && x !== 'N/A' && x.trim()))].sort(), [data]);
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

  const pool = getFilteredQuestions(serial, textSearch);

  const handleStart = async () => {
    if (pool.length === 0) { alert('לא נמצאו שאלות תואמות לסינון.'); return; }
    setStarting(true);
    try {
      if (isCustom) {
        // Custom mode — random selection, no smart algorithm
        startSession(pool, customCount, mode);
      } else {
        const srsData = await fetchSrsData();
        const smartPool = selectSmartQuestions(pool, count, sessionSize as SessionSize, srsData, progress.history, data);
        startSession(smartPool, smartPool.length, mode);
      }
    } catch (e) {
      console.error('Smart selection failed, falling back to random:', e);
      startSession(pool, count, mode);
    } finally {
      setStarting(false);
    }
  };

  const isPractice = mode === 'practice';
  const title = isPractice ? 'הגדרות תרגול' : 'הגדרות בחינה';

  const estMinutes = Math.round(count * 1.4);

  return (
    <motion.div
      className="w-full p-4 lg:p-8 space-y-8"
      variants={containerVariant}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.section variants={sectionVariant}>
        <div className="flex items-center gap-3 mb-2">
          <div className="p-1.5 rounded-lg bg-primary text-primary-foreground">
            <BookOpen className="w-5 h-5" />
          </div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">{title}</h1>
        </div>
        <p className="text-muted-foreground">התאם את חוויית התרגול לצרכים שלך.</p>
      </motion.section>

      {/* Session Intensity */}
      <motion.section variants={sectionVariant} className="space-y-4">
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
          <div className="flex items-center gap-4 p-4 rounded-xl bg-accent/50 border border-accent">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-foreground whitespace-nowrap">מספר שאלות:</label>
              <input
                type="number"
                min={1}
                max={500}
                value={customCount}
                onChange={e => setCustomCount(Math.max(1, Math.min(500, Number(e.target.value) || 1)))}
                className="w-24 p-2.5 bg-background border border-border rounded-lg text-center text-foreground text-base font-bold focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
              <span>ללא אלגוריתם חכם — בחירה אקראית</span>
            </div>
          </div>
        )}
      </motion.section>

      {/* Source Filter Pills */}
      <motion.section variants={sectionVariant} className="space-y-4">
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
      </motion.section>

      {/* Free text search */}
      <motion.section variants={sectionVariant} className="space-y-4">
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
      </motion.section>

      {/* Filters Grid */}
      <motion.section variants={sectionVariant} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
      </motion.section>

      {/* Bottom Action Bar */}
      <motion.div variants={sectionVariant} className="pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-6">
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
          </div>
        </div>
        <button
          onClick={handleStart}
          disabled={starting || pool.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-black text-lg px-12 py-4 rounded-xl shadow-2xl shadow-primary/30 flex items-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed group"
        >
          {starting ? 'מכין שאלות...' : `התחל ${isPractice ? 'תרגול' : 'בחינה'}`}
          <ArrowRight className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </button>
      </motion.div>
    </motion.div>
  );
}
