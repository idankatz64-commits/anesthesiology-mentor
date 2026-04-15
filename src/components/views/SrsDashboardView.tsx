import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useApp } from '@/contexts/AppContext';
import { useSrsDashboard } from '@/components/srs/useSrsDashboard';
import type { PendingQuestion, SessionFilter } from '@/components/srs/useSrsDashboard';
import { SrsStatsRow } from '@/components/srs/SrsStatsRow';
import { SrsDecayChart } from '@/components/srs/SrsDecayChart';
import { SrsTopicTable } from '@/components/srs/SrsTopicTable';
import { SrsChapterTable } from '@/components/srs/SrsChapterTable';
import { SrsActionPanel } from '@/components/srs/SrsActionPanel';
import { SrsQuestionsDrawer } from '@/components/srs/SrsQuestionsDrawer';
import { addDaysIsrael, getIsraelToday } from '@/lib/dateHelpers';
import type { Question } from '@/lib/types';

interface DrawerState {
  title: string;
  ids: Set<string>;
  filter: SessionFilter;
}

export function SrsDashboardView() {
  const { currentView, navigate, startSession, data: ctxQuestions } = useApp();
  const enabled = currentView === 'srs-dashboard';
  const data = useSrsDashboard(enabled);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const pendingUndosRef = useRef<Set<string>>(new Set());

  const questionMap = useMemo(
    () => new Map<string, Question>((ctxQuestions ?? []).map((q) => [q.id, q])),
    [ctxQuestions],
  );

  const drawerQuestions = drawer
    ? data.pendingQuestions.filter((q) => drawer.ids.has(q.id))
    : [];

  const poolFor = (filter: SessionFilter, smart: boolean): PendingQuestion[] => {
    let pool = data.pendingQuestions;
    if (filter.kind === 'topic') pool = pool.filter((q) => q.topic === filter.topic);
    if (filter.kind === 'chapter') pool = pool.filter((q) => q.chapter === filter.chapter);
    if (smart) pool = [...pool].sort((a, b) => b.daysOverdue - a.daysOverdue);
    return pool;
  };

  const startFromPool = (pool: PendingQuestion[], count: number | 'all', smart: boolean) => {
    if (questionMap.size === 0) {
      toast.error('השאלות עדיין נטענות — נסה שוב בעוד רגע');
      return;
    }
    const resolved = pool.map((pq) => questionMap.get(pq.id)).filter((q): q is Question => !!q);
    if (resolved.length === 0) {
      toast.error('לא נמצאו שאלות להתחיל סשן');
      return;
    }
    const n = count === 'all' ? resolved.length : Math.min(count, resolved.length);
    // smart mode: pre-slice top-N by urgency (pool is already sorted in poolFor), shuffle within.
    // non-smart: hand entire pool to startSession which will shuffle and slice to n.
    const selected = smart ? resolved.slice(0, n) : resolved;
    startSession(selected, n, 'practice');
  };

  const handleStartFromPanel = (filter: SessionFilter, count: number | 'all', smart: boolean) => {
    startFromPool(poolFor(filter, smart), count, smart);
  };

  const handleStartFromDrawer = () => {
    if (!drawer) return;
    const pool = data.pendingQuestions.filter((q) => drawer.ids.has(q.id));
    startFromPool(pool, 'all', false);
    setDrawer(null);
  };

  const handleMarkKnown = async (id: string) => {
    if (pendingUndosRef.current.has(id)) {
      toast.info('יש פעולה ממתינה לביטול — המתן לפני סימון חוזר');
      return;
    }
    const { data: u, error: authErr } = await supabase.auth.getUser();
    if (authErr || !u.user?.id) {
      toast.error('לא מחובר');
      return;
    }
    const userId = u.user.id;
    const pending = data.pendingQuestions.find((q) => q.id === id);
    const oldDate = pending?.nextReviewDate ?? getIsraelToday();
    const newDate = addDaysIsrael(getIsraelToday(), 30);

    if (drawer) {
      const newIds = new Set(drawer.ids);
      newIds.delete(id);
      setDrawer({ ...drawer, ids: newIds });
    }

    const { error } = await supabase
      .from('spaced_repetition')
      .update({ next_review_date: newDate })
      .eq('user_id', userId)
      .eq('question_id', id);

    if (error) {
      toast.error('שמירה נכשלה');
      await data.refresh();
      return;
    }

    pendingUndosRef.current.add(id);
    const clearPending = () => pendingUndosRef.current.delete(id);

    toast.success('סומן כידוע — נדחה ב-30 יום', {
      duration: 5000,
      onAutoClose: clearPending,
      onDismiss: clearPending,
      action: {
        label: 'בטל',
        onClick: async () => {
          clearPending();
          const { error: undoErr } = await supabase
            .from('spaced_repetition')
            .update({ next_review_date: oldDate })
            .eq('user_id', userId)
            .eq('question_id', id);
          if (undoErr) {
            toast.error('הביטול נכשל');
          } else {
            toast.success('בוטל');
          }
          await data.refresh();
        },
      },
    });
    await data.refresh();
  };

  if (data.loading) {
    return (
      <div className="p-6 text-center text-muted-foreground" dir="rtl">
        בטעינה…
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="p-6 text-red-600" dir="rtl">
        שגיאה: {data.error}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">חזרה מרווחת</h1>
        <button
          onClick={() => navigate('home')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          חזרה לבית
        </button>
      </div>

      <SrsStatsRow stats={data.stats} />
      <SrsDecayChart bins={data.decayBins} />
      <SrsActionPanel topics={data.topics} onStart={handleStartFromPanel} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SrsTopicTable
          topics={data.topics}
          onTopicClick={(topic) => {
            const ids = new Set(
              data.pendingQuestions.filter((q) => q.topic === topic).map((q) => q.id),
            );
            setDrawer({ title: `נושא: ${topic}`, ids, filter: { kind: 'topic', topic } });
          }}
        />
        <SrsChapterTable
          chapters={data.chapters}
          onChapterClick={(chapter) => {
            const ids = new Set(
              data.pendingQuestions.filter((q) => q.chapter === chapter).map((q) => q.id),
            );
            setDrawer({ title: `פרק ${chapter}`, ids, filter: { kind: 'chapter', chapter } });
          }}
        />
      </div>

      <SrsQuestionsDrawer
        open={!!drawer}
        title={drawer?.title ?? ''}
        questions={drawerQuestions}
        onClose={() => setDrawer(null)}
        onMarkKnown={handleMarkKnown}
        onStart={handleStartFromDrawer}
      />
    </div>
  );
}

export default SrsDashboardView;
