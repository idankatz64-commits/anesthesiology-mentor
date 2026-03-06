import { useState, useMemo } from 'react';
import { useApp } from '@/contexts/AppContext';
import { KEYS, type SessionMode } from '@/lib/types';
import { ChevronDown, Search, EyeOff } from 'lucide-react';

function MultiSelectDropdown({
  label,
  type,
  values,
}: {
  label: string;
  type: string;
  values: string[];
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
        className="w-full p-4 bg-card border border-border rounded-2xl text-right text-foreground text-sm font-medium flex justify-between items-center focus:outline-none focus:border-primary transition shadow-sm"
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
              className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition ${
                set.has('all') ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
              }`}
            >
              {set.has('all') ? '☑' : '☐'} הכל
            </div>
            {values.map(val => (
              <div
                key={val}
                onClick={() => toggleMultiSelect(type as any, val)}
                className={`p-3 rounded-lg cursor-pointer flex items-center gap-3 transition ${
                  set.has(val) ? 'bg-primary/10 text-primary font-bold' : 'text-foreground hover:bg-muted'
                }`}
              >
                {set.has(val) ? '☑' : '☐'} {val}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function SetupView({ mode }: { mode: SessionMode }) {
  const {
    data, progress, session, multiSelect,
    setSourceFilter, toggleUnseenOnly, getFilteredQuestions, startSession, navigate,
    toggleMultiSelect,
  } = useApp();

  const [count, setCount] = useState(10);
  const [serial, setSerial] = useState('');
  const [textSearch, setTextSearch] = useState('');

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

  const handleStart = () => {
    if (pool.length === 0) { alert('לא נמצאו שאלות תואמות לסינון.'); return; }
    startSession(pool, count, mode);
  };

  const isPractice = mode === 'practice';
  const title = isPractice ? 'הגדרות תרגול' : 'הגדרות בחינה';

  return (
    <div className="fade-in max-w-3xl mx-auto">
      <div className="mb-8 flex items-center gap-2 text-sm text-muted-foreground font-medium px-2">
        <span onClick={() => navigate('home')} className="cursor-pointer hover:text-primary transition">ראשי</span>
        <span>/</span>
        <span className="text-foreground">{title}</span>
      </div>

      <div className="soft-card bg-card border border-border p-10">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3 text-foreground">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary text-lg">
            {isPractice ? '📖' : '⏱️'}
          </div>
          {title}
        </h2>

        {/* Source Selection */}
        <div className="mb-10">
          <label className="block text-sm font-semibold text-foreground mb-3">מקור השאלות</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            {(['all', 'mistakes', 'fixed', 'favorites'] as const).map(src => (
              <button
                key={src}
                onClick={() => setSourceFilter(src)}
                className={`p-4 border rounded-2xl text-sm font-medium transition ${
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
            className={`w-full p-4 border rounded-2xl text-sm font-medium transition flex items-center justify-center gap-2 ${
              session.unseenOnly
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-card text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            <EyeOff className="w-4 h-4" />
            שאלות חדשות בלבד (טרם נצפו) {session.unseenOnly ? '(פעיל)' : ''}
          </button>
        </div>

        {/* Filters */}
        <div className="space-y-6 mb-12">
          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 tracking-wide">חיפוש חופשי</label>
            <div className="relative">
              <input
                type="text"
                value={textSearch}
                onChange={e => setTextSearch(e.target.value)}
                placeholder="חפש תרופה, מחלה או מושג..."
                className="w-full p-4 pl-12 bg-muted border border-border rounded-2xl outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition text-foreground placeholder-muted-foreground"
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
                className="w-full p-4 bg-muted border border-border rounded-2xl outline-none focus:border-primary transition text-foreground placeholder-muted-foreground"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-muted-foreground uppercase mb-2 tracking-wide">כמות שאלות</label>
            <input
              type="number"
              min={1}
              max={150}
              value={count}
              onChange={e => setCount(parseInt(e.target.value) || 10)}
              className="w-full p-4 bg-muted border border-border rounded-2xl outline-none focus:border-primary transition font-bold text-foreground text-lg"
            />
          </div>

          <div className={`text-center text-sm font-bold p-3 rounded-xl border ${
            pool.length > 0
              ? 'text-primary bg-primary/10 border-primary/20'
              : 'text-destructive bg-destructive/10 border-destructive/20'
          }`}>
            נמצאו {pool.length} שאלות זמינות
          </div>
        </div>

        <button
          onClick={handleStart}
          className="w-full bg-gradient-to-r from-[hsl(25,95%,53%)] to-[hsl(30,93%,58%)] text-primary-foreground font-semibold text-lg py-5 rounded-2xl shadow-lg transition transform active:scale-[0.99] flex items-center justify-center gap-3"
        >
          התחל {isPractice ? 'תרגול' : 'בחינה'} ←
        </button>
      </div>
    </div>
  );
}
