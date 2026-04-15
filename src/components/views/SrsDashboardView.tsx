import { useState } from 'react';
import { useApp } from '@/contexts/AppContext';
import { useSrsDashboard } from '@/components/srs/useSrsDashboard';
import { SrsStatsRow } from '@/components/srs/SrsStatsRow';
import { SrsDecayChart } from '@/components/srs/SrsDecayChart';
import { SrsTopicTable } from '@/components/srs/SrsTopicTable';
import { SrsChapterTable } from '@/components/srs/SrsChapterTable';
import { SrsActionPanel } from '@/components/srs/SrsActionPanel';
import { SrsQuestionsDrawer } from '@/components/srs/SrsQuestionsDrawer';

interface DrawerState {
  title: string;
  ids: Set<string>;
}

export function SrsDashboardView() {
  const { currentView, navigate } = useApp();
  const enabled = currentView === 'srs-dashboard';
  const data = useSrsDashboard(enabled);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const drawerQuestions = drawer
    ? data.pendingQuestions.filter((q) => drawer.ids.has(q.id))
    : [];

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
      <SrsActionPanel topics={data.topics} disabled />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SrsTopicTable
          topics={data.topics}
          onTopicClick={(topic) => {
            const ids = new Set(
              data.pendingQuestions.filter((q) => q.topic === topic).map((q) => q.id),
            );
            setDrawer({ title: `נושא: ${topic}`, ids });
          }}
        />
        <SrsChapterTable
          chapters={data.chapters}
          onChapterClick={(chapter) => {
            const ids = new Set(
              data.pendingQuestions.filter((q) => q.chapter === chapter).map((q) => q.id),
            );
            setDrawer({ title: `פרק ${chapter}`, ids });
          }}
        />
      </div>

      <SrsQuestionsDrawer
        open={!!drawer}
        title={drawer?.title ?? ''}
        questions={drawerQuestions}
        onClose={() => setDrawer(null)}
        markKnownDisabled
      />
    </div>
  );
}

export default SrsDashboardView;
