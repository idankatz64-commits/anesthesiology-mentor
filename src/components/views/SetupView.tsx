import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type SessionMode } from '@/lib/types';
import { ChevronDown, Search, EyeOff } from 'lucide-react';
import { selectSmartQuestions, SESSION_SIZE_CONFIG, type SessionSize } from '@/lib/smartSelection';

function MultiSelectDropdown({
  label,
  type,
  values,
  labelMap,
}: {
  label: string;
  type: string;
  values: string[];
  labelMap?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);
  const { multiSelect, toggleMultiSelect } = useApp();
  const set = multiSelect[type as keyof typeof multiSelect];

  const displayLabel = set.has('all')
    ? label
    : `${set.size} נבחרו`;

  return (
    <div className="relative">
      <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 tracking-wide">{label}</label>
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 bg-card border border-border rounded-2xl text-right text-foreground text-sm font-medium flex justify-between items-center focus:outline-none focus:border-primary transition-all duration-200 shadow-sm"
      >
        <span>{displayLabel}</span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 w-full bg-card border border-border shadow-xl rounded-2xl mt-2 max-h-60 overflow-y-auto p-2">
            <div
              onClick={() => { toggleMultiSelect(type as any, 'all'); }}
              className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-200 ${
                set.has('all') ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
              }`}
            >
              {set.has('all') ? '☑' : '☐'} הכל
            </div>
            {values.map(val => (
              <div
                key={val}
                onClick={() => toggleMultiSelect(type as any, val)}
                className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition-all duration-200 ${
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

  const [sessionSize, setSessionSize] = useState<SessionSize>('regular');
  const count = SESSION_SIZE_CONFIG[sessionSize].count;
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
      const srsData = await fetchSrsData();
      const smartPool = selectSmartQuestions(pool, count, sessionSize, srsData, progress.history, data);
      startSession(smartPool, smartPool.length, mode);
    } catch (e) {
      console.error('Smart selection failed, falling back to random:', e);
      startSession(pool, count, mode);
    } finally {
      setStarting(false);
    }
  };

  const isPractice = mode === 'practice';
  const title = isPractice ? 'הגדרות תרגול' : 'הגדרות בחינה';

  return (
    <div className="fade-in max-w-3xl mx-auto">
      <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground font-medium px-2">
        <span onClick={() => navigate('home')} className="cursor-pointer hover:text-primary transition-all duration-200">ראשי</span>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </div>

      <div className="deep-tile p-10">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-foreground">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg">
            {isPractice ? '📖' : '⏱️'}
          </div>
          {title}
        </h2>

        {/* Section 1: מקור שאלות */}
        <div className="bg-muted/30 rounded-2xl p-6 mb-8">
          <h3 className="text-sm font-bold text-foreground mb-4">מקור שאלות</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {(['all', 'mistakes', 'fixed', 'favorites'] as const).map(src => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`p-4 border rounded-2xl text-sm font-medium transition-all duration-200 ${
                  session.sourceFilter === src
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {src === 'all' ? 'כל המאגר' : src === 'mistakes' ? 'הטעויות שלי' : src === 'fixed' ? 'שאלות שתוקנו' : 'מועדפים ⭐'}
              </button>
            ))}
          </div>

          <button
            onClick={toggleUnseenOnly}
            className={`w-full p-4 border rounded-2xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
              session.unseenOnly
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            <EyeOff className="w-4 h-4" />
            שאלות חדשות בלבד (טרם נצפו) {session.unseenOnly ? '(פעיל)' : ''}
          </button>
        </div>

        {/* Section 2: סינון מתקדם */}
        <div className="bg-muted/30 rounded-2xl p-6 mb-8">
          <h3 className="text-sm font-bold text-foreground mb-4">סינון מתקדם</h3>
          <div className="space-y-8">
            <div>
              <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 tracking-wide">חיפוש חופשי</label>
              <div className="relative">
                <input
                  type="text"
                  value={textSearch}
                  onChange={e => setTextSearch(e.target.value)}
                  placeholder="חפש תרופה, מחלה או מושג..."
                  className="w-full p-4 pl-12 bg-muted border border-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all duration-200 text-foreground placeholder-muted-foreground"
                />
                <Search className="absolute left-5 top-5 w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MultiSelectDropdown label="נושא (Topic)" type="topic" values={topics} />
              <MultiSelectDropdown label="סוג (Kind)" type="kind" values={kinds} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MultiSelectDropdown label="שנה (Year)" type="year" values={years} />
              <MultiSelectDropdown label="מוסד (Institution)" type="institution" values={institutions} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <MultiSelectDropdown label="תיוג (Tags)" type="usertags" values={userTags} />
              <MultiSelectDropdown 
                label="ביטחון (Confidence)" 
                type="confidence" 
                values={['confident', 'hesitant', 'guessed']} 
                labelMap={confidenceLabelMap}
              />
            </div>
            <div className="grid grid-cols-1 gap-6">
              <div>
                <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 tracking-wide">מס' סידורי</label>
                <input
                  type="text"
                  value={serial}
                  onChange={e => setSerial(e.target.value)}
                  placeholder="למשל: 120"
                  className="w-full p-4 bg-muted border border-border rounded-2xl outline-none focus:border-primary transition-all duration-200 text-foreground placeholder-muted-foreground"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: גודל מפגש */}
        <div className="bg-muted/30 rounded-2xl p-6 mb-8">
          <h3 className="text-sm font-bold text-foreground mb-4">כמה שאלות?</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {SESSION_SIZES.map(size => {
              const cfg = SESSION_SIZE_CONFIG[size];
              const isSelected = sessionSize === size;
              return (
                <button
                  key={size}
                  onClick={() => setSessionSize(size)}
                  className={`p-4 border rounded-2xl text-center transition-all duration-200 ${
                    isSelected
                      ? 'bg-primary/10 text-primary border-primary/30 ring-2 ring-primary/20'
                      : 'bg-card text-muted-foreground border-border hover:bg-muted'
                  }`}
                >
                  <div className="text-2xl mb-1">{cfg.emoji}</div>
                  <div className="font-bold text-sm">{cfg.label}</div>
                  <div className="text-xs font-semibold mt-1">{cfg.count} שאלות</div>
                  <div className="text-[10px] mt-2 leading-tight opacity-70">{cfg.desc}</div>
                </button>
              );
            })}
          </div>

          <div className={`text-center text-sm font-bold p-3 rounded-xl border mt-6 ${
            pool.length > 0
              ? 'text-primary bg-primary/10 border-primary/20'
              : 'text-destructive bg-destructive/10 border-destructive/20'
          }`}>
            נמצאו {pool.length} שאלות זמינות
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={starting}
          className="w-full bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(30,93%,58%)] text-primary-foreground font-semibold text-lg py-5 rounded-2xl shadow-lg transition-all duration-200 transform hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-3 disabled:opacity-60"
        >
          {starting ? 'מכין שאלות...' : `התחל ${isPractice ? 'תרגול' : 'בחינה'} ←`}
        </button>
      </div>
    </div>
  );
}
