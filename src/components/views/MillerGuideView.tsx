import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, BookOpen, Search, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';

// ── Types ──────────────────────────────────────────────────────────────────

interface ChapterContent {
  chapter_number: number;
  chapter_title: string;
  content_md: string | null;
  keywords_md: string | null;
  last_synced_at: string;
}

interface ChapterGap {
  chapter_number: number;
  chapter_title: string;
  severity: 'CRITICAL' | 'MODERATE' | 'MINOR' | null;
  severity_reason: string | null;
  missing_topics: string[] | null;
  missing_drugs: string[] | null;
  missing_clinical_pearls: string[] | null;
  missing_numbers: string[] | null;
  summary_he: string | null;
  generated_at: string;
}

type TabId = 'notes' | 'gaps';

const SEV_ICON: Record<string, string> = {
  CRITICAL: '🔴',
  MODERATE: '🟡',
  MINOR:    '🟢',
};

const SEV_LABEL: Record<string, string> = {
  CRITICAL: 'קריטי',
  MODERATE: 'בינוני',
  MINOR:    'מינורי',
};

const SEV_CLASSES: Record<string, string> = {
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/20',
  MODERATE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  MINOR:    'bg-green-500/10 text-green-400 border-green-500/20',
};

// ── Main Component ─────────────────────────────────────────────────────────

export default function MillerGuideView() {
  const [chapters, setChapters] = useState<ChapterContent[]>([]);
  const [gaps, setGaps] = useState<Map<number, ChapterGap>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [openNum, setOpenNum] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('notes');

  useEffect(() => {
    const fetchData = async () => {
      const [contentRes, gapsRes] = await Promise.all([
        supabase
          .from('chapter_content')
          .select('chapter_number, chapter_title, content_md, keywords_md, last_synced_at')
          .order('chapter_number', { ascending: true }),
        supabase
          .from('chapter_gaps')
          .select('chapter_number, chapter_title, severity, severity_reason, missing_topics, missing_drugs, missing_clinical_pearls, missing_numbers, summary_he, generated_at'),
      ]);

      if (!contentRes.error) setChapters(contentRes.data ?? []);

      if (!gapsRes.error) {
        const gapMap = new Map<number, ChapterGap>();
        for (const g of (gapsRes.data ?? [])) {
          gapMap.set(g.chapter_number, g as ChapterGap);
        }
        setGaps(gapMap);
      }

      setLoading(false);
    };

    fetchData();
  }, []);

  const toggle = (num: number) => {
    if (openNum === num) {
      setOpenNum(null);
    } else {
      setOpenNum(num);
      setActiveTab('notes');
    }
  };

  const filtered = chapters.filter(ch =>
    ch.chapter_title.toLowerCase().includes(search.toLowerCase()) ||
    String(ch.chapter_number).includes(search)
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (chapters.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg font-medium">לא נמצאו פרקים</p>
        <p className="text-sm mt-1">הרץ את vault_to_supabase.py כדי לסנכרן את ה-Vault</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">מדריך Miller</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {chapters.length} פרקים · {gaps.size > 0 ? `${gaps.size} ניתוחי פערים` : 'ניתוח פערים טרם הופעל'}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חפש פרק לפי שם או מספר..."
          className="w-full pr-10 pl-4 py-2.5 rounded-xl bg-card border border-border text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition"
        />
      </div>

      {/* Chapter list */}
      <div className="space-y-2">
        {filtered.map(ch => {
          const gap = gaps.get(ch.chapter_number);
          const isOpen = openNum === ch.chapter_number;

          return (
            <div
              key={ch.chapter_number}
              className="glass-card rounded-xl border border-border overflow-hidden"
            >
              {/* Chapter row */}
              <button
                onClick={() => toggle(ch.chapter_number)}
                className="w-full flex items-center justify-between p-4 hover:bg-card/60 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary rounded-lg w-9 h-9 flex items-center justify-center flex-shrink-0 text-sm font-bold">
                    {ch.chapter_number}
                  </div>
                  <p className="font-medium text-foreground text-right text-sm leading-snug">
                    {ch.chapter_title}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 mr-2">
                  {gap?.severity && (
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${SEV_CLASSES[gap.severity]}`}>
                      {SEV_ICON[gap.severity]} {SEV_LABEL[gap.severity]}
                    </span>
                  )}
                  {isOpen
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  }
                </div>
              </button>

              {/* Expanded detail */}
              <AnimatePresence>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-border">
                      {/* Tabs */}
                      <div className="flex border-b border-border px-4">
                        {(['notes', 'gaps'] as TabId[]).map(tab => (
                          <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`py-2.5 px-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                              activeTab === tab
                                ? 'border-primary text-primary'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                          >
                            {tab === 'notes' ? '📝 הערות' : '🔍 פערים'}
                          </button>
                        ))}
                      </div>

                      {/* Tab content */}
                      <div className="p-4">
                        {activeTab === 'notes' && (
                          <NotesTab content={ch.content_md} syncedAt={ch.last_synced_at} />
                        )}
                        {activeTab === 'gaps' && (
                          <GapsTab gap={gap} />
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && search && (
        <p className="text-center text-muted-foreground py-8">לא נמצאו פרקים עבור &quot;{search}&quot;</p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function NotesTab({ content, syncedAt }: { content: string | null; syncedAt: string }) {
  if (!content) {
    return <p className="text-sm text-muted-foreground">אין תוכן זמין לפרק זה.</p>;
  }

  const synced = new Date(syncedAt).toLocaleDateString('he-IL');

  return (
    <div>
      <div className="prose prose-sm prose-invert max-w-none text-foreground leading-relaxed
        [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2
        [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-primary
        [&_h3]:text-sm [&_h3]:font-medium [&_h3]:mt-2 [&_h3]:mb-1
        [&_li]:text-sm [&_li]:mb-0.5
        [&_p]:text-sm [&_p]:mb-2
        [&_strong]:text-foreground [&_strong]:font-semibold
        [&_a]:text-primary [&_a]:no-underline
        [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_code]:text-xs">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
      <p className="text-xs text-muted-foreground mt-4 pt-2 border-t border-border">
        סונכרן לאחרונה: {synced}
      </p>
    </div>
  );
}

function GapsTab({ gap }: { gap: ChapterGap | undefined }) {
  if (!gap) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <AlertCircle className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium">ניתוח פערים טרם הופעל לפרק זה</p>
        <p className="text-xs mt-1">הרץ: <code className="bg-muted px-1 rounded">python3 gap_analysis_orchestrator.py --chapter N --csv --output supabase</code></p>
      </div>
    );
  }

  const sections: { key: keyof ChapterGap; label: string; icon: string }[] = [
    { key: 'missing_topics',          label: 'נושאים חסרים',          icon: '📚' },
    { key: 'missing_drugs',           label: 'תרופות חסרות',          icon: '💊' },
    { key: 'missing_clinical_pearls', label: 'נקודות קליניות חסרות',  icon: '⚡' },
    { key: 'missing_numbers',         label: 'ערכים/ספים חסרים',      icon: '🔢' },
  ];

  return (
    <div className="space-y-4">
      {/* Severity header */}
      {gap.severity && (
        <div className={`flex items-start gap-2 p-3 rounded-lg border ${SEV_CLASSES[gap.severity]}`}>
          <span className="text-lg">{SEV_ICON[gap.severity]}</span>
          <div>
            <p className="text-sm font-semibold">{SEV_LABEL[gap.severity]}</p>
            {gap.severity_reason && (
              <p className="text-xs mt-0.5 opacity-80">{gap.severity_reason}</p>
            )}
          </div>
        </div>
      )}

      {/* Gap sections */}
      {sections.map(({ key, label, icon }) => {
        const items = gap[key] as string[] | null;
        if (!items?.length) return null;
        return (
          <div key={key}>
            <h4 className="text-sm font-semibold text-foreground mb-2">{icon} {label}</h4>
            <ul className="space-y-1">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary mt-0.5 flex-shrink-0">▸</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {/* Summary */}
      {gap.summary_he && (
        <div className="bg-muted/40 rounded-lg p-3">
          <p className="text-xs font-semibold text-foreground mb-1">📋 הערכה כוללת</p>
          <p className="text-sm text-muted-foreground leading-relaxed">{gap.summary_he}</p>
        </div>
      )}

      <p className="text-xs text-muted-foreground pt-1 border-t border-border">
        נוצר: {new Date(gap.generated_at).toLocaleDateString('he-IL')}
      </p>
    </div>
  );
}
